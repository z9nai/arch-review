import { FactsheetDef, Project, Review, ReviewResult } from './types';

export type ProjectStatus = 'notRelevant' | 'open' | 'ok' | 'withConditions' | 'notOk';

export function defaultReview(def: FactsheetDef): Review {
  return {
    relevant: def.id === 'foundation' ? true : null,
    reviewed: false,
    result: null,
    milestone: def.milestone,
    notes: '',
  };
}

// Fehlt ein Eintrag in project.reviews, gilt er als «noch nicht bearbeitet».
// Foundation ist immer relevant, unabhängig vom gespeicherten Wert.
export function getReview(project: Project, def: FactsheetDef): Review {
  const stored = project.reviews?.[def.id];
  const merged: Review = { ...defaultReview(def), ...(stored ?? {}) };
  if (def.id === 'foundation') merged.relevant = true;
  return merged;
}

// result zählt nur, wenn reviewed === true (Konsistenzregel).
export function effectiveResult(r: Review): ReviewResult | null {
  return r.reviewed ? r.result : null;
}

export function deriveStatus(project: Project, factsheets: FactsheetDef[]): ProjectStatus {
  if (project.architectureRelevant === false) return 'notRelevant';
  if (project.architectureRelevant === null) return 'open';
  // relevant === null zählt als «noch nicht entschieden» und hält das Projekt offen
  const results = factsheets
    .map(def => getReview(project, def))
    .filter(r => r.relevant !== false)
    .map(effectiveResult);
  if (results.some(x => x === null)) return 'open';
  if (results.some(x => x === 'notOk' || x === 'notAssessable')) return 'notOk';
  if (results.some(x => x === 'okWithConditions')) return 'withConditions';
  return 'ok';
}

export const STATUS_META: Record<ProjectStatus, { label: string; dark: string; light: string }> = {
  notRelevant:    { label: 'nicht architekturrelevant', dark: 'bg-white/8 text-white/50 border-white/15',              light: 'bg-black/5 text-black/50 border-black/15' },
  open:           { label: 'offen',                     dark: 'bg-blue-500/15 text-blue-300 border-blue-500/30',       light: 'bg-blue-50 text-blue-700 border-blue-300' },
  ok:             { label: 'in Ordnung',                dark: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', light: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  withConditions: { label: 'mit Conditions',            dark: 'bg-amber-500/15 text-amber-300 border-amber-500/30',    light: 'bg-amber-50 text-amber-700 border-amber-300' },
  notOk:          { label: 'nicht in Ordnung',          dark: 'bg-rose-500/15 text-rose-300 border-rose-500/30',       light: 'bg-rose-50 text-rose-700 border-rose-300' },
};

export const RESULT_LABELS: Record<ReviewResult, string> = {
  ok: 'in Ordnung',
  okWithConditions: 'mit Conditions',
  notOk: 'nicht in Ordnung',
  notAssessable: 'nicht beurteilbar',
};
