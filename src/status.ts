import { MILESTONES, Project, Review } from './types';

export type ProjectStatus = 'notRelevant' | 'open' | 'ok';

export function emptyReview(): Review {
  return { relevant: null, reviewed: false, result: null, milestone: '', notes: '' };
}

// Review-Eintrag eines Themas (Relevanz + Antworten).
// Fehlt der Eintrag, gilt «noch nicht bearbeitet».
export function getThemeReview(project: Project, themeId: string): Review {
  return { ...emptyReview(), ...(project.reviews?.[themeId] ?? {}) };
}

// Kopf eines Meilensteins (geprüft/freigegeben, Prüfer, Bemerkungen) unter
// reviews.m10/m20/m40 — mit Fallback auf die alten Schlüssel (foundation, ms20 …).
export function getMilestoneReview(project: Project, ms: string): Review {
  const stored = project.reviews?.[ms.toLowerCase()]
    ?? project.reviews?.[`ms${ms.slice(1)}`.toLowerCase()]
    ?? (ms === 'M10' ? project.reviews?.foundation : undefined);
  return { ...emptyReview(), milestone: ms, ...(stored ?? {}) };
}

// Erster nicht freigegebener Meilenstein — das ist der, an dem das Projekt
// gerade steht (null = nichts offen: nicht relevant oder abgeschlossen).
export function openMilestone(project: Project): string | null {
  for (const ms of MILESTONES) {
    if (getMilestoneReview(project, ms).approved !== true) return ms;
    if (ms === MILESTONES[0] && project.architectureRelevant === false) return null;
  }
  return null;
}

// Projektstatus (abgeleitet, nicht gespeichert)
export function deriveStatus(project: Project): ProjectStatus {
  if (project.architectureRelevant === false) return 'notRelevant';
  const last = MILESTONES[MILESTONES.length - 1];
  if (getMilestoneReview(project, last).approved === true) return 'ok';
  return 'open';
}

export const STATUS_META: Record<ProjectStatus, { label: string; dark: string; light: string }> = {
  notRelevant: { label: 'nicht architekturrelevant', dark: 'bg-white/8 text-white/50 border-white/15',                light: 'bg-black/5 text-black/50 border-black/15' },
  open:        { label: 'offen',                     dark: 'bg-blue-500/15 text-blue-300 border-blue-500/30',         light: 'bg-blue-50 text-blue-700 border-blue-300' },
  ok:          { label: 'abgeschlossen',             dark: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', light: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
};
