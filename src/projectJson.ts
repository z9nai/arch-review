import { MILESTONES, MILESTONE_TITLES, Model, Project, Question } from './types';
import { nowIsoWithTimezone } from './util';

// Projekt als JSON exportieren und wieder einlesen — für die Bearbeitung
// ausserhalb der App (z. B. mit einer KI, wenn die Daten die Bankenzone nicht
// direkt erreichen). Die Datei enthält das Projekt unverändert unter
// «project» und als Lesehilfe den Fragenkatalog unter «catalog» (Fragetexte,
// Nummern, Auswahloptionen). Beim Import zählt nur «project»; ein rohes
// Projekt-JSON (projects/<slug>.json) wird ebenfalls angenommen.
export const EXPORT_FORMAT = 'arch-review-project';

const INSTRUCTIONS = [
  'Export eines Projekts der Architekturprüfung. Bearbeitet wird nur «project»; «catalog» ist eine Lesehilfe und wird beim Import ignoriert.',
  'Antworten stehen unter project.reviews.<themeId>.answers.<questionId> — themeId und questionId wie in catalog.questions.',
  'Eine Antwort: { "value": true | false | null, "remarks": "Text", "choice": "Option" }. value = Ja/Nein/offen; bei kind "choice" steht die gewählte Option (exakt aus options) in choice und value bleibt null; bei kind "text" zählt nur remarks. Nur M20-Fragen: "condition": true = es gilt eine Auflage, "conditionText" = welche. "assignee": { "name", "email" } = wer die Frage beantworten soll. "mentions" = per @ in remarks erwähnte Personen (im Text «@Name»), gelten als Quelle.',
  'Meilenstein-Köpfe liegen unter project.reviews.m10 / m20 / m40 (notes = Bemerkungen; reviewed/approved/approvedBy = Prüf- und Freigabevermerke).',
  'project.classification ist eine id aus catalog.classifications oder null.',
  'Nicht ändern: slug, ids, sources (Anhänge), Felder, deren Bedeutung unklar ist — unbekannte Felder bleiben beim Import erhalten.',
].join('\n');

export interface ProjectExport {
  format: typeof EXPORT_FORMAT;
  formatVersion: 1;
  exportedAt: string;
  instructions: string;
  project: Project;
  catalog: {
    classifications: { id: string; label: string }[];
    milestones: { id: string; title: string }[];
    themes: { id: string; letter: string; title: string }[];
    questions: {
      id: string; number: string; milestone: string; themeId: string; text: string;
      kind: 'yesNo' | 'text' | 'choice'; options?: string[]; hint?: string; minClassification?: string;
    }[];
    milestoneChecks?: { id: string; milestone: string; label: string; hint?: string }[];
  };
}

const letterOf = (index: number) => String.fromCharCode(65 + (index % 26));

// Fragenummer wie im OnePager (M20B3): Meilenstein + Themen-Buchstabe +
// Position über den vollen Katalog
export function questionNumbers(model: Model): Map<Question, string> {
  const out = new Map<Question, string>();
  model.themes.forEach((t, ti) => {
    for (const ms of MILESTONES) {
      model.questions.filter(q => q.themeId === t.id && q.milestone === ms)
        .forEach((q, i) => out.set(q, `${ms}${letterOf(ti)}${i + 1}`));
    }
  });
  return out;
}

export function buildProjectExport(project: Project, model: Model): ProjectExport {
  const numbers = questionNumbers(model);
  return {
    format: EXPORT_FORMAT,
    formatVersion: 1,
    exportedAt: nowIsoWithTimezone(),
    instructions: INSTRUCTIONS,
    project,
    catalog: {
      classifications: model.classifications.map(c => ({ id: c.id, label: c.label })),
      milestones: MILESTONES.map(id => ({ id, title: MILESTONE_TITLES[id] ?? id })),
      themes: model.themes.map((t, i) => ({ id: t.id, letter: letterOf(i), title: t.title })),
      questions: model.questions
        .filter(q => !q.archived && q.enabled !== false && numbers.has(q))
        .map(q => ({
          id: q.id, number: numbers.get(q)!, milestone: q.milestone, themeId: q.themeId, text: q.text,
          kind: q.kind ?? 'yesNo',
          ...(q.options?.length ? { options: q.options } : {}),
          ...(q.hint ? { hint: q.hint } : {}),
          ...(q.minClassification ? { minClassification: q.minClassification } : {}),
        })),
      ...(model.milestoneChecks?.length ? {
        milestoneChecks: model.milestoneChecks.map(c => ({ id: c.id, milestone: c.milestone, label: c.label, ...(c.hint ? { hint: c.hint } : {}) })),
      } : {}),
    },
  };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const MS_KEY_RE = /^(m\d+|ms\d+|foundation)$/i;

export type ImportParse =
  | { ok: true; project: Project; warnings: string[] }
  | { ok: false; message: string };

// Datei prüfen und das Projekt herauslösen. Strukturfehler brechen ab (nichts
// wird übernommen); Unstimmigkeiten zum Katalog gibt es als Warnungen.
// Fehlende remarks/value einer Antwort werden ergänzt (KIs lassen sie gern weg).
// Mit current (Import in ein bestehendes Projekt) gibt es Katalog-Warnungen
// nur für Stellen, die der Import ändert — Altlasten im Projekt selbst (z. B.
// eine Auswahl, deren Optionstext im Katalog inzwischen umbenannt wurde)
// sind kein Thema des Imports.
export function parseProjectImport(text: string, model: Model | null, current?: Project): ImportParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, message: `Kein gültiges JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isObj(raw)) return { ok: false, message: 'Die Datei enthält kein JSON-Objekt.' };
  const candidate = raw.format === EXPORT_FORMAT ? raw.project : raw;
  if (!isObj(candidate)) return { ok: false, message: '«project» fehlt oder ist kein Objekt.' };
  if (!isObj(candidate.reviews)) return { ok: false, message: 'Kein Projekt: «reviews» fehlt oder ist kein Objekt.' };

  const errors: string[] = [];
  const warnings: string[] = [];
  for (const key of ['name', 'description', 'responsibleProject', 'responsibleArchitecture'] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== 'string') errors.push(`«${key}» muss Text sein.`);
  }
  if (candidate.classification !== undefined && candidate.classification !== null && typeof candidate.classification !== 'string') {
    errors.push('«classification» muss eine id (Text) oder null sein.');
  } else if (typeof candidate.classification === 'string' && model && candidate.classification !== current?.classification
    && !model.classifications.some(c => c.id === candidate.classification)) {
    warnings.push(`Klassifikation «${candidate.classification}» ist im Katalog nicht bekannt.`);
  }

  const themeIds = new Set(model?.themes.map(t => t.id) ?? []);
  const reviews: Record<string, unknown> = {};
  for (const [key, r] of Object.entries(candidate.reviews)) {
    if (!isObj(r)) { errors.push(`reviews.${key} ist kein Objekt.`); continue; }
    if (model && !MS_KEY_RE.test(key) && !themeIds.has(key) && !current?.reviews?.[key]) warnings.push(`Thema «${key}» ist im Katalog nicht bekannt.`);
    if (r.answers === undefined) { reviews[key] = r; continue; }
    if (!isObj(r.answers)) { errors.push(`reviews.${key}.answers ist kein Objekt.`); continue; }
    const answers: Record<string, unknown> = {};
    for (const [qid, a] of Object.entries(r.answers)) {
      const where = `reviews.${key}.answers.${qid}`;
      if (!isObj(a)) { errors.push(`${where} ist kein Objekt.`); continue; }
      // Was die App selbst schreibt (z. B. choice: null), muss wieder
      // einlesbar sein; offensichtliche KI-Varianten («Ja», "true") werden
      // umgedeutet, alles andere wird zur Warnung, nicht zum Abbruch.
      let value: boolean | null = null;
      if (a.value === true || a.value === false) value = a.value;
      else if (typeof a.value === 'string' && /^(ja|yes|true)$/i.test(a.value.trim())) value = true;
      else if (typeof a.value === 'string' && /^(nein|no|false)$/i.test(a.value.trim())) value = false;
      else if (a.value != null && a.value !== '') warnings.push(`${where}.value «${String(a.value)}» ist weder Ja noch Nein — als offen übernommen.`);
      const remarks = a.remarks == null ? '' : typeof a.remarks === 'string' ? a.remarks : String(a.remarks);
      const answer: Record<string, unknown> = { ...a, value, remarks };
      if (a.choice != null && typeof a.choice !== 'string') answer.choice = String(a.choice);
      const choice = typeof answer.choice === 'string' ? answer.choice : undefined;
      const prev = current?.reviews?.[key]?.answers?.[qid];
      const q = model?.questions.find(x => x.id === qid && x.themeId === key);
      if (model && !q && !prev) warnings.push(`Frage «${qid}» gehört nicht zum Thema «${key}» — wird gespeichert, aber nicht angezeigt.`);
      if (q && choice && choice !== prev?.choice && !(q.options ?? []).includes(choice)) {
        warnings.push(`Frage «${qid}»: Auswahl «${choice}» ist keine der Optionen.`);
      }
      answers[qid] = answer;
    }
    reviews[key] = { ...r, answers };
  }
  if (errors.length) {
    const shown = errors.slice(0, 5).join('\n');
    return { ok: false, message: errors.length > 5 ? `${shown}\n… und ${errors.length - 5} weitere Fehler.` : shown };
  }
  return { ok: true, project: { ...(candidate as unknown as Project), reviews: reviews as Project['reviews'] }, warnings };
}

// Was ändert der Import gegenüber dem aktuellen Stand? Für die Vorschau:
// je geänderter Stelle eine Zeile (Projektfeld, Antwort mit Nummer, Kopf).
export function describeImportChanges(current: Project, incoming: Project, model: Model | null): string[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const out: string[] = [];
  const fields: [keyof Project, string][] = [
    ['name', 'Name'], ['description', 'Beschrieb'], ['responsibleProject', 'Verantwortlich Projekt'],
    ['responsibleArchitecture', 'Verantwortlich Architektur'], ['classification', 'Klassifikation'],
  ];
  for (const [k, label] of fields) if (!same(current[k], incoming[k])) out.push(label);

  const numbers = model ? questionNumbers(model) : new Map<Question, string>();
  const qLabel = (themeId: string, qid: string) => {
    const q = model?.questions.find(x => x.id === qid && x.themeId === themeId);
    const n = q ? numbers.get(q) : undefined;
    const text = q ? (q.text.length > 60 ? `${q.text.slice(0, 60)}…` : q.text) : `${themeId} / ${qid}`;
    return n ? `${n} ${text}` : text;
  };
  const keys = new Set([...Object.keys(current.reviews ?? {}), ...Object.keys(incoming.reviews ?? {})]);
  for (const key of keys) {
    const a = current.reviews?.[key] ?? {};
    const b = incoming.reviews?.[key] ?? {};
    if (MS_KEY_RE.test(key)) {
      if (!same(a, b)) out.push(`Meilenstein ${key.toUpperCase()} (Kopf)`);
      continue;
    }
    const qids = new Set([...Object.keys(a.answers ?? {}), ...Object.keys(b.answers ?? {})]);
    for (const qid of qids) {
      if (!same(a.answers?.[qid], b.answers?.[qid])) out.push(qLabel(key, qid));
    }
    const { answers: _a, ...restA } = a;
    const { answers: _b, ...restB } = b;
    void _a; void _b;
    if (!same(restA, restB)) {
      const t = model?.themes.find(x => x.id === key);
      out.push(`Thema ${t?.title ?? key} (Relevanz/Notizen)`);
    }
  }
  return out;
}
