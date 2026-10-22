// Projektliste (Portfolio): alle Projekte der Organisation — auch solche ohne
// Architektur-Review. Liegt in config/portfolio.json (nur Admins schreiben,
// wie die model.json), gepflegt per Excel-Import im Admin. Der Review-Status
// ist manuell gesetzt; ein erneuter Import ändert ihn bei bestehenden
// Projekten nie. Verknüpft mit den Reviews über die Projektnummer.
import type { ProjectListItem } from './store';
import { colLetter, excelDate } from './xlsx';

export const PORTFOLIO_PATH = 'config/portfolio.json';

// Reihenfolge = Sortierung in der Übersicht
export const PORTFOLIO_STATUSES = ['open', 'inReview', 'noReview', 'archived'] as const;
export type PortfolioStatus = typeof PORTFOLIO_STATUSES[number];

export const PORTFOLIO_STATUS_META: Record<PortfolioStatus, { label: string; dark: string; light: string }> = {
  open:     { label: 'offen',     dark: 'bg-amber-500/15 text-amber-300 border-amber-500/30', light: 'bg-amber-50 text-amber-700 border-amber-300' },
  inReview: { label: 'in Review', dark: 'bg-blue-500/15 text-blue-300 border-blue-500/30',    light: 'bg-blue-50 text-blue-700 border-blue-300' },
  noReview: { label: 'kein Review', dark: 'bg-white/8 text-white/50 border-white/15',        light: 'bg-black/5 text-black/50 border-black/15' },
  archived: { label: 'archiviert', dark: 'bg-white/5 text-white/35 border-white/10',         light: 'bg-black/3 text-black/35 border-black/10' },
};

// Status neu importierter Projekte (noch nicht beurteilt)
export const NEW_PROJECT_STATUS: PortfolioStatus = 'open';

export interface PortfolioProject {
  number: string;        // Projektnummer, z. B. KP123456 — Schlüssel
  name: string;
  status: PortfolioStatus;
  createdDate?: string;  // yyyy-mm-dd (Erstellungsdatum aus dem Import)
  // weitere Excel-Spalten für die Detailansicht, je Spaltentitel (Datum als
  // yyyy-mm-dd) — beim Import ersetzt, der Status bleibt
  details?: Record<string, string>;
  importedAt?: string;   // ISO — erster Import
  [key: string]: unknown;
}

export interface PortfolioFile {
  version: number;
  projects: PortfolioProject[];
  numberFilter?: string; // zuletzt verwendeter Regex für die Projektnummer
  detailColumns?: string[]; // Spaltentitel der Details (Reihenfolge der Anzeige), beim nächsten Import vorgewählt
  lastImport?: { at: string; by?: string; fileName?: string };
  [key: string]: unknown;
}

export const emptyPortfolio = (): PortfolioFile => ({ version: 1, projects: [] });

export const numberKey = (n: string) => n.trim().toUpperCase();

export function parsePortfolio(text: string): PortfolioFile | null {
  try {
    const raw = JSON.parse(text) as PortfolioFile;
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.projects)) return null;
    const projects = raw.projects
      .filter(p => p && typeof p.number === 'string' && p.number.trim())
      .map(p => ({
        ...p,
        name: typeof p.name === 'string' ? p.name : '',
        status: (PORTFOLIO_STATUSES as readonly string[]).includes(p.status) ? p.status : NEW_PROJECT_STATUS,
      }));
    return { ...raw, version: raw.version ?? 1, projects };
  } catch {
    return null;
  }
}

// ── Excel-Import ─────────────────────────────────────────────────────────────

export interface ImportColumns { number: number; name: number; date: number } // -1 = keine

export interface ImportTable {
  headerRow: number;
  headers: string[];       // eindeutige Spaltentitel (leer → «Spalte C», doppelt → «… (2)»)
  columns: ImportColumns;
  details: number[];       // Spalten für die Detailansicht
  rows: string[][];
}

function uniqueHeaders(cells: string[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, i) => {
    const base = (cells[i] ?? '').trim() || `Spalte ${colLetter(i)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
}

const NUMBER_RE = /projekt\s*-?\s*(nummer|nr)|^nr\.?$|^nummer$|^number$/i;
const NAME_RE = /projekt\s*-?\s*(name|bezeichnung|titel)|^name$|^bezeichnung$|^titel$/i;
const DATE_RE = /datum|date|erstell/i;

// Kopfzeile suchen (oft stehen Titel/Leerzeilen davor): erste Zeile mit
// Spalte für Nummer und Name; sonst Zeile 1 mit Spalte A/B. Detailspalten:
// die beim letzten Import gewählten (nach Spaltentitel)
export function detectTable(rows: string[][], detailColumns: string[] = []): ImportTable {
  const width = Math.max(0, ...rows.map(r => r.length));
  let headerRow = 0;
  let columns: ImportColumns = { number: 0, name: 1, date: -1 };
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = rows[r];
    const number = cells.findIndex(c => NUMBER_RE.test(c));
    const name = cells.findIndex((c, i) => i !== number && NAME_RE.test(c));
    if (number >= 0 && name >= 0) {
      headerRow = r;
      columns = { number, name, date: cells.findIndex(c => DATE_RE.test(c)) };
      break;
    }
  }
  const headers = uniqueHeaders(rows[headerRow] ?? [], width);
  const details = detailColumns.map(h => headers.indexOf(h)).filter(i => i >= 0 && i !== columns.number && i !== columns.name);
  return { headerRow, headers, columns, details, rows };
}

// Vergleich unabhängig von der Reihenfolge der Schlüssel
const canon = (v: unknown): string =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
    : JSON.stringify(v);

export interface ImportPreview {
  merged: PortfolioFile;
  added: PortfolioProject[];
  renamed: { number: string; from: string; to: string }[];
  updated: number;       // bestehend, Details/Datum geändert (Name gleich)
  unchanged: number;
  filteredOut: number;   // Zeilen, deren Nummer nicht zum Regex passt
  duplicates: number;    // Nummer mehrfach in der Datei (erste gilt)
}

/** Datei in die bestehende Liste mischen: neue Projekte kommen dazu, bestehende
 *  behalten ihren Status (Name/Datum werden nachgeführt), fehlende bleiben. */
export function mergeImport(current: PortfolioFile, table: ImportTable, filter: RegExp | null, nowIso: string): ImportPreview {
  const { columns: c } = table;
  const byKey = new Map(current.projects.map(p => [numberKey(p.number), p]));
  const seen = new Set<string>();
  const added: PortfolioProject[] = [];
  const renamed: ImportPreview['renamed'] = [];
  const updates = new Map<string, PortfolioProject>();
  let updated = 0, unchanged = 0, filteredOut = 0, duplicates = 0;
  const detailCols = table.details.filter(i => i !== c.number && i !== c.name);
  for (const row of table.rows.slice(table.headerRow + 1)) {
    const number = (row[c.number] ?? '').trim();
    if (!number) continue;
    if (filter && !filter.test(number)) { filteredOut++; continue; }
    const key = numberKey(number);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    const name = (row[c.name] ?? '').trim();
    const createdDate = c.date >= 0 ? excelDate(row[c.date] ?? '') : undefined;
    const details: Record<string, string> = {};
    for (const i of detailCols) if ((row[i] ?? '').trim()) details[table.headers[i]] = row[i].trim();
    const hasDetails = Object.keys(details).length > 0;
    const old = byKey.get(key);
    if (!old) {
      added.push({ number, name, status: NEW_PROJECT_STATUS, ...(createdDate ? { createdDate } : {}), ...(hasDetails ? { details } : {}), importedAt: nowIso });
      continue;
    }
    // Status und unbekannte Felder bleiben; Details werden durch die neue Auswahl ersetzt
    const { details: _old, ...rest } = old;
    const next: PortfolioProject = { ...rest, ...(name ? { name } : {}), ...(createdDate ? { createdDate } : {}), ...(hasDetails ? { details } : {}) };
    const changed = canon(next) !== canon(old);
    if (name && name !== old.name) renamed.push({ number: old.number, from: old.name, to: name });
    else if (changed) updated++;
    if (changed) updates.set(key, next);
    else unchanged++;
  }
  const projects = [...current.projects.map(p => updates.get(numberKey(p.number)) ?? p), ...added];
  return {
    merged: { ...current, projects, detailColumns: detailCols.map(i => table.headers[i]) },
    added, renamed, updated, unchanged, filteredOut, duplicates,
  };
}

// ── Verknüpfung mit den Reviews ──────────────────────────────────────────────

// Reviews zu einer Projektnummer: Feld projectNumber (aus dem MS10-Import),
// sonst die Nummer als eigenes Wort im Namen oder Slug
export function reviewsFor(number: string, reviews: ProjectListItem[]): ProjectListItem[] {
  const key = numberKey(number);
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = new RegExp(`(^|[^A-Z0-9])${esc}([^A-Z0-9]|$)`, 'i');
  return reviews.filter(r => {
    const pn = typeof r.data.projectNumber === 'string' ? r.data.projectNumber : '';
    return pn ? numberKey(pn) === key : word.test(r.data.name ?? '') || word.test(r.slug);
  });
}

/** Projektnummer eines Reviews (Feld projectNumber), null = keine erfasst */
export function reviewNumber(r: ProjectListItem): string | null {
  if (typeof r.data.projectNumber === 'string' && r.data.projectNumber.trim()) return r.data.projectNumber.trim();
  return null;
}
