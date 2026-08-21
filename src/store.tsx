import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Model, Project } from './types';
import { DEFAULT_MODEL } from './defaultModel';
import { applyMs10, Ms10Data } from './ms10';
import { nowIsoWithTimezone, todayIso } from './util';
import { LocalBackend, StorageBackend } from './backend';
import { GRAPH_SCOPES, GraphBackend, resolveFolderLink, SharePointFolder } from './graph';
import { PENDING_FOLDER_KEY, useAuth } from './auth';

export interface ProjectListItem {
  slug: string;
  data: Project;
  version: string;
  lock?: ProjectLock; // gültige Bearbeitungssperre einer anderen Person/Sitzung
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
  disconnect: () => void;
  // Daten
  model: Model | null;
  modelError: string | null;
  saveModel: (m: Model) => Promise<{ ok: true } | { ok: false; message: string }>;
  projects: ProjectListItem[];
  refreshProjects: () => Promise<void>;
  loadProject: (slug: string) => Promise<{ data: Project; version: string } | null>;
  saveProject: (data: Project, expectedVersion: string | null) => Promise<SaveResult>;
  createProject: (name: string, slug: string, ms10?: Ms10Data) => Promise<{ ok: true } | { ok: false; message: string }>;
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
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [savedHandleName, setSavedHandleName] = useState<string | null>(null);
  const [savedSharePoint, setSavedSharePoint] = useState<SharePointFolder | null>(() => loadSharePoint());
  const backendRef = useRef<StorageBackend | null>(null);
  const modelRef = useRef<Model | null>(null);
  const savedHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const getTokenRef = useRef(auth.getToken);
  getTokenRef.current = auth.getToken;
  const idsRef = useRef(auth.ids);
  idsRef.current = auth.ids;

  const loadModel = useCallback(async (be: StorageBackend) => {
    try {
      const read = await be.read('model.json');
      if (!read) {
        // model.json fehlt → mit dem Standard-Katalog anlegen; Anmelde-IDs
        // und Standardrollen gleich eintragen, wenn bekannt (SharePoint-Modus)
        const ids = idsRef.current;
        const fresh: Model = ids
          ? { ...DEFAULT_MODEL, auth: { enabled: false, tenantId: ids.tenantId, clientId: ids.clientId, adminRole: 'ArchReview.Admin', reviewerRole: 'ArchReview.Reviewer', viewerRole: 'ArchReview.Viewer' } }
          : DEFAULT_MODEL;
        const w = await be.write('model.json', JSON.stringify(fresh, null, 2), { createOnly: true });
        if (!w.ok && w.reason !== 'exists') {
          setModel(null); modelRef.current = null;
          setModelError(w.reason === 'forbidden'
            ? 'model.json fehlt und kann nicht angelegt werden (keine Schreibberechtigung).'
            : 'model.json fehlt und konnte nicht angelegt werden.');
          return;
        }
        setModel(fresh); modelRef.current = fresh; setModelError(null);
        return;
      }
      try {
        const m = normalizeModel(JSON.parse(read.text));
        setModel(m); modelRef.current = m; setModelError(null);
      } catch {
        // vorhandene, aber defekte Datei NICHT überschreiben
        setModel(null); modelRef.current = null;
        setModelError('model.json ist unlesbar (kein gültiges JSON).');
      }
    } catch (e) {
      console.error('[arch-review] loadModel:', e);
      setModel(null); modelRef.current = null;
      setModelError(`model.json konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const refreshProjectsIn = useCallback(async (be: StorageBackend) => {
    const items: ProjectListItem[] = [];
    try {
      const files = await be.list('projects');
      const locks = new Map<string, ProjectLock>();
      for (const f of files) {
        if (!f.name.endsWith('.lock.json')) continue;
        const read = await be.read(`projects/${f.name}`);
        const l = read ? parseLock(read.text) : null;
        if (lockValid(l) && l.session !== sessionId()) locks.set(f.name.replace(/\.lock\.json$/, ''), l);
      }
      for (const f of files) {
        if (!f.name.endsWith('.json') || f.name.endsWith('.lock.json')) continue;
        const read = await be.read(`projects/${f.name}`);
        if (!read) continue;
        const p = parseProject(read.text, read.version);
        if (!p) continue;
        const slug = f.name.replace(/\.json$/, '');
        const lock = locks.get(slug);
        items.push({ slug, ...p, ...(lock ? { lock } : {}) });
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

  const activate = useCallback(async (be: StorageBackend, info: StorageInfo) => {
    backendRef.current = be;
    setStorage(info);
    setSavedHandleName(null);
    savedHandleRef.current = null;
    await loadModel(be);
    try { await be.ensureDir('projects'); } catch { /* readonly? Liste bleibt leer */ }
    await refreshProjectsIn(be);
  }, [loadModel, refreshProjectsIn]);

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

  const disconnect = useCallback(() => {
    backendRef.current = null;
    setStorage(null); setModel(null); modelRef.current = null; setProjects([]);
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
      const next = [...rest, { slug: data.slug, data, version: w.version }];
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

  // Admin-Modus: Stammdaten (Themen/Fragen) zurück in model.json schreiben
  const saveModel = useCallback(async (m: Model): Promise<{ ok: true } | { ok: false; message: string }> => {
    const be = backendRef.current;
    if (!be) return { ok: false, message: 'Kein Ordner gewählt.' };
    let json: string;
    try {
      json = JSON.stringify(m, null, 2);
    } catch {
      return { ok: false, message: 'Stammdaten konnten nicht serialisiert werden.' };
    }
    const w = await be.write('model.json', json);
    if (!w.ok) return { ok: false, message: w.reason === 'forbidden' || w.reason === 'error' ? `model.json konnte nicht geschrieben werden: ${w.message}` : 'model.json konnte nicht geschrieben werden.' };
    setModel(m);
    modelRef.current = m;
    return { ok: true };
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
      connectSharePoint, savedSharePoint, reconnectSharePoint, forgetSharePoint, disconnect,
      model, modelError, saveModel,
      projects, refreshProjects, loadProject, saveProject, createProject,
      sessionId: sessionId(), readLock, acquireLock, renewLock, releaseLock,
    }}>
      {children}
    </Ctx.Provider>
  );
}
