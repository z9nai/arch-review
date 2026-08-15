// MS10-Import: Text aus einem MS10-Antrags-PDF extrahieren und die für den
// OnePager relevanten Felder herauslesen. Best-effort — was nicht gefunden
// wird, bleibt einfach leer.
import { Model, Project } from './types';
import { emptyReview } from './status';

export interface Ms10Data {
  projectNumber?: string;      // z. B. KP123456
  name?: string;               // Projektname ohne Nummer
  description?: string;        // Ausgangslage / Motivation
  projectLead?: string;        // Projektleiter/in → Verantwortlich Projekt
  projectLeadDeputy?: string;  // Stellvertretung
  client?: string;             // Auftraggeber/in
  serviceType?: string;        // Leistungstyp
  projectType?: string;        // Projekttyp
  projectClass?: string;       // Projektklasse S | M | L → Prüftiefe
  requestDate?: string;        // Antragsdatum dd.mm.yyyy
  startDate?: string;          // Startdatum Projekt
  endDate?: string;            // Enddatum Projekt
  architectureRelevant?: boolean; // aus den Architektur-Checkboxen, falls eindeutig
}

export async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  // pdfjs erst laden, wenn wirklich importiert wird (eigener Chunk)
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const task = getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const item of tc.items) {
      if ('str' in item) {
        out += item.str;
        if (item.hasEOL) out += '\n';
      }
    }
    out += '\n';
  }
  await task.destroy();
  return out;
}

const CHECKED = /[☒☑■✓×]/;

function grab(t: string, re: RegExp): string | undefined {
  const m = t.match(re);
  const v = m?.[1]?.trim().replace(/[;,]$/, '');
  return v || undefined;
}

export function parseMs10Text(raw: string): Ms10Data {
  // Für die Feld-Regexes reicht eine Zeile mit einfachen Leerzeichen
  const t = raw.replace(/\s+/g, ' ');
  const d: Ms10Data = {};

  const title = t.match(/MS10\s*[-–]\s*(KP\d+)\s*[-–]?\s*(.*?)(?=\s+Teilnahmeregelung|\s+Projektleiter|$)/);
  if (title) {
    d.projectNumber = title[1];
    d.name = title[2].trim() || undefined;
  }

  // «Ausganslage» ist ein Tippfehler in der Vorlage — beide Schreibweisen zulassen
  d.description = grab(t, /Ausgang?slage\s*\/\s*Motivation\s*(.*?)(?=\s+Gestaltungsbereich|\s+Ziele\s+Gesamtprojekt|\s+Ziele\s+Fachliche|\s+Architektur\s*\(|\s+Abhängigkeiten|$)/);
  d.projectLead = grab(t, /Projektleiter\/?\s*in:\s*(.*?)(?=\s+Projektleiter\/?\s*in\s+Stv|\s+Auftraggeber|\s+Leistungstyp|$)/);
  d.projectLeadDeputy = grab(t, /Projektleiter\/?\s*in\s+Stv:\s*(.*?)(?=\s+Auftraggeber|\s+Leistungstyp|$)/);
  d.client = grab(t, /Auftraggeber\/?\s*in\s*[:;]\s*(.*?)(?=\s+Leistungstyp|\s+Projekttyp|$)/);
  d.serviceType = grab(t, /Leistungstyp:\s*(.*?)(?=\s+Projekttyp|$)/);
  d.projectType = grab(t, /Projekttyp:\s*(.*?)(?=\s+Projektklasse|\s+Antragsdatum|$)/);
  d.projectClass = grab(t, /Projektklasse:\s*([SML])\b/);
  d.requestDate = grab(t, /Antragsdatum:\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
  d.startDate = grab(t, /Startdatum Projekt\s*\(ganzes Projekt\)\s*(\d{1,2}\.\d{1,2}\.\d{4})/);
  d.endDate = grab(t, /Enddatum Projekt\s*\(ganzes Projekt\)\s*(\d{1,2}\.\d{1,2}\.\d{4})/);

  // Architektur-Checkboxen: «Keine Architektur» angekreuzt → nicht relevant;
  // ein angekreuzter Fit → relevant; sonst offen lassen.
  const box = (label: string) => {
    const m = t.match(new RegExp(`([☐☒☑■✓×xX])\\s*${label}`));
    return m ? CHECKED.test(m[1]) : undefined;
  };
  const noArch = box('Keine Architektur');
  const anyFit = [box('Strategischer Fit'), box('Security Fit'), box('Technischer Fit')].some(v => v === true);
  if (noArch === true) d.architectureRelevant = false;
  else if (anyFit) d.architectureRelevant = true;

  return d;
}

export function hasMs10Data(d: Ms10Data): boolean {
  return Boolean(d.projectNumber || d.name || d.projectLead || d.projectClass || d.requestDate);
}

// Kompakte Zusammenfassung fürs Notizfeld der Foundation-Prüfung
export function ms10Summary(d: Ms10Data): string {
  const lines: string[] = [];
  lines.push(`— MS10-Import${d.requestDate ? ` (Antragsdatum ${d.requestDate})` : ''} —`);
  if (d.projectLeadDeputy) lines.push(`PL Stv: ${d.projectLeadDeputy}`);
  if (d.client) lines.push(`Auftraggeber: ${d.client}`);
  if (d.serviceType) lines.push(`Leistungstyp: ${d.serviceType}`);
  if (d.projectType) lines.push(`Projekttyp: ${d.projectType}`);
  if (d.projectClass) lines.push(`Projektklasse: ${d.projectClass}`);
  if (d.startDate || d.endDate) lines.push(`Projekt: ${d.startDate ?? '?'} – ${d.endDate ?? '?'}`);
  return lines.length > 1 ? lines.join('\n') : '';
}

// Übernimmt die gefundenen Felder in ein Projekt (Kopie, Original unverändert).
export function applyMs10(project: Project, d: Ms10Data, model: Model): Project {
  const p: Project = { ...project, reviews: { ...project.reviews } };
  if (d.name) p.name = d.name;
  if (d.description) p.description = d.description;
  if (d.projectNumber) p.projectNumber = d.projectNumber;
  if (d.projectLead) p.responsibleProject = d.projectLead;
  if (d.projectClass && model.reviewDepths.some(x => x.id === d.projectClass)) {
    p.reviewDepth = d.projectClass;
  }
  if (d.architectureRelevant !== undefined) p.architectureRelevant = d.architectureRelevant;

  const summary = ms10Summary(d);
  if (summary) {
    // Zusammenfassung in die Bemerkungen des M10-Kopfs
    const existing = { ...emptyReview(), milestone: 'M10', ...(p.reviews.m10 ?? {}) };
    // nicht doppelt anhängen, wenn derselbe Import schon in den Notizen steht
    if (!String(existing.notes ?? '').includes(summary)) {
      existing.notes = existing.notes ? `${existing.notes}\n${summary}` : summary;
    }
    p.reviews.m10 = existing;
  }
  return p;
}

// Anzeige-Labels für den Import-Dialog
export const MS10_FIELD_LABELS: [keyof Ms10Data, string][] = [
  ['projectNumber', 'Projektnummer'],
  ['name', 'Projektname'],
  ['description', 'Beschrieb (Ausgangslage)'],
  ['projectLead', 'Projektleiter/in'],
  ['projectLeadDeputy', 'PL Stellvertretung'],
  ['client', 'Auftraggeber/in'],
  ['serviceType', 'Leistungstyp'],
  ['projectType', 'Projekttyp'],
  ['projectClass', 'Projektklasse → Prüftiefe'],
  ['requestDate', 'Antragsdatum'],
  ['startDate', 'Projektstart'],
  ['endDate', 'Projektende'],
  ['architectureRelevant', 'Architektur-Checkboxen'],
];
