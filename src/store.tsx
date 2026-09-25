import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Comment, CommentsFile, DirectoryUser, Model, Project, Review, UsersFile } from './types';
import { DEFAULT_MODEL } from './defaultModel';
import { applyMs10, Ms10Data } from './ms10';
import { nowIsoWithTimezone, todayIso } from './util';
import { LocalBackend, StorageBackend } from './backend';
import { GRAPH_SCOPES, GraphBackend, resolveFolderLink, SharePointFolder } from './graph';
import { PENDING_FOLDER_KEY, useAuth } from './auth';
import { assessModelSecurity, LEGACY_MODEL_PATH, MODEL_PATH, SecurityReport } from './security';

export interface ProjectListItem {
  slug: string;
  data: Project;
  version: string;
  lock?: ProjectLock; // gültige Bearbeitungssperre einer anderen Person/Sitzung
  openComments?: number; // offene Kommentar-Fäden (aus projects/<slug>.comments.json)
}

// Bearbeitungssperre (Lease): gilt bis «letzte Änderung + LOCK_LEASE_MS»,
// Sidecar-Datei projects/<slug>.lock.json. Verwaiste Sperren laufen von
// selbst ab; Übernehmen ist für Bearbeitende jederzeit möglich.
export interface ProjectLock {
  user: string;
  email: string;
  session: string;     // Browser-Tab — zwei Tabs derselben Person sperren sich gegenseitig
  since: string;       // ISO
  lastActivity: string; // ISO
  until: string;       // ISO
}
export const LOCK_LEASE_MS = 5 * 60 * 1000;

export type LockResult =
  | { status: 'acquired'; lock: ProjectLock; version: string }
  | { status: 'held'; lock: ProjectLock }
  | { status: 'error'; message: string };

export type SaveResult =
  | { status: 'saved'; version: string }
  | { status: 'conflict'; currentVersion: string }
  | { status: 'error'; message: string };

export interface StorageInfo { kind: 'local' | 'sharepoint'; name: string; webUrl?: string }

// Entra-Suche: Treffer — oder warum sie nicht möglich ist. 'consent' lässt
// sich per requestDirectoryConsent nachholen; 'forbidden' = die Berechtigung
// User.ReadBasic.All fehlt in der App-Registrierung (Admin in Entra);
// 'noLogin' = keine Anmeldung (lokaler Ordner ohne Login).
export type DirectorySearchResult =
  | { ok: true; users: DirectoryUser[] }
  | { ok: false; reason: 'noLogin' | 'consent' | 'forbidden' | 'error'; message: string };
export const DIRECTORY_SCOPES = ['User.ReadBasic.All'];

// Sicherheitscheck der Stammdaten: Bericht — oder warum keiner möglich ist
// ('local' = lokaler Ordner, dort gelten die Rechte des Dateisystems)
export type SecurityCheckResult =
  | { ok: true; report: SecurityReport }
  | { ok: false; reason: 'local' | 'forbidden' | 'error'; message: string };

interface StoreCtx {
  isDark: boolean;
  toggleTheme: () => void;
  storage: StorageInfo | null;
  // lokaler Ordner
  pickDirectory: () => Promise<void>;
  savedHandleName: string | null;
  reconnectDirectory: () => Promise<void>;
  // SharePoint-Ordner
  connectSharePoint: (link: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  savedSharePoint: SharePointFolder | null;
  reconnectSharePoint: () => Promise<void>;
  forgetSharePoint: () => void;
  /** Ordner vormerken: wird nach der Microsoft-Anmeldung automatisch verbunden */
  queueSharePoint: (link: string) => void;
  disconnect: () => void;
  // Daten
  model: Model | null;
  modelError: string | null;
  /** Pfad der geladenen Stammdaten: config/model.json oder (alt) model.json */
  modelPath: string;
  saveModel: (m: Model) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Admin: wer darf die model.json ändern? (SharePoint-Berechtigungen) */
  checkModelSecurity: () => Promise<SecurityCheckResult>;
  projects: ProjectListItem[];
  refreshProjects: () => Promise<void>;
  loadProject: (slug: string) => Promise<{ data: Project; version: string } | null>;
  saveProject: (data: Project, expectedVersion: string | null) => Promise<SaveResult>;
  createProject: (name: string, slug: string, ms10?: Ms10Data) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Kopie anlegen: Antworten/Klassifikation bleiben, Freigaben werden zurückgesetzt */
  duplicateProject: (sourceSlug: string, name: string, slug: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** projects/<slug>.json (und eine allfällige eigene Sperre) endgültig entfernen */
  deleteProject: (slug: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  // Quelldateien (Belege/Referenzdokumente) je Projekt — die Metadaten
  // (Label, Beschrieb, …) liegen in Project.sources und laufen über
  // saveProject/setProj wie jedes andere Feld; hier nur die Rohdatei.
  uploadSourceFile: (slug: string, storedName: string, file: File) => Promise<{ ok: true } | { ok: false; message: string }>;
  downloadSourceFile: (slug: string, storedName: string) => Promise<Blob | null>;
  deleteSourceFile: (slug: string, storedName: string) => Promise<void>;
  // Kommentare (Sidecar projects/<slug>.comments.json, unabhängig von der
  // Bearbeitungssperre): lesen und atomar ändern (Lesen → Funktion anwenden →
  // Schreiben mit ETag; bei Konflikt wird auf dem neuesten Stand wiederholt)
  loadComments: (slug: string) => Promise<Comment[]>;
  updateComments: (slug: string, mutate: (prev: Comment[]) => Comment[]) => Promise<{ ok: true; comments: Comment[] } | { ok: false; message: string }>;
  // Personen für @-Erwähnungen: users.json im geteilten Ordner (jede
  // angemeldete Person trägt sich beim Öffnen ein) und Entra-Suche über Graph
  knownUsers: DirectoryUser[];
  searchDirectory: (query: string) => Promise<DirectorySearchResult>;
  /** Zustimmung für die Entra-Suche einholen (Redirect) */
  requestDirectoryConsent: () => Promise<void>;
  // Bearbeitungssperre
  sessionId: string;
  readLock: (slug: string) => Promise<ProjectLock | null>;
  acquireLock: (slug: string, force?: boolean) => Promise<LockResult>;
  renewLock: (slug: string) => Promise<LockResult>;
  releaseLock: (slug: string, keepalive?: boolean) => Promise<void>;
}

const Ctx = createContext<StoreCtx>(null!);
export const useStore = () => useContext(Ctx);

// ── IndexedDB: gewählten lokalen Ordner über die Sitzung hinaus merken ──────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('arch-review', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistHandle(handle: FileSystemDirectoryHandle) {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'dir');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[arch-review] persistHandle:', e);
  }
}

async function loadStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('dir');
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

// ── localStorage: gemerkter SharePoint-Ordner + gewählter Modus ─────────────
const SP_KEY = 'arch-review.sharepoint';
const MODE_KEY = 'arch-review.mode';

function loadSharePoint(): SharePointFolder | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SP_KEY) ?? 'null');
    return raw && raw.driveId && raw.itemId ? raw as SharePointFolder : null;
  } catch { return null; }
}
function storeSharePoint(f: SharePointFolder | null) {
  try {
    if (f) { localStorage.setItem(SP_KEY, JSON.stringify(f)); localStorage.setItem(MODE_KEY, 'sharepoint'); }
    else { localStorage.removeItem(SP_KEY); localStorage.removeItem(MODE_KEY); }
  } catch { /* ignore */ }
}

// Entwicklung: ?graph=http://localhost:3999/v1.0 leitet Graph auf einen Mock um
const graphBase = (): string | undefined =>
  import.meta.env.DEV ? (new URLSearchParams(location.search).get('graph') ?? undefined) : undefined;

// Ältere model.json-Formate beim Lesen in die aktuelle Struktur überführen:
// v1 (factsheets mit eingebetteten Fragen, MSxx-Nummern) → themes + questions;
// v2 (mit Prüftiefen) → v3: Prüftiefen entfallen, Klassifikation neu
// dreistufig (nicht relevant / relevant / wegweisend); alte «ab L»-Fragen
// werden zu «ab wegweisend», «ab M» entfällt (M20/M40 setzen ohnehin
// mindestens «relevant» voraus).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeModel(raw: any): Model {
  if (raw && Array.isArray(raw.themes) && Array.isArray(raw.questions)) {
    if (!raw.reviewDepths) return raw as Model; // aktuelles Format (v3)
    const { reviewDepths: _drop, ...rest } = raw;
    void _drop;
    return {
      ...rest,
      version: 3,
      classifications: DEFAULT_MODEL.classifications,
      classificationInfoMd: DEFAULT_MODEL.classificationInfoMd,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questions: raw.questions.map((q: any) => {
        const { minDepth, ...qq } = q;
        return minDepth === 'L' ? { ...qq, minClassification: 'wegweisend' } : qq;
      }),
    } as Model;
  }
  const msMap: Record<string, string> = { MS10: 'M10', MS20: 'M20', MS40: 'M40', MS60: 'M40' };
  const themes: Model['themes'] = [];
  const questions: Model['questions'] = [];
  for (const fs of raw?.factsheets ?? []) {
    if (fs.id === 'foundation') continue;
    themes.push({ id: fs.id, title: fs.name ?? fs.id, ...(fs.infoMd ? { infoMd: fs.infoMd } : {}) });
    for (const q of fs.questions ?? []) {
      questions.push({
        id: q.id, text: q.text,
        milestone: msMap[q.milestone ?? fs.milestone] ?? 'M20',
        themeId: fs.id,
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.hint ? { hint: q.hint } : {}),
      });
    }
  }
  return {
    version: 3,
    classifications: DEFAULT_MODEL.classifications,
    classificationInfoMd: DEFAULT_MODEL.classificationInfoMd,
    themes, questions,
  };
}

// Sitzungs-ID je Browser-Tab (sessionStorage)
const SESSION_KEY = 'arch-review.session';
function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  } catch {
    return 'session';
  }
}

function parseLock(text: string): ProjectLock | null {
  try {
    const l = JSON.parse(text);
    return l && typeof l.until === 'string' && typeof l.session === 'string' ? l as ProjectLock : null;
  } catch {
    return null;
  }
}
export const lockValid = (l: ProjectLock | null | undefined): l is ProjectLock =>
  !!l && Date.parse(l.until) > Date.now();

function parseComments(text: string): Comment[] {
  try {
    const f = JSON.parse(text) as Partial<CommentsFile>;
    return Array.isArray(f?.comments) ? f.comments.filter(c => c && typeof c.id === 'string' && typeof c.target === 'string') : [];
  } catch {
    return [];
  }
}

function parseProject(text: string, version: string): { data: Project; version: string } | null {
  try {
    return { data: JSON.parse(text) as Project, version };
  } catch {
    return null; // unlesbare Datei überspringen
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelPath, setModelPath] = useState(MODEL_PATH);
  const modelPathRef = useRef(MODEL_PATH);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [savedHandleName, setSavedHandleName] = useState<string | null>(null);
  const [savedSharePoint, setSavedSharePoint] = useState<SharePointFolder | null>(() => loadSharePoint());
  const [knownUsers, setKnownUsers] = useState<DirectoryUser[]>([]);
  const backendRef = useRef<StorageBackend | null>(null);
  const modelRef = useRef<Model | null>(null);
  const savedHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const getTokenRef = useRef(auth.getToken);
  getTokenRef.current = auth.getToken;
  const authRef = useRef(auth);
  authRef.current = auth;
  const idsRef = useRef(auth.ids);
  idsRef.current = auth.ids;

  // Stammdaten liegen in config/model.json — der Ordner config/ bekommt in
  // SharePoint eigene Berechtigungen (nur Admins schreiben, siehe
  // security.ts). Ältere Ordner haben die model.json noch im Hauptordner:
  // dann wird sie dort gelesen und geschrieben, bis ein Admin sie verschiebt.
  const loadModel = useCallback(async (be: StorageBackend) => {
    const usePath = (p: string) => { modelPathRef.current = p; setModelPath(p); };
    try {
      let read = await be.read(MODEL_PATH);
      usePath(MODEL_PATH);
      if (!read) {
        read = await be.read(LEGACY_MODEL_PATH);
        if (read) usePath(LEGACY_MODEL_PATH);
      }
      if (!read) {
        // model.json fehlt → mit dem Standard-Katalog anlegen; Anmelde-IDs
        // und Standardrollen gleich eintragen, wenn bekannt (SharePoint-Modus)
        const ids = idsRef.current;
        const fresh: Model = ids
          ? { ...DEFAULT_MODEL, auth: { enabled: false, tenantId: ids.tenantId, clientId: ids.clientId, adminRole: 'ArchReview.Admin', reviewerRole: 'ArchReview.Reviewer', viewerRole: 'ArchReview.Viewer' } }
          : DEFAULT_MODEL;
        // Ordner vorab anlegen; fehlt das Schreibrecht, meldet es gleich write
        try { await be.ensureDir('config'); } catch { /* s. u. */ }
        const w = await be.write(MODEL_PATH, JSON.stringify(fresh, null, 2), { createOnly: true });
        if (!w.ok && w.reason !== 'exists') {
          setModel(null); modelRef.current = null;
          setModelError(w.reason === 'forbidden'
            ? `${MODEL_PATH} fehlt und kann nicht angelegt werden (keine Schreibberechtigung).`
            : `${MODEL_PATH} fehlt und konnte nicht angelegt werden.`);
          return;
        }
        if (!w.ok) {
          // gleichzeitig von jemand anderem angelegt → deren Stand laden
          read = await be.read(MODEL_PATH);
        } else {
          setModel(fresh); modelRef.current = fresh; setModelError(null);
          return;
        }
      }
      if (!read) throw new Error(`${MODEL_PATH} nicht gefunden.`);
      try {
        const m = normalizeModel(JSON.parse(read.text));
        setModel(m); modelRef.current = m; setModelError(null);
      } catch {
        // vorhandene, aber defekte Datei NICHT überschreiben
        setModel(null); modelRef.current = null;
        setModelError(`${modelPathRef.current} ist unlesbar (kein gültiges JSON).`);
      }
    } catch (e) {
      console.error('[arch-review] loadModel:', e);
      setModel(null); modelRef.current = null;
      setModelError(`${modelPathRef.current} konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const refreshProjectsIn = useCallback(async (be: StorageBackend) => {
    const items: ProjectListItem[] = [];
    try {
      const files = await be.list('projects');
      const locks = new Map<string, ProjectLock>();
      const openComments = new Map<string, number>();
      for (const f of files) {
        if (f.name.endsWith('.lock.json')) {
          const read = await be.read(`projects/${f.name}`);
          const l = read ? parseLock(read.text) : null;
          if (lockValid(l) && l.session !== sessionId()) locks.set(f.name.replace(/\.lock\.json$/, ''), l);
        } else if (f.name.endsWith('.comments.json')) {
          // offene Fäden = Wurzelkommentare ohne «erledigt»
          const read = await be.read(`projects/${f.name}`);
          const cs = read ? parseComments(read.text) : [];
          openComments.set(f.name.replace(/\.comments\.json$/, ''), cs.filter(c => !c.parentId && c.resolved !== true).length);
        }
      }
      for (const f of files) {
        if (!f.name.endsWith('.json') || f.name.endsWith('.lock.json') || f.name.endsWith('.comments.json')) continue;
        const read = await be.read(`projects/${f.name}`);
        if (!read) continue;
        const p = parseProject(read.text, read.version);
        if (!p) continue;
        const slug = f.name.replace(/\.json$/, '');
        const lock = locks.get(slug);
        const open = openComments.get(slug) ?? 0;
        items.push({ slug, ...p, ...(lock ? { lock } : {}), ...(open ? { openComments: open } : {}) });
      }
    } catch (e) {
      console.error('[arch-review] refreshProjects:', e);
    }
    items.sort((a, b) => (a.data.name || a.slug).localeCompare(b.data.name || b.slug, 'de'));
    setProjects(items);
  }, []);

  const refreshProjects = useCallback(async () => {
    if (backendRef.current) await refreshProjectsIn(backendRef.current);
  }, [refreshProjectsIn]);

  // ── users.json: wer arbeitet in diesem Ordner (für @-Erwähnungen) ──────────
  const parseUsers = (text: string): DirectoryUser[] => {
    try {
      const f = JSON.parse(text) as Partial<UsersFile>;
      return Array.isArray(f?.users) ? f.users.filter(u => u && typeof u.email === 'string' && typeof u.name === 'string') : [];
    } catch {
      return [];
    }
  };
  const loadUsersIn = useCallback(async (be: StorageBackend) => {
    try {
      const read = await be.read('users.json');
      setKnownUsers(read ? parseUsers(read.text) : []);
    } catch {
      setKnownUsers([]);
    }
  }, []);
  // Angemeldete Person eintragen bzw. «zuletzt gesehen» nachziehen (ETag,
  // bei Konflikt wiederholen; ohne Schreibrecht still überspringen)
  const registerUser = useCallback(async (be: StorageBackend, u: { name: string; email: string }) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      let cur: { text: string; version: string } | null = null;
      try { cur = await be.read('users.json'); } catch { return; }
      const prev = cur ? parseUsers(cur.text) : [];
      const me = { name: u.name, email: u.email, lastSeen: nowIsoWithTimezone() };
      const users = [...prev.filter(x => x.email.toLowerCase() !== u.email.toLowerCase()), { ...(prev.find(x => x.email.toLowerCase() === u.email.toLowerCase()) ?? {}), ...me }]
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      const file: UsersFile = { version: 1, users };
      const w = await be.write('users.json', JSON.stringify(file, null, 2), cur ? { ifMatch: cur.version } : { createOnly: true });
      if (w.ok) { setKnownUsers(users); return; }
      if (w.reason !== 'conflict' && w.reason !== 'exists') return;
    }
  }, []);
  const registeredRef = useRef('');
  useEffect(() => {
    const be = backendRef.current;
    const u = auth.user;
    if (!storage || !be || !u?.email) return;
    const key = `${storage.kind}:${storage.name}:${u.email}`;
    if (registeredRef.current === key) return;
    registeredRef.current = key;
    void registerUser(be, { name: u.name, email: u.email });
  }, [storage, auth.user, registerUser]);

  // Entra-Suche (Graph /users?$search) — nur mit Anmeldung; Zustimmung zu
  // User.ReadBasic.All holt sich jede Person selbst (requestDirectoryConsent)
  const searchDirectory = useCallback(async (query: string): Promise<DirectorySearchResult> => {
    const q = query.trim().replace(/"/g, '');
    if (!q) return { ok: true, users: [] };
    // Entwicklung: ?dirfail=consent|forbidden simuliert eine fehlende Berechtigung
    const simulate = import.meta.env.DEV ? new URLSearchParams(location.search).get('dirfail') : null;
    if (simulate === 'consent') return { ok: false, reason: 'consent', message: 'Für die Suche im Verzeichnis fehlt noch deine Zustimmung zur Berechtigung «Grundlegende Profile aller Benutzer lesen» (User.ReadBasic.All).' };
    if (simulate === 'forbidden') return { ok: false, reason: 'forbidden', message: 'Microsoft Graph verweigert die Benutzersuche: Die Berechtigung User.ReadBasic.All fehlt in der App-Registrierung (Entra → App-Registrierungen → API-Berechtigungen).' };
    const t = await authRef.current.tryToken(DIRECTORY_SCOPES);
    if (!t.ok) {
      if (t.reason === 'noAccount') return { ok: false, reason: 'noLogin', message: 'Keine Anmeldung — die Entra-Suche steht nur mit Microsoft-Anmeldung zur Verfügung.' };
      if (t.reason === 'interaction') return { ok: false, reason: 'consent', message: 'Für die Suche im Verzeichnis fehlt noch deine Zustimmung zur Berechtigung «Grundlegende Profile aller Benutzer lesen» (User.ReadBasic.All).' };
      return { ok: false, reason: 'error', message: t.message };
    }
    const base = graphBase() ?? 'https://graph.microsoft.com/v1.0';
    const search = encodeURIComponent(`"displayName:${q}" OR "mail:${q}" OR "userPrincipalName:${q}"`);
    try {
      const res = await fetch(`${base}/users?$search=${search}&$select=displayName,mail,userPrincipalName&$top=8`, {
        headers: { Authorization: `Bearer ${t.token}`, ConsistencyLevel: 'eventual' },
      });
      if (res.status === 403 || res.status === 401) {
        return { ok: false, reason: 'forbidden', message: 'Microsoft Graph verweigert die Benutzersuche: Die Berechtigung User.ReadBasic.All fehlt in der App-Registrierung (Entra → App-Registrierungen → API-Berechtigungen).' };
      }
      if (!res.ok) return { ok: false, reason: 'error', message: `Benutzersuche fehlgeschlagen (HTTP ${res.status}).` };
      const data = await res.json();
      const users: DirectoryUser[] = (data.value ?? [])
        .map((u: { displayName?: string; mail?: string; userPrincipalName?: string }) => ({
          name: String(u.displayName ?? '').trim(), email: String(u.mail ?? u.userPrincipalName ?? '').trim(),
        }))
        .filter((u: DirectoryUser) => u.name && u.email);
      return { ok: true, users };
    } catch (e) {
      return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }, []);
  const requestDirectoryConsent = useCallback(() => authRef.current.requestConsent(DIRECTORY_SCOPES), []);

  const activate = useCallback(async (be: StorageBackend, info: StorageInfo) => {
    // Lokaler Ordner: ein gemerkter SharePoint-Modus darf keine Anmeldung mehr
    // erzwingen — ob dieser Ordner sie verlangt, sagt allein seine model.json
    if (be.kind === 'local') { try { localStorage.removeItem(MODE_KEY); } catch { /* ignore */ } }
    backendRef.current = be;
    registeredRef.current = '';
    setStorage(info);
    setSavedHandleName(null);
    savedHandleRef.current = null;
    await loadModel(be);
    await loadUsersIn(be);
    try { await be.ensureDir('projects'); } catch { /* readonly? Liste bleibt leer */ }
    await refreshProjectsIn(be);
  }, [loadModel, loadUsersIn, refreshProjectsIn]);

  // ── lokaler Ordner ────────────────────────────────────────────────────────
  const pickDirectory = useCallback(async () => {
    try {
      // ?opfs = Testmodus: Origin Private File System statt Dateidialog (Entwicklung/Tests)
      const dir = new URLSearchParams(location.search).has('opfs')
        ? await navigator.storage.getDirectory()
        : await window.showDirectoryPicker({ mode: 'readwrite' });
      await persistHandle(dir);
      storeSharePoint(null); setSavedSharePoint(null);
      await activate(new LocalBackend(dir), { kind: 'local', name: dir.name || 'Ordner' });
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[arch-review] pickDirectory:', e);
    }
  }, [activate]);

  const reconnectDirectory = useCallback(async () => {
    const handle = savedHandleRef.current;
    if (!handle) return;
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') await activate(new LocalBackend(handle), { kind: 'local', name: handle.name || 'Ordner' });
    } catch (e) {
      console.error('[arch-review] reconnectDirectory:', e);
    }
  }, [activate]);

  // ── SharePoint-Ordner ─────────────────────────────────────────────────────
  const tokenProvider = useCallback(() => getTokenRef.current(GRAPH_SCOPES), []);

  const activateSharePoint = useCallback(async (folder: SharePointFolder) => {
    const be = new GraphBackend(folder, tokenProvider, graphBase());
    await activate(be, { kind: 'sharepoint', name: folder.name, webUrl: folder.webUrl });
  }, [activate, tokenProvider]);

  const connectSharePoint = useCallback(async (link: string) => {
    try {
      const folder = await resolveFolderLink(tokenProvider, link, graphBase());
      storeSharePoint(folder); setSavedSharePoint(folder);
      await activateSharePoint(folder);
      return { ok: true as const };
    } catch (e) {
      console.error('[arch-review] connectSharePoint:', e);
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, [activateSharePoint, tokenProvider]);

  const reconnectSharePoint = useCallback(async () => {
    const f = loadSharePoint();
    if (f) await activateSharePoint(f);
  }, [activateSharePoint]);

  const forgetSharePoint = useCallback(() => {
    storeSharePoint(null); setSavedSharePoint(null);
  }, []);

  const queueSharePoint = useCallback((link: string) => {
    storeSharePoint(null); setSavedSharePoint(null);
    try { localStorage.setItem(PENDING_FOLDER_KEY, link.trim()); localStorage.setItem(MODE_KEY, 'sharepoint'); } catch { /* ignore */ }
  }, []);

  const disconnect = useCallback(() => {
    backendRef.current = null;
    setStorage(null); setModel(null); modelRef.current = null; setProjects([]); setKnownUsers([]);
  }, []);

  // Beim Start: gemerkten Ordner wiederherstellen. SharePoint sobald die
  // Anmeldung steht; lokal direkt, wenn die Berechtigung noch gilt, sonst
  // «Wieder verbinden» anbieten (braucht Geste).
  const autoRef = useRef(false);
  useEffect(() => {
    // Ordner aus dem Einrichtungs-Link: sobald angemeldet, verbinden (unabhängig
    // vom übrigen Auto-Reconnect — der Link wird erst im Auth-Effekt ausgewertet)
    const pending = (() => { try { return localStorage.getItem(PENDING_FOLDER_KEY); } catch { return null; } })();
    if (pending && !loadSharePoint()) {
      if (auth.status === 'signedIn' || (auth.status === 'disabled' && graphBase())) {
        try { localStorage.removeItem(PENDING_FOLDER_KEY); } catch { /* ignore */ }
        connectSharePoint(pending).then(r => { if (!r.ok) console.error('[arch-review] Einrichtungs-Link Ordner:', r.message); });
      }
      return;
    }
    if (autoRef.current) return;
    const sp = loadSharePoint();
    if (sp) {
      if (auth.status === 'signedIn' || (auth.status === 'disabled' && graphBase())) {
        autoRef.current = true;
        activateSharePoint(sp).catch(e => console.error('[arch-review] SharePoint reconnect:', e));
      }
      return;
    }
    autoRef.current = true;
    (async () => {
      try {
        const handle = await loadStoredHandle();
        if (!handle) return;
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await activate(new LocalBackend(handle), { kind: 'local', name: handle.name || 'Ordner' });
        } else {
          savedHandleRef.current = handle;
          setSavedHandleName(handle.name || 'gemerkter Ordner');
        }
      } catch {
        // IndexedDB nicht verfügbar oder Handle ungültig
      }
    })();
  }, [auth.status, activate, activateSharePoint, connectSharePoint]);

  // ── Projekte ──────────────────────────────────────────────────────────────
  const loadProject = useCallback(async (slug: string) => {
    const be = backendRef.current;
    if (!be) return null;
    try {
      const read = await be.read(`projects/${slug}.json`);
      return read ? parseProject(read.text, read.version) : null;
    } catch {
      return null;
    }
  }, []);

  // Schreibt projects/<slug>.json. Mit expectedVersion wird vor dem Schreiben
  // geprüft, ob die Datei inzwischen extern geändert wurde (Konflikt).
  // null = bewusst überschreiben.
  const saveProject = useCallback(async (data: Project, expectedVersion: string | null): Promise<SaveResult> => {
    const be = backendRef.current;
    if (!be) return { status: 'error', message: 'Kein Ordner gewählt.' };
    let json: string;
    try {
      json = JSON.stringify(data, null, 2); // erst serialisieren, dann schreiben
    } catch {
      return { status: 'error', message: 'Projektdaten konnten nicht serialisiert werden.' };
    }
    const w = await be.write(`projects/${data.slug}.json`, json, expectedVersion != null ? { ifMatch: expectedVersion } : {});
    if (!w.ok) {
      if (w.reason === 'conflict') return { status: 'conflict', currentVersion: w.currentVersion ?? '' };
      return { status: 'error', message: w.reason === 'forbidden' ? w.message : 'Schreiben fehlgeschlagen — die Datei wurde NICHT gespeichert.' };
    }
    setProjects(prev => {
      const rest = prev.filter(p => p.slug !== data.slug);
      const old = prev.find(p => p.slug === data.slug);
      const next = [...rest, { slug: data.slug, data, version: w.version, ...(old?.openComments ? { openComments: old.openComments } : {}) }];
      next.sort((a, b) => (a.data.name || a.slug).localeCompare(b.data.name || b.slug, 'de'));
      return next;
    });
    return { status: 'saved', version: w.version };
  }, []);

  const createProject = useCallback(async (name: string, slug: string, ms10?: Ms10Data) => {
    const be = backendRef.current;
    if (!be) return { ok: false as const, message: 'Kein Ordner gewählt.' };
    let project: Project = {
      version: 1,
      slug,
      name,
      description: '',
      responsibleProject: '',
      responsibleArchitecture: '',
      classification: null,
      architectureRelevant: null,
      createdAt: todayIso(),
      updatedAt: nowIsoWithTimezone(),
      reviews: {},
    };
    if (ms10) project = applyMs10(project, ms10);
    let json: string;
    try { json = JSON.stringify(project, null, 2); } catch { return { ok: false as const, message: 'Projektdaten konnten nicht serialisiert werden.' }; }
    try { await be.ensureDir('projects'); } catch { /* write meldet es */ }
    const w = await be.write(`projects/${slug}.json`, json, { createOnly: true });
    if (!w.ok) {
      if (w.reason === 'exists') return { ok: false as const, message: 'Ein Projekt mit diesem Slug existiert bereits.' };
      return { ok: false as const, message: w.message };
    }
    setProjects(prev => [...prev, { slug, data: project, version: w.version }]
      .sort((a, b) => (a.data.name || a.slug).localeCompare(b.data.name || b.slug, 'de')));
    return { ok: true as const };
  }, []);

  // ── Bearbeitungssperre ────────────────────────────────────────────────────
  const lockPath = (slug: string) => `projects/${slug}.lock.json`;
  const userRef = useRef(auth.user);
  userRef.current = auth.user;

  const readLock = useCallback(async (slug: string): Promise<ProjectLock | null> => {
    const be = backendRef.current;
    if (!be) return null;
    try {
      const read = await be.read(lockPath(slug));
      return read ? parseLock(read.text) : null;
    } catch {
      return null;
    }
  }, []);

  // Sperre holen/verlängern: frei oder abgelaufen oder eigene → schreiben
  // (mit ETag/createOnly gegen Wettläufe); fremde gültige → 'held', ausser force
  const acquireLock = useCallback(async (slug: string, force = false): Promise<LockResult> => {
    const be = backendRef.current;
    if (!be) return { status: 'error', message: 'Kein Ordner gewählt.' };
    try {
      const cur = await be.read(lockPath(slug));
      const existing = cur ? parseLock(cur.text) : null;
      if (!force && lockValid(existing) && existing.session !== sessionId()) return { status: 'held', lock: existing };
      const now = new Date();
      const lock: ProjectLock = {
        user: userRef.current?.name ?? 'Unbekannt',
        email: userRef.current?.email ?? '',
        session: sessionId(),
        since: existing && existing.session === sessionId() ? existing.since : now.toISOString(),
        lastActivity: now.toISOString(),
        until: new Date(now.getTime() + LOCK_LEASE_MS).toISOString(),
      };
      const w = await be.write(lockPath(slug), JSON.stringify(lock, null, 2), cur ? { ifMatch: cur.version } : { createOnly: true });
      if (w.ok) return { status: 'acquired', lock, version: w.version };
      if (w.reason === 'conflict' || w.reason === 'exists') {
        // jemand war schneller → nochmals lesen
        const again = await be.read(lockPath(slug));
        const other = again ? parseLock(again.text) : null;
        if (lockValid(other) && other.session !== sessionId()) return { status: 'held', lock: other };
        return { status: 'error', message: 'Sperre konnte nicht gesetzt werden — bitte erneut versuchen.' };
      }
      return { status: 'error', message: w.message };
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  const renewLock = useCallback((slug: string) => acquireLock(slug, false), [acquireLock]);

  const releaseLock = useCallback(async (slug: string, keepalive = false): Promise<void> => {
    const be = backendRef.current;
    if (!be) return;
    try {
      // nur die eigene Sperre entfernen
      const cur = await be.read(lockPath(slug));
      const l = cur ? parseLock(cur.text) : null;
      if (l && l.session !== sessionId()) return;
      await be.delete(lockPath(slug), { keepalive });
    } catch (e) {
      console.warn('[arch-review] releaseLock:', e);
    }
  }, []);

  // ── Projekt duplizieren / löschen ─────────────────────────────────────────
  // Kopie: Stammdaten, Klassifikation und alle Themen-Reviews (Antworten,
  // Bemerkungen, Relevanz) werden übernommen; die Meilenstein-Köpfe
  // (geprüft/freigegeben, Prüfer/in, Ergebnis) werden zurückgesetzt, damit die
  // Kopie nicht als freigegeben erscheint. Bemerkungen der Köpfe bleiben.
  const duplicateProject = useCallback(async (sourceSlug: string, name: string, slug: string) => {
    const be = backendRef.current;
    if (!be) return { ok: false as const, message: 'Kein Ordner gewählt.' };
    const src = await loadProject(sourceSlug);
    if (!src) return { ok: false as const, message: 'Quellprojekt konnte nicht gelesen werden.' };
    const reviews: Project['reviews'] = {};
    for (const [key, r] of Object.entries(src.data.reviews ?? {})) {
      const copy = JSON.parse(JSON.stringify(r)) as Partial<Review>;
      if (/^(m\d+|ms\d+|foundation)$/i.test(key)) {
        // Meilenstein-Kopf
        delete copy.approved; delete copy.approvedBy;
        copy.reviewed = false; copy.result = null;
      }
      reviews[key] = copy;
    }
    const project: Project = {
      ...JSON.parse(JSON.stringify(src.data)),
      slug, name,
      createdAt: todayIso(),
      updatedAt: nowIsoWithTimezone(),
      reviews,
    };
    let json: string;
    try { json = JSON.stringify(project, null, 2); } catch { return { ok: false as const, message: 'Projektdaten konnten nicht serialisiert werden.' }; }
    const w = await be.write(`projects/${slug}.json`, json, { createOnly: true });
    if (!w.ok) {
      if (w.reason === 'exists') return { ok: false as const, message: 'Ein Projekt mit diesem Slug existiert bereits.' };
      return { ok: false as const, message: w.message };
    }
    setProjects(prev => [...prev, { slug, data: project, version: w.version }]
      .sort((a, b) => (a.data.name || a.slug).localeCompare(b.data.name || b.slug, 'de')));
    return { ok: true as const };
  }, [loadProject]);

  // Löschen: nicht, solange eine andere Person/Sitzung das Projekt bearbeitet.
  // Entfernt die Projektdatei und die eigene Sperrdatei. Kein Papierkorb —
  // die Bestätigung passiert in der Oberfläche.
  const deleteProject = useCallback(async (slug: string) => {
    const be = backendRef.current;
    if (!be) return { ok: false as const, message: 'Kein Ordner gewählt.' };
    try {
      const cur = await be.read(`projects/${slug}.lock.json`);
      const l = cur ? parseLock(cur.text) : null;
      if (lockValid(l) && l.session !== sessionId()) {
        return { ok: false as const, message: `Projekt wird gerade von ${l.user || 'einer anderen Person'} bearbeitet — später nochmals versuchen.` };
      }
      const exists = await be.read(`projects/${slug}.json`);
      if (!exists) return { ok: false as const, message: 'Projektdatei nicht gefunden.' };
      await be.delete(`projects/${slug}.json`);
      // Kontrolle: delete meldet «fehlt bereits» nicht als Fehler — deshalb nachlesen
      const still = await be.read(`projects/${slug}.json`);
      if (still) return { ok: false as const, message: 'Projekt konnte nicht gelöscht werden (keine Berechtigung?).' };
      await be.delete(`projects/${slug}.lock.json`);
      await be.delete(`projects/${slug}.comments.json`);
      setProjects(prev => prev.filter(p => p.slug !== slug));
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  // ── Quelldateien ──────────────────────────────────────────────────────────
  const sourcePath = (slug: string, storedName: string) => `projects/${slug}/sources/${storedName}`;

  const uploadSourceFile = useCallback(async (slug: string, storedName: string, file: File) => {
    const be = backendRef.current;
    if (!be) return { ok: false as const, message: 'Kein Ordner gewählt.' };
    try { await be.ensureDir(`projects/${slug}/sources`); } catch { /* write meldet es */ }
    const w = await be.writeBlob(sourcePath(slug, storedName), file, { createOnly: true });
    if (!w.ok) return { ok: false as const, message: w.message };
    return { ok: true as const };
  }, []);

  const downloadSourceFile = useCallback(async (slug: string, storedName: string): Promise<Blob | null> => {
    const be = backendRef.current;
    if (!be) return null;
    try {
      const r = await be.readBlob(sourcePath(slug, storedName));
      return r?.blob ?? null;
    } catch (e) {
      console.error('[arch-review] downloadSourceFile:', e);
      return null;
    }
  }, []);

  const deleteSourceFile = useCallback(async (slug: string, storedName: string): Promise<void> => {
    const be = backendRef.current;
    if (!be) return;
    try { await be.delete(sourcePath(slug, storedName)); } catch (e) { console.warn('[arch-review] deleteSourceFile:', e); }
  }, []);

  // ── Kommentare ────────────────────────────────────────────────────────────
  const commentsPath = (slug: string) => `projects/${slug}.comments.json`;

  const loadComments = useCallback(async (slug: string): Promise<Comment[]> => {
    const be = backendRef.current;
    if (!be) return [];
    try {
      const read = await be.read(commentsPath(slug));
      return read ? parseComments(read.text) : [];
    } catch {
      return [];
    }
  }, []);

  // Read-modify-write mit ETag: Kommentare sind Einzelobjekte mit id, die
  // Änderungsfunktion ist auf jedem Stand anwendbar (hinzufügen, erledigen,
  // löschen) — deshalb lässt sich ein Konflikt durch Wiederholen auflösen.
  const updateComments = useCallback(async (slug: string, mutate: (prev: Comment[]) => Comment[]) => {
    const be = backendRef.current;
    if (!be) return { ok: false as const, message: 'Kein Ordner gewählt.' };
    for (let attempt = 0; attempt < 4; attempt++) {
      let cur: { text: string; version: string } | null;
      try { cur = await be.read(commentsPath(slug)); } catch (e) {
        return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
      }
      const prev = cur ? parseComments(cur.text) : [];
      const comments = mutate(prev);
      const file: CommentsFile = { version: 1, comments };
      const w = await be.write(commentsPath(slug), JSON.stringify(file, null, 2), cur ? { ifMatch: cur.version } : { createOnly: true });
      if (w.ok) return { ok: true as const, comments };
      if (w.reason === 'conflict' || w.reason === 'exists') continue; // jemand war schneller → auf neuem Stand wiederholen
      return { ok: false as const, message: w.reason === 'forbidden' ? w.message : 'Kommentar konnte nicht gespeichert werden.' };
    }
    return { ok: false as const, message: 'Kommentar konnte nicht gespeichert werden (gleichzeitige Änderungen) — bitte erneut versuchen.' };
  }, []);

  // Admin-Modus: Stammdaten (Themen/Fragen) zurück in die model.json schreiben
  // (dorthin, wo sie geladen wurde)
  const saveModel = useCallback(async (m: Model): Promise<{ ok: true } | { ok: false; message: string }> => {
    const be = backendRef.current;
    if (!be) return { ok: false, message: 'Kein Ordner gewählt.' };
    let json: string;
    try {
      json = JSON.stringify(m, null, 2);
    } catch {
      return { ok: false, message: 'Stammdaten konnten nicht serialisiert werden.' };
    }
    const path = modelPathRef.current;
    const w = await be.write(path, json);
    if (!w.ok) return { ok: false, message: w.reason === 'forbidden' || w.reason === 'error' ? `${path} konnte nicht geschrieben werden: ${w.message}` : `${path} konnte nicht geschrieben werden.` };
    setModel(m);
    modelRef.current = m;
    return { ok: true };
  }, []);

  // Admin: Berechtigungen der model.json mit denen des Datenordners vergleichen
  const checkModelSecurity = useCallback(async (): Promise<SecurityCheckResult> => {
    const be = backendRef.current;
    if (!be) return { ok: false, reason: 'error', message: 'Kein Ordner gewählt.' };
    if (!be.permissions) {
      return { ok: false, reason: 'local', message: 'Lokaler Ordner: Wer die model.json ändern darf, bestimmen die Rechte des Dateisystems bzw. der Sync-Freigabe — keine automatische Prüfung.' };
    }
    const path = modelPathRef.current;
    const [root, model, legacy] = await Promise.all([
      be.permissions(''),
      be.permissions(path),
      path === MODEL_PATH ? be.permissions(LEGACY_MODEL_PATH) : Promise.resolve(null),
    ]);
    for (const r of [root, model]) {
      if (!r.ok) return { ok: false, reason: r.reason === 'forbidden' ? 'forbidden' : 'error', message: r.message };
    }
    if (!root.ok || !model.ok) return { ok: false, reason: 'error', message: 'Berechtigungen konnten nicht gelesen werden.' };
    // alte Datei im Hauptordner: existiert, wenn sich ihre Berechtigungen lesen lassen (404 = weg)
    const legacyLeftover = !!legacy && (legacy.ok || legacy.reason !== 'notFound');
    return { ok: true, report: assessModelSecurity({ modelPath: path, root: root.permissions, model: model.permissions, legacyLeftover }) };
  }, []);

  const toggleTheme = () => setIsDark(d => !d);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  }, [isDark]);

  return (
    <Ctx.Provider value={{
      isDark, toggleTheme, storage,
      pickDirectory, savedHandleName, reconnectDirectory,
      connectSharePoint, savedSharePoint, reconnectSharePoint, forgetSharePoint, queueSharePoint, disconnect,
      model, modelError, modelPath, saveModel, checkModelSecurity,
      projects, refreshProjects, loadProject, saveProject, createProject, duplicateProject, deleteProject,
      uploadSourceFile, downloadSourceFile, deleteSourceFile,
      loadComments, updateComments,
      knownUsers, searchDirectory, requestDirectoryConsent,
      sessionId: sessionId(), readLock, acquireLock, renewLock, releaseLock,
    }}>
      {children}
    </Ctx.Provider>
  );
}
