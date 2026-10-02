// Änderungsprotokoll — wer hat wann was an einem Projekt geändert, und woher
// die Änderung kam (von Hand, MS10-Import, JSON-Import, Antworten-Import,
// beim Laden nachgeführte abgeleitete Werte).
//
// **Ablage**: neben dem Projekt, nie in ihm — `projects/<slug>.audit.jsonl`,
// eine Zeile je Eintrag, nur angehängt. Die Projektliste liest nur `.json`,
// Exporte und Kopien kennen die Datei nicht. Angehängt wird mit Lesen und
// Schreiben gegen die Version (ETag) — wie bei den Kommentaren, bei einem
// Konflikt nochmals. Wird die Datei zu lang, wandert der ältere Teil in ein
// Archiv `projects/<slug>.audit-<Zeitstempel>.jsonl` (siehe `appendAudit`).
//
// **Was protokolliert wird**, ergibt sich aus dem Vergleich zweier Stände
// (`diffProjects`) — eine Stelle, die alles erfasst: Projektangaben,
// Antworten, Themen, Meilenstein-Köpfe, Abnahme-Kontrollpunkte, Quellen. Der
// OnePager schneidet die Stände: was zwischen zwei Speicherläufen von Hand
// geändert wurde, wird ein Eintrag `manual`; ein Import wird ein eigener
// Eintrag mit seiner Quelle.
//
// Die Stellen sind — wo es sie gibt — dieselben Schlüssel wie bei den
// Kommentaren (`q:<themeId>:<frageId>`, `check:M20:<id>`), dazu der lesbare
// Name zum Zeitpunkt der Änderung — die Stelle kann später verschwinden.
//
// Kommentare stehen nicht im Protokoll: sie sind selbst ein Verlauf.

import { MILESTONE_TITLES, Model, Project, Question, Review, SourceFile } from './types';
import { MS_KEY_RE, questionNumbers } from './projectJson';
import { nowIsoWithTimezone } from './util';

export type AuditSource = 'manual' | 'ms10-import' | 'json-import' | 'answers-import' | 'load';

export const SOURCE_LABEL: Record<AuditSource, string> = {
  manual: 'Von Hand',
  'ms10-import': 'MS10-Import',
  'json-import': 'JSON-Import',
  'answers-import': 'Antworten-Import',
  load: 'Beim Laden',
};

export interface AuditChange {
  /** Stelle, z. B. `project`, `q:<themeId>:<frageId>`, `ms:M20`, `check:M20:<id>` */
  target: string;
  /** lesbarer Name der Stelle, als es sie gab */
  label: string;
  op: 'add' | 'remove' | 'change';
  /** das geänderte Feld, lesbar — fehlt bei add/remove der ganzen Stelle */
  field?: string;
  before?: string;
  after?: string;
  /** before/after sind Ausschnitte um die geänderte Stelle eines langen Texts (siehe excerpts) */
  excerpt?: true;
}

export interface AuditEntry {
  id: string;
  at: string;
  author: string;
  email?: string;
  source: AuditSource;
  /** warum — z. B. «Projekt angelegt», Dateiname eines Imports */
  note?: string;
  changes: AuditChange[];
  /** so viele Änderungen mehr, als im Eintrag stehen (siehe MAX_CHANGES) */
  more?: number;
}

/** Was ein Aufrufer über eine Änderung mit Herkunft weiss. */
export interface AuditOrigin {
  source: AuditSource;
  note?: string;
}

export interface AuditAuthor { name: string; email?: string }

export const auditPath = (slug: string) => `projects/${slug}.audit.jsonl`;
const archivePath = (slug: string, stamp: string) => `projects/${slug}.audit-${stamp}.jsonl`;

/** höchstens so viele Änderungen je Eintrag — ein Import kann Hunderte bringen */
const MAX_CHANGES = 300;
/** ein Wert im Protokoll — eine lange Bemerkung braucht dort nicht ganz zu stehen */
const MAX_VALUE = 400;
/** ab so vielen Einträgen wird archiviert … */
const MAX_LINES = 2000;
/** … und so viele bleiben in der laufenden Datei */
const KEEP_LINES = 1000;

// ── Werte und Feldnamen ──────────────────────────────────────────────────────

const FIELD_LABEL: Record<string, string> = {
  name: 'Name', description: 'Beschrieb', responsibleProject: 'Verantwortlich Projekt',
  responsibleArchitecture: 'Verantwortlich Architektur', classification: 'Klassifikation',
  architectureRelevant: 'Architekturrelevant',
  value: 'Antwort', choice: 'Auswahl', remarks: 'Bemerkungen', sources: 'Quellen',
  relevant: 'Relevant', reviewed: 'Geprüft', result: 'Ergebnis', notes: 'Bemerkungen',
  approved: 'Freigegeben', approvedBy: 'Prüfer/in',
  required: 'Erforderlich', assessment: 'Einschätzung Architektur',
  label: 'Label', url: 'URL', filename: 'Datei',
};
const fieldLabel = (key: string) => FIELD_LABEL[key] ?? key;

/** Ja/Nein/offen: hier ist `false` ein Wert, nicht «leer» */
const TRI_STATE = new Set(['value', 'relevant', 'architectureRelevant']);

const RESULT_LABEL: Record<string, string> = {
  ok: 'In Ordnung', okWithConditions: 'Mit Auflagen', notOk: 'Nicht in Ordnung', notAssessable: 'Nicht beurteilbar',
};

const cut = (s: string) => (s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE - 1)}…` : s);

/** so viel unveränderter Text steht in einem Ausschnitt vor und nach der Änderung */
const CONTEXT = 60;

/**
 * Zwei lange Texte als Ausschnitte um die Stelle, an der sie sich
 * unterscheiden — gekürzt vom Anfang her wären beide gleich, sobald die
 * Änderung hinter MAX_VALUE liegt (und der Eintrag sähe aus wie keiner).
 */
function excerpts(a: string, b: string): [string, string] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const from = Math.max(0, pre - CONTEXT);
  const window = (s: string) => {
    const to = Math.min(s.length, s.length - suf + CONTEXT);
    const mid = s.slice(from, to);
    // die Änderung selbst kann lang sein: dann zählt ihr Anfang
    const body = mid.length > MAX_VALUE - 2 ? `${mid.slice(0, MAX_VALUE - 3)}…` : mid;
    return `${from > 0 ? '…' : ''}${body}${to < s.length && !body.endsWith('…') ? '…' : ''}`;
  };
  return [window(a), window(b)];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** leer und fehlend sind dasselbe — sonst meldet jedes `notes: ''` eine Änderung */
const blank = (key: string, v: unknown) => v === undefined || v === null || v === '' || (v === false && !TRI_STATE.has(key)) || (Array.isArray(v) && !v.length);

// ── Vergleich ────────────────────────────────────────────────────────────────

interface Ctx {
  model: Model | null;
  numbers: Map<Question, string>;
  /** Quellen beider Stände — für die Namen in answer.sources */
  sources: Map<string, string>;
}

/** Ein Wert, wie er im Protokoll steht — leer ist `undefined`. */
function show(ctx: Ctx, key: string, v: unknown): string | undefined {
  if (TRI_STATE.has(key)) return v === true ? 'Ja' : v === false ? 'Nein' : 'offen';
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return undefined;
  if (key === 'classification' && typeof v === 'string') return ctx.model?.classifications.find(c => c.id === v)?.label ?? v;
  if (key === 'result' && typeof v === 'string') return RESULT_LABEL[v] ?? v;
  if (key === 'sources' && Array.isArray(v)) return cut(v.map(id => ctx.sources.get(String(id)) ?? String(id)).join(', '));
  if (typeof v === 'string') return cut(v);
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return String(v);
  return cut(JSON.stringify(v));
}

class Collector {
  out: AuditChange[] = [];
  constructor(private ctx: Ctx) {}

  /** Die einfachen Felder zweier Objekte vergleichen (ohne `skip`). */
  fields(target: string, label: string, a: object, b: object, skip: ReadonlySet<string>) {
    const ra = a as Record<string, unknown>, rb = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      if (skip.has(k)) continue;
      const va = ra[k], vb = rb[k];
      if ((blank(k, va) && blank(k, vb)) || same(va, vb)) continue;
      if (typeof va === 'string' && typeof vb === 'string' && va && vb && Math.max(va.length, vb.length) > MAX_VALUE) {
        const [before, after] = excerpts(va, vb);
        this.out.push({ target, label, op: 'change', field: fieldLabel(k), before, after, excerpt: true });
        continue;
      }
      this.out.push({ target, label, op: 'change', field: fieldLabel(k), before: show(this.ctx, k, va), after: show(this.ctx, k, vb) });
    }
  }
}

const PROJECT_SKIP = new Set(['reviews', 'sources', 'updatedAt', 'createdAt', 'version', 'slug']);
const REVIEW_SKIP = new Set(['answers', 'checks', 'milestone']);
const NO_SKIP = new Set<string>();
const SOURCE_SKIP = new Set(['id', 'uploadedAt', 'uploadedBy', 'size', 'contentType']);

/** Meilenstein eines Review-Schlüssels (m20, ms20, foundation) — sonst null (Thema). */
export function milestoneOfKey(key: string): string | null {
  if (!MS_KEY_RE.test(key)) return null;
  if (/^foundation$/i.test(key)) return 'M10';
  return `M${key.replace(/^ms?/i, '')}`;
}

const short = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Lesbarer Name einer Stelle — aus dem Katalog bzw. dem Projekt. */
export function targetLabel(target: string, model: Model | null, project: Project | null, numbers?: Map<Question, string>): string {
  const [kind, a, b] = target.split(':');
  if (kind === 'project') return 'Projektangaben';
  if (kind === 'ms') return `${a} · ${MILESTONE_TITLES[a] ?? 'Meilenstein'}`;
  if (kind === 'check') return `${a} · ${(model?.milestoneChecks ?? []).find(c => c.id === b)?.label ?? b}`;
  if (kind === 'theme') return `Thema ${model?.themes.find(t => t.id === a)?.title ?? a}`;
  if (kind === 'source') return `Quelle «${project?.sources?.find(s => s.id === a)?.label ?? a}»`;
  if (kind === 'q') {
    const q = model?.questions.find(x => x.themeId === a && x.id === b);
    if (!q) return `Frage ${b} (${a})`;
    const n = (numbers ?? (model ? questionNumbers(model) : new Map<Question, string>())).get(q);
    return `${n ? `${n} ` : ''}${short(q.text)}`;
  }
  return target;
}

/**
 * Was sich von `a` nach `b` geändert hat — Stelle für Stelle. Kommentare und
 * die Zeitstempel zählen nicht.
 */
export function diffProjects(a: Project, b: Project, model: Model | null): AuditChange[] {
  const numbers = model ? questionNumbers(model) : new Map<Question, string>();
  const sources = new Map<string, string>();
  for (const s of [...(a.sources ?? []), ...(b.sources ?? [])]) sources.set(s.id, s.label);
  const ctx: Ctx = { model, numbers, sources };
  const col = new Collector(ctx);
  const label = (t: string) => targetLabel(t, model, b, numbers);

  col.fields('project', label('project'), a, b, PROJECT_SKIP);

  const keys = new Set([...Object.keys(a.reviews ?? {}), ...Object.keys(b.reviews ?? {})]);
  for (const key of keys) {
    const ra: Partial<Review> = a.reviews?.[key] ?? {};
    const rb: Partial<Review> = b.reviews?.[key] ?? {};
    if (same(ra, rb)) continue;
    const ms = milestoneOfKey(key);
    if (ms) {
      const t = `ms:${ms}`;
      col.fields(t, label(t), ra, rb, REVIEW_SKIP);
      for (const id of new Set([...Object.keys(ra.checks ?? {}), ...Object.keys(rb.checks ?? {})])) {
        const ct = `check:${ms}:${id}`;
        col.fields(ct, label(ct), ra.checks?.[id] ?? {}, rb.checks?.[id] ?? {}, NO_SKIP);
      }
      continue;
    }
    const tt = `theme:${key}`;
    col.fields(tt, label(tt), ra, rb, REVIEW_SKIP);
    for (const qid of new Set([...Object.keys(ra.answers ?? {}), ...Object.keys(rb.answers ?? {})])) {
      const qt = `q:${key}:${qid}`;
      col.fields(qt, label(qt), ra.answers?.[qid] ?? {}, rb.answers?.[qid] ?? {}, NO_SKIP);
    }
  }

  // Quellen (Anhänge, Web-Referenzen): neu, entfernt, umbenannt
  const sa = new Map((a.sources ?? []).map(s => [s.id, s] as [string, SourceFile]));
  const sb = new Map((b.sources ?? []).map(s => [s.id, s] as [string, SourceFile]));
  const summary = (s: SourceFile) => s.url ?? s.filename;
  for (const [id, s] of sa) {
    if (!sb.has(id)) col.out.push({ target: `source:${id}`, label: `Quelle «${s.label}»`, op: 'remove', ...(summary(s) ? { before: summary(s) } : {}) });
  }
  for (const [id, s] of sb) {
    const old = sa.get(id);
    if (!old) col.out.push({ target: `source:${id}`, label: `Quelle «${s.label}»`, op: 'add', ...(summary(s) ? { after: summary(s) } : {}) });
    else if (!same(old, s)) col.fields(`source:${id}`, `Quelle «${s.label}»`, old, s, SOURCE_SKIP);
  }
  return col.out;
}

let seq = 0;
const newId = () => `au${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Ein Eintrag aus einem Vergleich — `null`, wenn sich nichts geändert hat. */
export function makeEntry(a: Project, b: Project, model: Model | null, origin: AuditOrigin, author: AuditAuthor): AuditEntry | null {
  const changes = diffProjects(a, b, model);
  // ein Import ohne Wirkung ist keinen Eintrag wert — auch nicht mit Notiz
  if (!changes.length) return null;
  return {
    id: newId(),
    at: nowIsoWithTimezone(),
    author: author.name,
    ...(author.email ? { email: author.email } : {}),
    source: origin.source,
    ...(origin.note ? { note: origin.note } : {}),
    changes: changes.slice(0, MAX_CHANGES),
    ...(changes.length > MAX_CHANGES ? { more: changes.length - MAX_CHANGES } : {}),
  };
}

/** Leerer Stand — Ausgangspunkt für den ersten Eintrag eines neuen Projekts. */
export const emptyProject = (p: Project): Project => ({
  version: p.version, slug: p.slug, name: '', responsibleProject: '', responsibleArchitecture: '',
  classification: null, architectureRelevant: null, createdAt: p.createdAt, updatedAt: p.updatedAt, reviews: {},
});

// ── Datei ────────────────────────────────────────────────────────────────────

/** Die Zeilen der Datei lesen — eine kaputte Zeile kostet nur sich selbst. */
export function parseAudit(text: string): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as AuditEntry;
      if (e && typeof e.at === 'string' && Array.isArray(e.changes)) out.push(e);
    } catch { /* überspringen */ }
  }
  return out;
}

/** Was `appendAudit` vom Speicher braucht. */
export interface AuditFiles {
  read(path: string): Promise<{ text: string; version: string } | null>;
  write(path: string, text: string, opts?: { ifMatch?: string; createOnly?: boolean }):
    Promise<{ ok: true; version: string } | { ok: false; reason: string; message: string }>;
}

const stampOf = (iso: string) => iso.replace(/[^0-9]/g, '').slice(0, 14);

/**
 * Einträge anhängen. Wer gleichzeitig schreibt, bekommt einen Konflikt und
 * liest neu — höchstens ein paar Mal. Wird die Datei zu lang, kommt der
 * ältere Teil in ein Archiv, das nie überschrieben wird (`createOnly`).
 */
export async function appendAudit(files: AuditFiles, slug: string, entries: AuditEntry[]): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!entries.length) return { ok: true };
  const path = auditPath(slug);
  const neu = entries.map(e => JSON.stringify(e));
  let last = 'Protokoll konnte nicht geschrieben werden.';
  for (let attempt = 0; attempt < 4; attempt++) {
    let cur: { text: string; version: string } | null;
    try { cur = await files.read(path); } catch { cur = null; }
    let lines = [...(cur?.text.split('\n').filter(l => l.trim()) ?? []), ...neu];
    if (lines.length > MAX_LINES) {
      const old = lines.slice(0, lines.length - KEEP_LINES);
      const a = await files.write(archivePath(slug, stampOf(nowIsoWithTimezone())), `${old.join('\n')}\n`, { createOnly: true });
      // klappt das Archiv nicht, bleibt alles in der laufenden Datei
      if (a.ok) lines = lines.slice(-KEEP_LINES);
    }
    const w = await files.write(path, `${lines.join('\n')}\n`, cur ? { ifMatch: cur.version } : { createOnly: true });
    if (w.ok) return { ok: true };
    last = w.message;
    if (w.reason !== 'conflict' && w.reason !== 'exists') break;
  }
  return { ok: false, message: last };
}

// ── Anzeige ──────────────────────────────────────────────────────────────────

/**
 * Für die Anzeige: aufeinanderfolgende Einträge von Hand derselben Person
 * innerhalb von `windowMin` Minuten werden einer — mit dem ersten «vorher»
 * und dem letzten «nachher» je Stelle und Feld. Die Datei bleibt, wie sie
 * ist (jeder Speicherlauf eine Zeile); das hier fasst nur das Tippen zusammen.
 * Erwartet die Einträge **älteste zuerst**, gibt sie neueste zuerst zurück.
 */
export function coalesce(entries: AuditEntry[], windowMin = 10): AuditEntry[] {
  const out: AuditEntry[] = [];
  const keyOf = (c: AuditChange) => `${c.target}|${c.field ?? ''}`;
  for (const e of entries) {
    const prev = out[out.length - 1];
    const close = !!prev && prev.source === 'manual' && e.source === 'manual' && !prev.note && !e.note
      && prev.author === e.author
      && new Date(e.at).getTime() - new Date(prev.at).getTime() <= windowMin * 60_000;
    if (!close) { out.push({ ...e, changes: [...e.changes] }); continue; }
    const idx = new Map(prev.changes.map((c, i) => [keyOf(c), i]));
    for (const c of e.changes) {
      // Ausschnitte zweier Speicherläufe zeigen verschiedene Stellen des
      // Texts — nicht verschmelzen, sondern nacheinander zeigen
      if (c.excerpt || prev.changes[idx.get(keyOf(c)) ?? -1]?.excerpt) { idx.delete(keyOf(c)); prev.changes.push(c); continue; }
      const i = idx.get(keyOf(c));
      if (i === undefined) { idx.set(keyOf(c), prev.changes.length); prev.changes.push(c); continue; }
      const p = prev.changes[i];
      // erst angelegt, dann wieder entfernt: als hätte es nie bestanden
      if (p.op === 'add' && c.op === 'remove') { prev.changes[i] = { ...p, op: 'change', before: undefined, after: undefined }; continue; }
      prev.changes[i] = { ...c, op: p.op === 'add' ? 'add' : p.op === 'remove' && c.op === 'add' ? 'change' : c.op, before: p.before };
    }
    prev.at = e.at;
    if (e.more) prev.more = (prev.more ?? 0) + e.more;
    // zurück auf den alten Wert: nichts geändert
    prev.changes = prev.changes.filter(c => !(c.op === 'change' && c.before === c.after));
  }
  return out.filter(e => e.changes.length).reverse();
}
