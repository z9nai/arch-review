// Offene Fragen als ausfüllbares PDF-Formular (AcroForm) — rein clientseitig
// über pdf-lib (mitgebundelt, eigener Lazy-Chunk, keine Netzwerkzugriffe).
// Die Feldnamen sind stabil aufgebaut (`themeId::frageId::teil`), damit ein
// ausgefülltes PDF wieder importiert werden kann (readAnswersPdf).
// Fliesstext (Beschrieb, Bemerkungen, Hinweise …) läuft über pdfRich:
// Markdown (Absätze, Aufzählungen, **fett**, `Code`) und Symbole (⚠ → ↔ …).
import { ReportTemplate } from './types';
import { formatTables, splitRemarks, splitRow, tableHead, type TableAlign } from './richText';
import {
  AnnotationFlags,
  PDFDocument,
  PDFPage,
  PDFEmbeddedPage,
  PDFCheckBox,
  PDFDropdown,
  PDFTextField,
  PDFName,
  PDFString,
  RGB,
  rgb,
} from 'pdf-lib';
import { RichFonts, drawRichLine, drawRichText, embedRichFonts, layoutRich, richWidth } from './pdfRich';

export type PdfQuestion = {
  fieldKey: string; // `${themeId}::${questionId}`
  number: string;
  text: string;
  hint?: string;
  kind: 'yesNo' | 'text' | 'choice';
  options?: string[];
  /** bereits erfasste Bemerkung — vorausgefüllt zum Bestätigen oder Ergänzen */
  remarks?: string;
};

export type PdfSection = { heading: string; questions: PdfQuestion[] };

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 54;
const CONTENT_W = A4[0] - 2 * MARGIN;

const BLACK = rgb(0, 0, 0);
const DARK = rgb(0.2, 0.2, 0.2);
const GRAY = rgb(0.42, 0.42, 0.42);
const LIGHT = rgb(0.75, 0.75, 0.75);
const FIELD_BG = rgb(0.965, 0.965, 0.985);
const FIELD_BORDER = rgb(0.65, 0.65, 0.7);
const TABLE_RULE = rgb(0.72, 0.72, 0.76);
const HEAD_BG = rgb(0.92, 0.92, 0.95);
const RESERVE_BG = rgb(0.985, 0.985, 0.995);

// Formularfelder (Dropdown-Optionen) rendert der Viewer mit Helvetica — dort
// nur WinAnsi (Latin-1 + CP1252-Zusatzzeichen) zulassen.
const clean = (s: string): string =>
  s.replace(/[︎️‍]/g, '')
    .replace(/[^\x20-\xFFŒœŠšŸŽžƒ–—‘’‚“”„†‡•…‰‹›€™]/g, '?');

// Text für ein Formularfeld: Das Feld rendert der Viewer mit Helvetica — Symbole
// ausserhalb WinAnsi lesbar ersetzen statt «?». Gleiche Umwandlung beim Einlesen,
// damit eine unverändert zurückgeschickte Bemerkung als unverändert erkannt wird.
// Schrift in den Formularfeldern: kleiner als der Fragetext (9.5), wie die Hilfe (8);
// ganzzahlig, weil macOS Vorschau (PDFKit) Bruchteile rundet
const FIELD_SIZE = 8;

const FIELD_SUBST: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=', '≥': '>=', '≤': '<=', '≠': '!=',
  '✓': 'OK', '✔': 'OK', '✗': 'x', '✘': 'x', '⚠': '(!)', '☐': '[ ]', '☑': '[x]', '☒': '[x]',
};
export const toFieldText = (s: string): string =>
  s.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/[︎️‍]/g, '').replace(/./gu, c => FIELD_SUBST[c] ?? c)
    .replace(/[^\n\x20-\xFFŒœŠšŸŽžƒ–—‘’‚“”„†‡•…‰‹›€™]/g, '?');

type RichOpts = { color?: RGB; x?: number; width?: number; bold?: boolean; plain?: boolean };

// Seitenfluss für mehrzeiligen Fliesstext (y wandert nach unten, Umbruch via ensure)
class Flow {
  y: number;
  constructor(public page: PDFPage, y: number, private F: RichFonts,
    private x0: number, private w0: number, private bottom: number,
    private newPage: () => { page: PDFPage; y: number }) { this.y = y; }

  ensure(needed: number) {
    if (this.y - needed < this.bottom) {
      const n = this.newPage();
      this.page = n.page;
      this.y = n.y;
    }
  }

  text(text: string, size: number, lineH: number, o: RichOpts = {}) {
    const lines = layoutRich(text, this.F, { size, width: o.width ?? this.w0, bold: o.bold, plain: o.plain });
    lines.forEach((ln, i) => {
      const page = this.page;
      // Tabellenzeile (alle ihre Textzeilen) nicht über einen Seitenumbruch verteilen
      let need = lineH + ln.gap;
      if (ln.table?.rowStart) for (let j = i; !lines[j].table?.rowEnd && j + 1 < lines.length; j++) need += lineH + lines[j + 1].gap;
      this.ensure(need);
      this.y -= lineH + ln.gap;
      drawRichLine(this.page, ln, o.x ?? this.x0, this.y, size, o.color ?? BLACK, lineH, this.page !== page);
    });
  }

  line(text: string, x: number, size: number, o: { bold?: boolean; color?: RGB } = {}) {
    drawRichText(this.page, text, this.F, x, this.y, size, o);
  }
}

export async function buildOpenQuestionsPdf(opts: {
  projectName: string;
  milestoneTitle: string;
  intro: string[];
  sections: PdfSection[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Offene Fragen ${opts.milestoneTitle} — ${opts.projectName}`);
  const form = doc.getForm();
  const F = await embedRichFonts(doc);
  const helv = F.regular;

  const f = new Flow(doc.addPage(A4), A4[1] - MARGIN, F, MARGIN, CONTENT_W, MARGIN,
    () => ({ page: doc.addPage(A4), y: A4[1] - MARGIN }));

  const fieldOpts = { borderColor: FIELD_BORDER, borderWidth: 0.8, backgroundColor: FIELD_BG };
  const fieldLineH = FIELD_SIZE * 1.25;

  // Höhe eines mehrzeiligen Textfelds nach dem vorausgefüllten Text (grob), plus Reserve zum Ergänzen
  const textFieldHeight = (text: string, minH: number, spare = 2) => {
    const perLine = Math.floor((CONTENT_W - 8) / (FIELD_SIZE * 0.5));
    const lines = text ? text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0) : 0;
    return Math.min(560, Math.max(minH, (lines + spare) * fieldLineH + 6));
  };
  const addTextField = (name: string, text: string, page: PDFPage, y: number, h: number, x = MARGIN, w = CONTENT_W,
    o: Partial<typeof fieldOpts> = fieldOpts) => {
    const tf = form.createTextField(name);
    tf.enableMultiline();
    if (text) tf.setText(text);
    tf.addToPage(page, { x, y, width: w, height: h, ...o });
    tf.setFontSize(FIELD_SIZE);
    return tf;
  };

  // Zeilen beim Umbruch in eine Spalte (Wortumbruch, überlange Wörter zeichenweise)
  const wrapCount = (text: string, width: number) => {
    let lines = 1;
    let x = 0;
    const space = helv.widthOfTextAtSize(' ', FIELD_SIZE);
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const w = helv.widthOfTextAtSize(word, FIELD_SIZE);
      if (x > 0 && x + space + w > width) { lines++; x = 0; }
      if (w > width) { lines += Math.ceil(w / width) - 1; x = w % width; }
      else x += (x > 0 ? space : 0) + w;
    }
    return lines;
  };

  // Tabelle mit festem, fettem Kopf und einem Feld je Datenzelle, dazu leere
  // Reservezeilen für neue Einträge. Kopf und Ausrichtung reisen als
  // verstecktes Feld `…::head` mit, damit der Rückimport die Tabelle wieder aufbaut.
  const RESERVE_ROWS = 2;
  const drawTableFields = (base: string, t: { header: string[]; align: TableAlign[]; rows: string[][] }) => {
    const n = t.header.length;
    const padX = 3;
    const padY = 3;
    // Viewer setzen Text im Feld mit Innenabstand und grösserem Zeilenabstand
    // (macOS Vorschau ~2 pt je Seite, ~1.45 × Schriftgrösse) — sonst wird abgeschnitten
    const inset = 8;
    const cellLineH = FIELD_SIZE * 1.45;
    const cells = t.rows.map(r => r.map(c => toFieldText(c)));
    const nat: number[] = Array(n).fill(0);
    const min: number[] = Array(n).fill(0);
    t.header.forEach((h, c) => {
      nat[c] = Math.max(nat[c], richWidth(h, F, FIELD_SIZE, true));
      for (const w of h.split(/\s+/).filter(Boolean)) min[c] = Math.max(min[c], richWidth(w, F, FIELD_SIZE, true));
    });
    for (const r of cells) {
      r.forEach((v, c) => {
        nat[c] = Math.max(nat[c], helv.widthOfTextAtSize(v, FIELD_SIZE) + inset);
        for (const w of v.split(/\s+/).filter(Boolean)) min[c] = Math.max(min[c], helv.widthOfTextAtSize(w, FIELD_SIZE) + inset);
      });
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const avail = CONTENT_W - n * 2 * padX;
    let inner: number[];
    // volle Breite: Platz zum Ändern; zu breit → Minimum (längstes Wort) plus Rest nach Bedarf
    if (sum(nat) <= avail) inner = nat.map(w => w + (avail - sum(nat)) * ((w || 1) / (sum(nat) || n)));
    else if (sum(min) <= avail) {
      const extra = avail - sum(min);
      const want = sum(nat) - sum(min) || 1;
      inner = min.map((m, c) => m + extra * (nat[c] - m) / want);
    } else inner = min.map(m => avail * m / sum(min));
    const xs = [MARGIN];
    for (const w of inner) xs.push(xs[xs.length - 1] + w + 2 * padX);

    const headLines = t.header.map((h, c) => layoutRich(h, F, { size: FIELD_SIZE, width: inner[c], bold: true }));
    const headH = Math.max(...headLines.map(l => l.length)) * fieldLineH + 2 * padY;
    const drawHead = () => {
      f.page.drawRectangle({ x: MARGIN, y: f.y - headH, width: xs[n] - MARGIN, height: headH, color: HEAD_BG });
      headLines.forEach((lines, c) => {
        lines.forEach((ln, k) => drawRichLine(f.page, ln, xs[c] + padX, f.y - padY - FIELD_SIZE * 0.85 - k * fieldLineH, FIELD_SIZE, BLACK));
        f.page.drawRectangle({ x: xs[c], y: f.y - headH, width: xs[c + 1] - xs[c], height: headH, borderColor: TABLE_RULE, borderWidth: 0.5 });
      });
      f.y -= headH;
    };
    f.ensure(headH + cellLineH + 2 * padY);
    // Kopf/Ausrichtung als verstecktes, schreibgeschütztes Feld
    const hf = form.createTextField(`${base}::head`);
    hf.enableMultiline();
    hf.setText(toFieldText(tableHead(t.header, t.align)));
    hf.addToPage(f.page, { x: MARGIN, y: f.y - 1, width: 1, height: 1, borderWidth: 0 });
    hf.enableReadOnly();
    for (const w of hf.acroField.getWidgets()) w.setFlagTo(AnnotationFlags.Hidden, true);
    drawHead();

    const rows = [...cells, ...Array.from({ length: RESERVE_ROWS }, () => Array(n).fill(''))];
    rows.forEach((r, ri) => {
      const lines = Math.max(...r.map((v, c) => (v ? wrapCount(v, inner[c] - inset) : 1)));
      const h = lines * cellLineH + 2 * padY;
      const page = f.page;
      f.ensure(h);
      if (f.page !== page) drawHead(); // Kopf auf der neuen Seite wiederholen
      r.forEach((v, c) => {
        const x = xs[c];
        const w = xs[c + 1] - x;
        f.page.drawRectangle({ x, y: f.y - h, width: w, height: h, borderColor: TABLE_RULE, borderWidth: 0.5 });
        addTextField(`${base}::r${ri}::c${c}`, v, f.page, f.y - h + 1, h - 2, x + 1, w - 2,
          { borderWidth: 0, backgroundColor: ri < cells.length ? FIELD_BG : RESERVE_BG });
      });
      f.y -= h;
    });
  };

  // Kopf
  f.text(`Offene Fragen ${opts.milestoneTitle}`, 14, 18, { bold: true, plain: true });
  f.y -= 4;
  f.text(`Projekt: ${opts.projectName}`, 10, 14, { color: GRAY, plain: true });
  f.y -= 6;
  for (const line of opts.intro) f.text(line, 9.5, 13, { color: GRAY });

  for (const section of opts.sections) {
    // Abschnitts-Titel nicht als Waise ans Seitenende setzen
    f.ensure(70);
    f.y -= 24;
    f.line(section.heading, MARGIN, 11, { bold: true });
    f.y -= 6;
    f.page.drawLine({ start: { x: MARGIN, y: f.y }, end: { x: MARGIN + CONTENT_W, y: f.y }, thickness: 0.6, color: LIGHT });

    for (const q of section.questions) {
      // Frage + Antwortbereich möglichst zusammenhalten
      f.ensure(96);
      f.y -= 16;

      // Nummer fett, Fragetext daneben (Folgezeilen volle Breite)
      const numW = richWidth(q.number, F, 9.5, true) + F.bold.widthOfTextAtSize(' ', 9.5);
      const qLines = layoutRich(q.text, F, { size: 9.5, width: CONTENT_W, firstWidth: CONTENT_W - numW });
      f.ensure(13);
      f.y -= 13;
      f.line(q.number, MARGIN, 9.5, { bold: true });
      drawRichLine(f.page, qLines[0], MARGIN + numW, f.y, 9.5, BLACK, 13);
      for (const ln of qLines.slice(1)) {
        const page = f.page;
        f.ensure(13 + ln.gap);
        f.y -= 13 + ln.gap;
        drawRichLine(f.page, ln, MARGIN, f.y, 9.5, BLACK, 13, f.page !== page);
      }
      if (q.hint) f.text(q.hint, 8, 11, { color: GRAY });
      f.y -= 6;

      if (q.kind === 'yesNo') {
        f.ensure(14);
        f.y -= 12;
        const ja = form.createCheckBox(`${q.fieldKey}::ja`);
        ja.addToPage(f.page, { x: MARGIN, y: f.y - 1, width: 11, height: 11, ...fieldOpts });
        f.page.drawText('Ja', { x: MARGIN + 16, y: f.y, size: 9.5, font: helv });
        const nein = form.createCheckBox(`${q.fieldKey}::nein`);
        nein.addToPage(f.page, { x: MARGIN + 60, y: f.y - 1, width: 11, height: 11, ...fieldOpts });
        f.page.drawText('Nein', { x: MARGIN + 76, y: f.y, size: 9.5, font: helv });
        f.y -= 6;
      } else if (q.kind === 'choice') {
        f.ensure(20);
        f.y -= 18;
        f.page.drawText('Antwort:', { x: MARGIN, y: f.y + 3, size: 8.5, font: helv, color: GRAY });
        const dd = form.createDropdown(`${q.fieldKey}::choice`);
        dd.addOptions((q.options ?? []).filter(Boolean).map(clean));
        dd.addToPage(f.page, { x: MARGIN + 48, y: f.y, width: 240, height: 16, ...fieldOpts });
        dd.setFontSize(FIELD_SIZE);
        f.y -= 6;
      }

      const label = (prefilled: boolean) =>
        `${q.kind === 'text' ? 'Antwort / Bemerkung' : 'Bemerkung'}${prefilled ? ' (bitte bestätigen oder ergänzen)' : ''}:`;
      const segs = q.remarks?.trim() ? splitRemarks(q.remarks.trim()) : [];

      if (!segs.some(sg => sg.kind === 'table')) {
        // ohne Tabelle: ein Textfeld wie bisher (Feldname `…::remarks`)
        const prefill = q.remarks?.trim() ? toFieldText(q.remarks.trim()) : '';
        const h = textFieldHeight(prefill, q.kind === 'text' ? 56 : 40);
        f.ensure(12 + h);
        f.y -= 12;
        f.page.drawText(label(!!prefill), { x: MARGIN, y: f.y, size: 8.5, font: helv, color: GRAY });
        f.y -= h + 4;
        addTextField(`${q.fieldKey}::remarks`, prefill, f.page, f.y, h);
        continue;
      }

      // mit Tabelle(n): Abschnitte je eigene Felder — Text als Textfeld, Tabelle
      // gezeichnet mit einem Feld je Zelle (`…::remarks::<abschnitt>::text` bzw. `::r<z>::c<s>`)
      f.ensure(40);
      f.y -= 12;
      f.page.drawText(label(true), { x: MARGIN, y: f.y, size: 8.5, font: helv, color: GRAY });
      f.y -= 4;
      segs.forEach((sg, si) => {
        if (sg.kind === 'text') {
          const text = toFieldText(sg.text);
          const h = textFieldHeight(text, 24, 1);
          f.ensure(h + 4);
          f.y -= h;
          addTextField(`${q.fieldKey}::remarks::${si}::text`, text, f.page, f.y, h);
          f.y -= 4;
        } else {
          drawTableFields(`${q.fieldKey}::remarks::${si}`, sg);
          f.y -= 4;
        }
      });
      // nach einer Tabelle am Schluss: freies Feld für Ergänzungen
      if (segs[segs.length - 1].kind === 'table') {
        f.ensure(40);
        f.y -= 10;
        f.page.drawText('Ergänzung:', { x: MARGIN, y: f.y, size: 8.5, font: helv, color: GRAY });
        f.y -= 30;
        addTextField(`${q.fieldKey}::remarks::${segs.length}::text`, '', f.page, f.y, 26);
      }
    }
  }

  form.updateFieldAppearances(helv);
  // Schrift der Felder im Formular hinterlegen (AcroForm /DR, /DA): Viewer, die
  // Felder selbst neu zeichnen (z. B. beim Bearbeiten), finden sonst die Schrift
  // nicht und nehmen ihre eigene Standardgrösse
  const fieldDA = PDFString.of(`/${helv.name} ${FIELD_SIZE} Tf 0 g`);
  const acro = form.acroForm.dict;
  acro.set(PDFName.of('DR'), doc.context.obj({ Font: { [helv.name]: helv.ref } }));
  acro.set(PDFName.of('DA'), fieldDA);
  // auch am sichtbaren Feld (Widget): macOS Vorschau liest die Schrift nur dort,
  // sonst nimmt sie 12 pt
  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField) && !(field instanceof PDFDropdown)) continue;
    for (const w of field.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), fieldDA);
  }
  return doc.save();
}

export type PdfAnswerRaw = {
  themeId: string;
  questionId: string;
  ja?: boolean;
  nein?: boolean;
  choice?: string;
  remarks?: string;
};

// Ausgefülltes Formular-PDF wieder einlesen (Gegenstück zu buildOpenQuestionsPdf).
// Bemerkungen mit Tabellen kommen in Abschnitten zurück (`…::remarks::<i>::text`,
// `::head`, `::r<z>::c<s>`) und werden wieder zu Text + Markdown-Tabelle zusammengesetzt.
export async function readAnswersPdf(bytes: ArrayBuffer): Promise<PdfAnswerRaw[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const map = new Map<string, PdfAnswerRaw>();
  type Seg = { text?: string; head?: string; cells: Map<number, Map<number, string>> };
  const segsOf = new Map<string, Map<number, Seg>>();
  const entry = (themeId: string, questionId: string) => {
    const key = `${themeId}::${questionId}`;
    const a = map.get(key) ?? { themeId, questionId };
    map.set(key, a);
    return { key, a };
  };
  for (const field of doc.getForm().getFields()) {
    const name = field.getName();
    const seg = name.match(/^(.+?)::(.+?)::remarks::(\d+)::(text|head|r(\d+)::c(\d+))$/);
    if (seg && field instanceof PDFTextField) {
      const { key } = entry(seg[1], seg[2]);
      const segs = segsOf.get(key) ?? new Map<number, Seg>();
      segsOf.set(key, segs);
      const sg: Seg = segs.get(+seg[3]) ?? { cells: new Map() };
      segs.set(+seg[3], sg);
      const v = field.getText() ?? '';
      if (seg[4] === 'text') sg.text = v;
      else if (seg[4] === 'head') sg.head = v;
      else {
        const row = sg.cells.get(+seg[5]!) ?? new Map<number, string>();
        row.set(+seg[6]!, v);
        sg.cells.set(+seg[5]!, row);
      }
      continue;
    }
    const m = name.match(/^(.+?)::(.+?)::(ja|nein|choice|remarks)$/);
    if (!m) continue;
    const { a } = entry(m[1], m[2]);
    if (field instanceof PDFCheckBox && field.isChecked()) {
      if (m[3] === 'ja') a.ja = true;
      else a.nein = true;
    } else if (field instanceof PDFDropdown) {
      const sel = field.getSelected()[0];
      if (sel) a.choice = sel;
    } else if (field instanceof PDFTextField) {
      const t = (field.getText() ?? '').trim();
      if (t) a.remarks = t;
    }
  }
  for (const [key, segs] of segsOf) {
    const parts: string[] = [];
    for (const i of [...segs.keys()].sort((x, y) => x - y)) {
      const sg = segs.get(i)!;
      if (sg.text?.trim()) parts.push(sg.text.trim());
      if (!sg.head) continue;
      const n = splitRow(sg.head.split('\n')[0]).length;
      const rows = [...sg.cells.keys()].sort((x, y) => x - y).map(r => {
        const row = sg.cells.get(r)!;
        // Zelle einzeilig; «|» im Zellinhalt maskieren
        return Array.from({ length: n }, (_, c) => (row.get(c) ?? '').replace(/\s*\n\s*/g, ' ').trim().replace(/\|/g, '\\|'));
      }).filter(r => r.some(Boolean)); // leere (Reserve-)Zeilen weglassen
      parts.push(formatTables([sg.head.trim(), ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n')));
    }
    const remarks = parts.join('\n\n').trim();
    if (remarks) map.get(key)!.remarks = remarks;
  }
  return [...map.values()];
}

// ── Architektur-Review-Bericht ───────────────────────────────────────────────
// Statusbericht über alle erreichten Meilensteine — jederzeit erzeugbar,
// der Stand (abgenommen / offen, offene Fragen) steht zuoberst.

export type ReportQuestion = {
  number: string;
  text: string;
  answer: string;            // Ja / Nein / gewählte Option / beantwortet / offen
  open: boolean;
  remarks?: string;
  sources?: string[];        // Labels der zugeordneten Quellen (Belege der Antwort)
  condition?: string;        // Auflage (M20) — gesetzt = es gilt eine Auflage
  assignee?: string;         // zuständige Person (Frage zugewiesen)
};
export type ReportTheme = { heading: string; questions: ReportQuestion[] };
export type ReportMilestone = {
  title: string;             // «M10 · Architektur-Relevanz»
  info?: string;             // Kurzbeschrieb des Meilensteins
  approved: boolean;
  statusLine: string;        // einzeilig für die Status-Übersicht zuoberst
  openLine?: string;         // «keine offenen Fragen» — eigene Zeile im Detail
  result?: string;           // «architekturrelevant (…)» — eigene Zeile, fett
  approvedBy?: string;
  conditions?: { number: string; text: string }[]; // alle Auflagen des Meilensteins (M20)
  checks?: { line: string; assessment?: string; remarks?: string }[]; // Abnahme-Kontrollpunkte
  notes?: string;
  themes: ReportTheme[];
  skippedThemesNote?: string; // «Kein Review nötig: A · …»
};
export type ReviewReport = {
  projectName: string;
  projectNumber?: string;
  generated: string;
  description?: string;
  metaLines: string[];
  meta?: { label: string; value: string }[]; // strukturiert fürs Deckblatt
  milestones: ReportMilestone[];
  skipped: string[];         // nicht erreichte/entfallene Meilensteine mit Grund
  sources?: ReportSource[];  // hochgeladene Belege / Web-Referenzen am Projekt
};
export type ReportSource = {
  label: string;
  description?: string;
  detail: string;            // «datei.pdf · 1.2 MB · 11.09.2026 09:21 · Name» bzw. URL
};

const GREEN = rgb(0.13, 0.5, 0.3);
const ORANGE = rgb(0.8, 0.5, 0.08);

export async function buildReviewReportPdf(r: ReviewReport, tpl?: ReportTemplate): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Architektur Review — ${r.projectName}`);
  const F = await embedRichFonts(doc);
  const bold = F.bold;

  // Briefpapier: Seite 1 Deckblatt, Seite 2 Folgeseiten (eine Seite → für alle)
  let cover: PDFEmbeddedPage | null = null;
  let cont: PDFEmbeddedPage | null = null;
  if (tpl?.pdfBase64) {
    try {
      const src = await PDFDocument.load(Uint8Array.from(atob(tpl.pdfBase64), c => c.charCodeAt(0)));
      const n = src.getPageCount();
      const emb = await doc.embedPdf(src, n >= 2 ? [0, 1] : [0]);
      cover = emb[0];
      cont = emb[1] ?? emb[0];
    } catch (e) {
      console.error('[arch-review] Reportvorlage unlesbar — Export ohne Briefpapier:', e);
    }
  }
  const withTpl = cover !== null;
  // Layout: mit Briefpapier links 68 pt (Logo-Kante), Kopf/Fuss frei lassen
  const L = withTpl ? 68 : MARGIN;
  const W = A4[0] - L - (withTpl ? 67 : MARGIN);
  const TOP = withTpl ? A4[1] - 108 : A4[1] - MARGIN;   // Inhaltsbeginn Folgeseiten
  const BOTTOM = withTpl ? 100 : MARGIN;                // Inhaltsende (Fusszeile darunter)
  const NAVY = rgb(0.12, 0.31, 0.43);
  const docType = tpl?.docType?.trim() || 'Architekturprüfung · Reviewbericht';

  const newPage = (kind: 'cover' | 'cont'): PDFPage => {
    const pg = doc.addPage(A4);
    const bg = kind === 'cover' ? cover : cont;
    if (bg) pg.drawPage(bg, { x: 0, y: 0, width: A4[0], height: A4[1] });
    if (withTpl) {
      const w = richWidth(docType, F, 11);
      drawRichText(pg, docType, F, A4[0] - 67 - w, A4[1] - 68, 11, { color: NAVY });
    }
    return pg;
  };

  const f = new Flow(newPage(withTpl ? 'cover' : 'cont'), withTpl ? A4[1] - 250 : A4[1] - L, F, L, W, BOTTOM,
    () => ({ page: newPage('cont'), y: TOP }));

  // Status-Badge (ABGENOMMEN grün / OFFEN orange); gibt die Breite zurück
  const badge = (approved: boolean, x: number, yBase: number): number => {
    const label = approved ? 'ABGENOMMEN' : 'OFFEN';
    const color = approved ? GREEN : ORANGE;
    const w = bold.widthOfTextAtSize(label, 7) + 10;
    f.page.drawRectangle({ x, y: yBase - 3, width: w, height: 13, color });
    f.page.drawText(label, { x: x + 5, y: yBase, size: 7, font: bold, color: rgb(1, 1, 1) });
    return w;
  };

  // Kopf
  if (withTpl) {
    // Deckblatt im Stil der Projektdokumente: Nummer, Titel, Angaben in zwei Spalten
    if (r.projectNumber) f.text(r.projectNumber, 22, 28, { color: NAVY, plain: true });
    f.text(r.projectName, 22, 28, { color: NAVY, plain: true });
    f.y -= 10;
    f.text('Architektur Review', 12, 18, { color: NAVY, bold: true, plain: true });
    f.y -= 26;
    const meta = r.meta && r.meta.length ? r.meta : r.metaLines.map(v => ({ label: '', value: v }));
    const colX = L + 150;
    for (const m of meta) {
      const x = m.label ? colX : L;
      const lines = layoutRich(m.value, F, { size: 10, width: L + W - x, plain: true });
      f.ensure(14 * lines.length);
      f.y -= 14;
      if (m.label) f.line(`${m.label}:`, L, 10);
      drawRichLine(f.page, lines[0], x, f.y, 10, BLACK);
      for (const ln of lines.slice(1)) { f.y -= 14; drawRichLine(f.page, ln, x, f.y, 10, BLACK); }
      // Projektstatus: darunter der Stand je Meilenstein — die Status-Übersicht steht so auf dem Deckblatt
      if (m.label === 'Projektstatus') {
        for (const ms of r.milestones) {
          f.ensure(16);
          f.y -= 16;
          const bw = badge(ms.approved, colX, f.y);
          f.line(ms.title, colX + bw + 6, 9, { bold: true });
          const tw = richWidth(ms.title, F, 9, true);
          // Kurzstand hinter dem Titel; zu lang → umbrochen auf der Zeile darunter
          const sx = colX + bw + 6 + tw + 5;
          const status = `— ${ms.statusLine}`;
          if (sx + richWidth(status, F, 8.5, false) <= L + W) f.line(status, sx, 8.5, { color: GRAY });
          else f.text(ms.statusLine, 8.5, 11, { color: GRAY, x: colX + bw + 6, width: L + W - (colX + bw + 6), plain: true });
        }
        for (const line of r.skipped) {
          f.y -= 2;
          f.text(line, 8.5, 13, { color: GRAY, x: colX, width: L + W - colX, plain: true });
        }
        f.y -= 4;
      }
    }
    f.y -= 14;
    f.line('Erstellt am:', L, 10);
    f.line(r.generated, colX, 10);
    if (r.description) {
      f.y -= 18;
      f.text(r.description, 9.5, 13, { color: GRAY });
    }
    // die Panels (Meilensteine, Quellen) beginnen je auf einer eigenen Folgeseite
  } else {
    f.text('Architektur Review', 16, 20, { bold: true, plain: true });
    f.y -= 2;
    f.text(`${r.projectName}${r.projectNumber ? ` · ${r.projectNumber}` : ''}`, 11, 15, { plain: true });
    f.text(`Erstellt am ${r.generated}`, 8.5, 12, { color: GRAY, plain: true });
    if (r.description) {
      f.y -= 4;
      f.text(r.description, 9, 12, { color: GRAY });
    }
    f.y -= 4;
    for (const line of r.metaLines) f.text(line, 9, 12, { color: GRAY, plain: true });
  }

  // Status auf einen Blick — mit Briefpapier steht er auf dem Deckblatt beim Projektstatus
  if (!withTpl) {
    f.y -= 14;
    f.ensure(40);
    f.page.drawLine({ start: { x: L, y: f.y }, end: { x: L + W, y: f.y }, thickness: 0.6, color: LIGHT });
    f.y -= 20;
    f.ensure(14);
    f.line('Status', L, 12, { bold: true });
    for (const ms of r.milestones) {
      f.ensure(18);
      f.y -= 18;
      const w = badge(ms.approved, L, f.y);
      f.line(ms.title, L + w + 8, 9.5, { bold: true });
      const titleW = richWidth(ms.title, F, 9.5, true);
      f.line(`— ${ms.statusLine}`, L + w + 8 + titleW + 6, 8.5, { color: GRAY });
    }
    for (const line of r.skipped) f.text(line, 8.5, 15, { color: GRAY, x: L + 8, width: W - 8 });
  }

  // Überschrift eines Textblocks im Meilenstein (Bemerkungen, Auflagen …):
  // gut lesbar, mit etwas Luft davor — nicht als kleine graue Beschriftung
  const sectionLabel = (text: string, x = L) => {
    f.y -= 3;
    f.text(text, 9.5, 13, { color: DARK, bold: true, x, width: L + W - x, plain: true });
    f.y -= 1;
  };

  // Jedes Panel (Meilenstein, Quellen) auf einer eigenen Seite — wie im OnePager je eine Karte
  const panelPage = () => { f.page = newPage('cont'); f.y = TOP + 14; };

  // Details je Meilenstein
  for (const ms of r.milestones) {
    panelPage();
    f.y -= 26;
    f.line(ms.title, L, 12, { bold: true });
    const titleW = richWidth(ms.title, F, 12, true);
    badge(ms.approved, L + titleW + 10, f.y + 1);
    f.y -= 7;
    f.page.drawLine({ start: { x: L, y: f.y }, end: { x: L + W, y: f.y }, thickness: 0.6, color: LIGHT });
    f.y -= 2;
    if (ms.info) f.text(ms.info, 8.5, 11.5, { color: GRAY });
    const freigabe = ms.approved
      ? `Geprüft und freigegeben${ms.conditions?.length ? ' mit Auflagen' : ''}${ms.approvedBy ? ` von ${ms.approvedBy}` : ''}`
      : 'Noch nicht freigegeben';
    f.text(freigabe, 9, 13, { color: GRAY, plain: true });
    f.text(ms.openLine ?? ms.statusLine, 9, 12, { color: GRAY, plain: true });
    if (ms.result) {
      // steht allein auf einer Zeile — anders als in der Status-Übersicht gross
      f.y -= 3;
      f.text(ms.result.charAt(0).toUpperCase() + ms.result.slice(1), 10, 14, { bold: true, plain: true });
      f.y -= 3;
    }
    // Auflagen: alle auf einen Blick, je mit der Frage-Nummer
    if (ms.conditions?.length) {
      f.y -= 5;
      sectionLabel('Auflagen');
      for (const c of ms.conditions) {
        f.text(`• ${c.number}: ${c.text || '(noch nicht beschrieben)'}`, 8.5, 11.5, { color: GRAY, x: L + 6, width: W - 6, plain: true });
      }
    }
    // Kontrollpunkte: Titelzeile fett, Einschätzung/Bemerkungen darunter
    // eingerückt und je mit eigener Beschriftung — sonst liest sich der Text
    // wie eine Fortsetzung der Zeile davor.
    for (const c of ms.checks ?? []) {
      f.y -= 5;
      f.text(c.line, 9, 12.5, { color: DARK });
      if (c.assessment) {
        sectionLabel('Einschätzung Architektur', L + 10);
        f.text(c.assessment, 8.5, 11.5, { color: GRAY, x: L + 10, width: W - 10 });
      }
      if (c.remarks) {
        sectionLabel('Bemerkungen Abnahme', L + 10);
        f.text(c.remarks, 8.5, 11.5, { color: GRAY, x: L + 10, width: W - 10 });
      }
    }
    if (ms.notes) {
      f.y -= 5;
      sectionLabel('Bemerkungen');
      f.text(ms.notes, 8.5, 11.5, { color: GRAY, width: W });
    }

    for (const theme of ms.themes) {
      // Trennlinie vor jedem Thema, damit die Themen sich klar absetzen
      f.ensure(52);
      f.y -= 9;
      f.page.drawLine({ start: { x: L, y: f.y }, end: { x: L + W, y: f.y }, thickness: 0.4, color: LIGHT });
      f.y -= 15;
      f.line(theme.heading, L, 10, { bold: true });
      f.y -= 5; // Luft zwischen Themen-Überschrift und erster Frage
      for (const q of theme.questions) {
        const aW = richWidth(q.answer, F, 9, true);
        const numW = richWidth(q.number, F, 8.5, true) + F.bold.widthOfTextAtSize(' ', 8.5);
        const textW = W - numW - aW - 14;
        const qLines = layoutRich(q.text, F, { size: 8.5, width: W - numW, firstWidth: textW });
        f.ensure(13 + (qLines.length - 1) * 11.5);
        f.y -= 13;
        f.line(q.number, L, 8.5, { bold: true, color: GRAY });
        drawRichLine(f.page, qLines[0], L + numW, f.y, 8.5, BLACK, 11.5);
        // Antwort rechtsbündig auf der ersten Zeile; offen = orange
        f.line(q.answer, L + W - aW, 9, { bold: true, color: q.open ? ORANGE : rgb(0.1, 0.1, 0.1) });
        for (const ln of qLines.slice(1)) {
          const page = f.page;
          f.ensure(11.5 + ln.gap);
          f.y -= 11.5 + ln.gap;
          drawRichLine(f.page, ln, L + numW, f.y, 8.5, BLACK, 11.5, f.page !== page);
        }
        // Bemerkungen (inkl. Tabellen) in der Grösse des Fragetexts
        if (q.remarks) f.text(q.remarks, 8.5, 11.5, { color: GRAY, x: L + numW + 8, width: W - numW - 8 });
        if (q.assignee) {
          f.text(`Zuständig: ${q.assignee}`, 8, 10.5, { color: GRAY, x: L + numW + 8, width: W - numW - 8, plain: true });
        }
        if (q.condition !== undefined) {
          f.text(`Auflage: ${q.condition || '(noch nicht beschrieben)'}`, 8, 10.5, { color: ORANGE, x: L + numW + 8, width: W - numW - 8, plain: true });
        }
        if (q.sources?.length) {
          f.text(`Quellen: ${q.sources.join(' · ')}`, 8, 10.5, { color: GRAY, x: L + numW + 8, width: W - numW - 8, plain: true });
        }
      }
      if (theme.questions.length === 0) {
        f.text('keine Fragen in diesem Meilenstein', 8, 11, { color: GRAY, x: L + 8, plain: true });
      }
    }
    if (ms.skippedThemesNote) {
      f.y -= 4;
      f.text(ms.skippedThemesNote, 8, 11, { color: GRAY, x: L + 8, width: W - 8, plain: true });
    }
  }

  // Quellen (Belege und Web-Referenzen) am Schluss — wie im OnePager
  if (r.sources?.length) {
    panelPage();
    f.y -= 26;
    f.line('Quellen', L, 12, { bold: true });
    f.y -= 7;
    f.page.drawLine({ start: { x: L, y: f.y }, end: { x: L + W, y: f.y }, thickness: 0.6, color: LIGHT });
    for (const s of r.sources) {
      f.ensure(24);
      f.y -= 6;
      f.text(s.label, 9, 12, { bold: true, plain: true });
      if (s.description) f.text(s.description, 8.5, 11, { color: GRAY, x: L + 8, width: W - 8 });
      f.text(s.detail, 8, 10.5, { color: GRAY, x: L + 8, width: W - 8, plain: true });
    }
  }

  // Fusszeilen (mit Seitenzahl) auf allen Seiten — erst jetzt ist die Zahl bekannt
  if (withTpl) {
    const pages = doc.getPages();
    const left = (tpl?.footerLeft ?? '{{datum}} · {{nummer}} {{projekt}}')
      .replace(/\{\{datum\}\}/g, r.generated.split(' ')[0])
      .replace(/\{\{nummer\}\}/g, r.projectNumber ?? '')
      .replace(/\{\{projekt\}\}/g, r.projectName)
      .replace(/\s{2,}/g, ' ').trim();
    pages.forEach((pg, i) => {
      drawRichText(pg, left, F, L, 62, 8, { color: GRAY });
      const right = `Seite ${i + 1} von ${pages.length}`;
      drawRichText(pg, right, F, A4[0] - 67 - richWidth(right, F, 8), 62, 8, { color: GRAY });
    });
  }
  return doc.save();
}
