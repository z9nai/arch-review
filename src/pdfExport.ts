// Offene Fragen als ausfüllbares PDF-Formular (AcroForm) — rein clientseitig
// über pdf-lib (mitgebundelt, eigener Lazy-Chunk, keine Netzwerkzugriffe).
// Die Feldnamen sind stabil aufgebaut (`themeId::frageId::teil`), damit ein
// ausgefülltes PDF wieder importiert werden kann (readAnswersPdf).
// Fliesstext (Beschrieb, Bemerkungen, Hinweise …) läuft über pdfRich:
// Markdown (Absätze, Aufzählungen, **fett**, `Code`) und Symbole (⚠ → ↔ …).
import { ReportTemplate } from './types';
import {
  PDFDocument,
  PDFPage,
  PDFEmbeddedPage,
  PDFCheckBox,
  PDFDropdown,
  PDFTextField,
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

// Formularfelder (Dropdown-Optionen) rendert der Viewer mit Helvetica — dort
// nur WinAnsi (Latin-1 + CP1252-Zusatzzeichen) zulassen.
const clean = (s: string): string =>
  s.replace(/[︎️‍]/g, '')
    .replace(/[^\x20-\xFFŒœŠšŸŽžƒ–—‘’‚“”„†‡•…‰‹›€™]/g, '?');

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
    for (const ln of lines) {
      this.ensure(lineH + ln.gap);
      this.y -= lineH + ln.gap;
      drawRichLine(this.page, ln, o.x ?? this.x0, this.y, size, o.color ?? BLACK);
    }
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
      drawRichLine(f.page, qLines[0], MARGIN + numW, f.y, 9.5, BLACK);
      for (const ln of qLines.slice(1)) {
        f.ensure(13 + ln.gap);
        f.y -= 13 + ln.gap;
        drawRichLine(f.page, ln, MARGIN, f.y, 9.5, BLACK);
      }
      if (q.hint) f.text(q.hint, 8, 11, { color: GRAY });
      f.y -= 6;

      const fieldOpts = { borderColor: FIELD_BORDER, borderWidth: 0.8, backgroundColor: FIELD_BG };

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
        dd.setFontSize(9);
        f.y -= 6;
      }

      const remarksLabel = q.kind === 'text' ? 'Antwort / Bemerkung:' : 'Bemerkung:';
      const remarksH = q.kind === 'text' ? 56 : 40;
      f.ensure(12 + remarksH);
      f.y -= 12;
      f.page.drawText(remarksLabel, { x: MARGIN, y: f.y, size: 8.5, font: helv, color: GRAY });
      f.y -= remarksH + 4;
      const tf = form.createTextField(`${q.fieldKey}::remarks`);
      tf.enableMultiline();
      tf.addToPage(f.page, { x: MARGIN, y: f.y, width: CONTENT_W, height: remarksH, ...fieldOpts });
      tf.setFontSize(9);
    }
  }

  form.updateFieldAppearances(helv);
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

// Ausgefülltes Formular-PDF wieder einlesen (Gegenstück zu buildOpenQuestionsPdf)
export async function readAnswersPdf(bytes: ArrayBuffer): Promise<PdfAnswerRaw[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const map = new Map<string, PdfAnswerRaw>();
  for (const field of doc.getForm().getFields()) {
    const m = field.getName().match(/^(.+?)::(.+?)::(ja|nein|choice|remarks)$/);
    if (!m) continue;
    const key = `${m[1]}::${m[2]}`;
    const a = map.get(key) ?? { themeId: m[1], questionId: m[2] };
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
    map.set(key, a);
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
        drawRichLine(f.page, qLines[0], L + numW, f.y, 8.5, BLACK);
        // Antwort rechtsbündig auf der ersten Zeile; offen = orange
        f.line(q.answer, L + W - aW, 9, { bold: true, color: q.open ? ORANGE : rgb(0.1, 0.1, 0.1) });
        for (const ln of qLines.slice(1)) {
          f.ensure(11.5 + ln.gap);
          f.y -= 11.5 + ln.gap;
          drawRichLine(f.page, ln, L + numW, f.y, 8.5, BLACK);
        }
        if (q.remarks) f.text(q.remarks, 8, 10.5, { color: GRAY, x: L + numW + 8, width: W - numW - 8 });
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
