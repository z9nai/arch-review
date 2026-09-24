// Sicherheitscheck der Stammdaten (Admin): Wer darf die model.json ändern?
//
// Die App prüft Rollen nur im Browser — und die Rollennamen stehen in der
// model.json selbst. Was Reviewer wirklich nicht dürfen, setzt allein
// SharePoint durch. Deshalb liegt die model.json in config/ mit eigenen
// Berechtigungen: dort dürfen nur Admins schreiben, alle anderen lesen.
//
// Der Check vergleicht die Schreibberechtigten der model.json mit denen des
// Datenordners (dort müssen Reviewer schreiben dürfen — projects/,
// users.json). Sind es dieselben, ist nichts eingeschränkt.
import type { ItemPermission } from './backend';

export const MODEL_PATH = 'config/model.json';
export const LEGACY_MODEL_PATH = 'model.json';

export type FindingLevel = 'ok' | 'info' | 'warn' | 'danger';
export interface SecurityFinding { level: FindingLevel; text: string }

export interface SecurityReport {
  status: 'ok' | 'warn' | 'danger'; // schwerster Befund
  findings: SecurityFinding[];
  modelPermissions: ItemPermission[];
  rootPermissions: ItemPermission[];
  checkedAt: string;          // ISO
}

// Hinweise (info) verschlechtern den Gesamtstatus nicht
const RANK: Record<FindingLevel, number> = { ok: 0, info: 0, warn: 2, danger: 3 };

export const canWrite = (p: ItemPermission) =>
  p.roles.some(r => /write|owner|edit|contribute|full/.test(r));

export const roleLabel = (p: ItemPermission) =>
  p.roles.some(r => /owner|full/.test(r)) ? 'Vollzugriff'
    : canWrite(p) ? 'Bearbeiten'
    : p.roles.some(r => /read|view/.test(r)) ? 'Lesen'
    : p.roles.join(', ') || '—';

const names = (ps: ItemPermission[]) => ps.map(p => `«${p.name}»`).join(', ');

export function assessModelSecurity(opts: {
  modelPath: string;
  root: ItemPermission[];
  model: ItemPermission[];
  legacyLeftover: boolean;    // alte model.json im Hauptordner liegt noch da
}): SecurityReport {
  const { modelPath, root, model, legacyLeftover } = opts;
  const findings: SecurityFinding[] = [];
  const legacy = modelPath === LEGACY_MODEL_PATH;

  if (legacy) {
    findings.push({ level: 'warn', text: `Die model.json liegt noch im Hauptordner. Nach ${MODEL_PATH} verschieben und dem Ordner config/ eigene Berechtigungen geben (Admins: Bearbeiten, alle anderen: Lesen).` });
  }
  if (legacyLeftover) {
    findings.push({ level: 'warn', text: `Im Hauptordner liegt noch eine alte model.json. Die App liest nur ${MODEL_PATH} — die alte Datei löschen, damit niemand die falsche bearbeitet.` });
  }

  // Freigabelinks mit Bearbeiten: umgehen jede Gruppenberechtigung
  const editLinks = model.filter(p => p.kind === 'link' && canWrite(p));
  const wideLinks = editLinks.filter(p => p.linkScope === 'anonymous' || p.linkScope === 'organization');
  if (wideLinks.length) {
    findings.push({ level: 'danger', text: `Bearbeitungslink auf der model.json: ${names(wideLinks)}. Wer den Link hat, kann die Stammdaten ändern — Link in SharePoint unter «Zugriff verwalten» entfernen.` });
  }
  const userLinks = editLinks.filter(p => !wideLinks.includes(p));
  if (userLinks.length) {
    findings.push({ level: 'warn', text: `Bearbeitungslink für bestimmte Personen: ${names(userLinks)}. Prüfen, ob das nur Admins sind.` });
  }

  // Gruppen/Personen mit Schreibrecht: model.json gegen Datenordner
  const writers = (ps: ItemPermission[]) => ps.filter(p => p.kind !== 'link' && canWrite(p));
  const rootWriters = writers(root);
  const modelWriters = writers(model);
  const modelWriterKeys = new Set(modelWriters.map(p => p.key));
  const rootWriterKeys = new Set(rootWriters.map(p => p.key));
  const restricted = rootWriters.filter(p => !modelWriterKeys.has(p.key));

  if (rootWriters.length && !restricted.length) {
    findings.push({ level: 'danger', text: `Schreibrechte nicht eingeschränkt: Alle, die im Datenordner schreiben dürfen (${names(rootWriters)}), können auch die model.json ändern — also auch Reviewer. Damit lassen sich Rollen, Übergabe-Empfänger und Katalog verändern.` });
  } else if (restricted.length) {
    findings.push({ level: 'ok', text: `Eingeschränkt: ${names(restricted)} ${restricted.length === 1 ? 'darf' : 'dürfen'} im Datenordner schreiben, die model.json aber nur lesen.` });
  }
  if (modelWriters.length) {
    findings.push({ level: 'info', text: `Schreibberechtigt auf der model.json: ${names(modelWriters)} — das sollten nur Admins sein.` });
  }
  const extra = modelWriters.filter(p => !rootWriterKeys.has(p.key));
  if (extra.length && rootWriters.length) {
    findings.push({ level: 'info', text: `Nur auf der model.json schreibberechtigt (nicht im Datenordner): ${names(extra)}.` });
  }

  // Alle, die den Ordner nutzen, müssen die model.json lesen können
  const modelKeys = new Set(model.map(p => p.key));
  const noAccess = root.filter(p => p.kind !== 'link' && !modelKeys.has(p.key));
  if (noAccess.length) {
    findings.push({ level: 'warn', text: `Kein Zugriff auf die model.json, aber auf den Datenordner: ${names(noAccess)}. Diese Personen können die App nicht öffnen — auf der model.json (bzw. config/) mindestens «Lesen» geben.` });
  }

  const status = findings.reduce<SecurityReport['status']>((s, f) =>
    RANK[f.level] > RANK[s] ? f.level as SecurityReport['status'] : s, 'ok');
  return { status, findings, modelPermissions: model, rootPermissions: root, checkedAt: new Date().toISOString() };
}
