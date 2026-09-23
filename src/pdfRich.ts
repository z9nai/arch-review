// Einfaches Markdown (Absätze, Aufzählungen, **fett**, *kursiv*, `Code`,
// Überschriften, Links) für den PDF-Export — plus Symbole/Pfeile (⚠ → ↔ ≥ ☐ …),
// die die PDF-Standardschriften (nur WinAnsi/Latin-1) nicht kodieren können:
// Solche Zeichen kommen aus einer eingebetteten Unicode-Schrift (DejaVu Sans,
// nur die benutzten Glyphen), der übrige Text bleibt in Helvetica.
import fontkit from '@pdf-lib/fontkit';
import dejavuUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import { PDFDocument, PDFFont, PDFPage, RGB, StandardFonts, rgb } from 'pdf-lib';

export type RichFonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  mono: PDFFont;
  symbol: PDFFont | null;
  hasSymbol: (cp: number) => boolean;
};

type Style = 'regular' | 'bold' | 'italic' | 'mono';
type Run = { text: string; font: PDFFont; dx: number; color?: RGB };
export type RichLine = { runs: Run[]; gap: number; width: number };

const WARN = rgb(0.85, 0.5, 0.05);

export async function embedRichFonts(doc: PDFDocument): Promise<RichFonts> {
  const [regular, bold, italic, mono] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.Courier),
  ]);
  let symbol: PDFFont | null = null;
  let hasSymbol: (cp: number) => boolean = () => false;
  try {
    const bytes = new Uint8Array(await (await fetch(dejavuUrl)).arrayBuffer());
    doc.registerFontkit(fontkit);
    symbol = await doc.embedFont(bytes, { subset: true });
    const face = fontkit.create(bytes);
    hasSymbol = cp => face.hasGlyphForCodePoint(cp);
  } catch (e) {
    console.error('[arch-review] Symbolschrift nicht ladbar — Symbole entfallen im PDF:', e);
  }
  return { regular, bold, italic, mono, symbol, hasSymbol };
}

const WIN_ANSI = /[ -~ -ÿŒœŠšŸŽžƒ–—‘’‚“”„†‡•…‰‹›€™]/;

// Emoji-Varianten-Selektoren und Joiner tragen nichts zur Darstellung bei
const normalize = (s: string) => s.replace(/[︎️‍]/g, '').replace(/\t/g, '    ');

// Inline-Markdown in Segmente zerlegen
const inline = (text: string, base: Style): { text: string; style: Style }[] => {
  const out: { text: string; style: Style }[] = [];
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\s](?:[^*]*[^*\s])?)\*(?![\w*])/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), style: base });
    if (m[1] ?? m[2]) out.push({ text: (m[1] ?? m[2])!, style: 'bold' });
    else if (m[3]) out.push({ text: m[3], style: 'mono' });
    else if (m[4]) out.push({ text: `${m[4]} (${m[5]})`, style: base });
    else if (m[6]) out.push({ text: m[6], style: base === 'bold' ? 'bold' : 'italic' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), style: base });
  return out;
};

type Piece = { text: string; font: PDFFont; color?: RGB };
type Word = { pieces: Piece[]; space: boolean };

const toWords = (segs: { text: string; style: Style }[], f: RichFonts): Word[] => {
  const words: Word[] = [];
  let cur: Word | null = null;
  let pendingSpace = false;
  for (const seg of segs) {
    const styleFont = f[seg.style];
    for (const ch of seg.text) {
      if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } pendingSpace = true; continue; }
      let font = styleFont;
      let color: RGB | undefined;
      if (!WIN_ANSI.test(ch)) {
        const cp = ch.codePointAt(0)!;
        if (f.symbol && f.hasSymbol(cp)) { font = f.symbol; if (cp === 0x26a0) color = WARN; }
        else continue; // z. B. farbige Emoji ohne Glyphe: weglassen statt «?»
      }
      if (!cur) { cur = { pieces: [], space: pendingSpace && words.length > 0 }; pendingSpace = false; }
      const p = cur.pieces[cur.pieces.length - 1];
      if (p && p.font === font && p.color === color) p.text += ch;
      else cur.pieces.push({ text: ch, font, color });
    }
  }
  if (cur) words.push(cur);
  return words;
};

const pieceW = (p: Piece, size: number) => p.font.widthOfTextAtSize(p.text, size);
const wordW = (w: Word, size: number) => w.pieces.reduce((s, p) => s + pieceW(p, size), 0);

// Überlange Wörter (URLs, Pfade) zeichenweise umbrechen
const splitLong = (w: Word, size: number, maxW: number): Word[] => {
  const out: Word[] = [];
  let cur: Word = { pieces: [], space: w.space };
  let curW = 0;
  for (const p of w.pieces) {
    for (const ch of p.text) {
      const cw = p.font.widthOfTextAtSize(ch, size);
      if (curW + cw > maxW && cur.pieces.length) { out.push(cur); cur = { pieces: [], space: false }; curW = 0; }
      const last = cur.pieces[cur.pieces.length - 1];
      if (last && last.font === p.font && last.color === p.color) last.text += ch;
      else cur.pieces.push({ text: ch, font: p.font, color: p.color });
      curW += cw;
    }
  }
  if (cur.pieces.length) out.push(cur);
  return out;
};

// Wörter auf Zeilen verteilen; indent = Einzug der Folgezeilen (hängend)
const flow = (words: Word[], f: RichFonts, size: number, width: number, firstWidth: number, lead: Piece[] = [], indent = 0): RichLine[] => {
  const spaceW = f.regular.widthOfTextAtSize(' ', size);
  const lines: RichLine[] = [];
  let runs: Run[] = [];
  let x = 0;
  const startLine = (first: boolean) => {
    runs = []; x = 0;
    if (first && lead.length) {
      for (const p of lead) { runs.push({ ...p, dx: x }); x += pieceW(p, size); }
      x = indent;
    } else if (!first) x = indent;
  };
  startLine(true);
  const limit = () => (lines.length === 0 ? firstWidth : width);
  const place = (w: Word) => {
    for (const p of w.pieces) { runs.push({ text: p.text, font: p.font, color: p.color, dx: x }); x += pieceW(p, size); }
  };
  let lineHasWord = false;
  for (const word of words) {
    const ww = wordW(word, size);
    const avail = limit() - indent;
    const parts = ww > avail ? splitLong(word, size, avail) : [word];
    for (const part of parts) {
      const pw = wordW(part, size);
      const gapW = lineHasWord && part.space ? spaceW : 0;
      if (lineHasWord && x + gapW + pw > limit()) {
        lines.push({ runs, gap: 0, width: x });
        startLine(false);
        lineHasWord = false;
      } else x += gapW;
      place(part);
      lineHasWord = true;
    }
  }
  if (lineHasWord || runs.length) lines.push({ runs, gap: 0, width: x });
  return lines;
};

export function layoutRich(text: string, f: RichFonts, opts: {
  size: number; width: number; firstWidth?: number; bold?: boolean; plain?: boolean;
}): RichLine[] {
  const { size, width } = opts;
  const base: Style = opts.bold ? 'bold' : 'regular';
  const src = normalize(text ?? '');
  if (opts.plain) {
    const lines = flow(toWords([{ text: src.replace(/\r?\n/g, ' '), style: base }], f), f, size, width, opts.firstWidth ?? width);
    return lines.length ? lines : [{ runs: [], gap: 0, width: 0 }];
  }
  const out: RichLine[] = [];
  let gap = 0;
  let firstWidth = opts.firstWidth ?? width;
  const bulletIndent = size * 1.1;
  for (const raw of src.split(/\r?\n/)) {
    if (!raw.trim()) { if (out.length) gap = size * 0.5; continue; }
    let lines: RichLine[];
    const bullet = raw.match(/^(\s*)[-*•]\s+(.*)$/);
    const numbered = raw.match(/^(\s*)(\d+[.)])\s+(.*)$/);
    const heading = raw.match(/^#{1,6}\s+(.*)$/);
    if (bullet || numbered) {
      const lvl = Math.min(3, Math.floor((bullet ?? numbered)![1].replace(/\t/g, '  ').length / 2));
      const off = lvl * bulletIndent;
      const marker = bullet ? '•' : numbered![2];
      const body = bullet ? bullet[2] : numbered![3];
      const markW = Math.max(bulletIndent, f.regular.widthOfTextAtSize(marker + ' ', size));
      const w = toWords(inline(body, base), f);
      lines = flow(w, f, size, width, firstWidth, [{ text: marker, font: opts.bold ? f.bold : f.regular }], off + markW);
      // Marker um den Ebenen-Einzug verschieben
      if (lines[0]) lines[0].runs[0].dx = off;
    } else if (heading) {
      lines = flow(toWords(inline(heading[1], 'bold'), f), f, size, width, firstWidth);
      if (out.length) gap = Math.max(gap, size * 0.4);
    } else {
      lines = flow(toWords(inline(raw.trim(), base), f), f, size, width, firstWidth);
    }
    if (lines[0]) lines[0].gap = gap;
    gap = 0;
    firstWidth = width;
    out.push(...lines);
  }
  return out.length ? out : [{ runs: [], gap: 0, width: 0 }];
}

export function drawRichLine(page: PDFPage, line: RichLine, x: number, y: number, size: number, color: RGB) {
  for (const r of line.runs) {
    if (r.text) page.drawText(r.text, { x: x + r.dx, y, size, font: r.font, color: r.color ?? color });
  }
}

// Einzeilig (Titel, Badges, Fusszeile): Breite messen bzw. zeichnen
export function richWidth(text: string, f: RichFonts, size: number, bold = false): number {
  return layoutRich(text, f, { size, width: Infinity, bold, plain: true })[0].width;
}
export function drawRichText(page: PDFPage, text: string, f: RichFonts, x: number, y: number, size: number, opts: { bold?: boolean; color?: RGB } = {}) {
  const line = layoutRich(text, f, { size, width: Infinity, bold: opts.bold, plain: true })[0];
  drawRichLine(page, line, x, y, size, opts.color ?? rgb(0, 0, 0));
}
