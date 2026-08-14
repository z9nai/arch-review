import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Model, Project } from './types';
import { DEFAULT_MODEL } from './defaultModel';
import { applyMs10, Ms10Data } from './ms10';
import { nowIsoWithTimezone, todayIso } from './util';

export interface ProjectListItem {
  slug: string;
  data: Project;
  lastModified: number;
}

export type SaveResult =
  | { status: 'saved'; lastModified: number }
  | { status: 'conflict'; currentLastModified: number }
  | { status: 'error'; message: string };

interface StoreCtx {
  isDark: boolean;
  toggleTheme: () => void;
  dirHandle: FileSystemDirectoryHandle | null;
  pickDirectory: () => Promise<void>;
  savedHandleName: string | null;
  reconnectDirectory: () => Promise<void>;
  model: Model | null;
  modelError: string | null;
  projects: ProjectListItem[];
  refreshProjects: () => Promise<void>;
  loadProject: (slug: string) => Promise<{ data: Project; lastModified: number } | null>;
  saveProject: (data: Project, expectedLastModified: number | null) => Promise<SaveResult>;
  createProject: (name: string, slug: string, ms10?: Ms10Data) => Promise<{ ok: true } | { ok: false; message: string }>;
}

const Ctx = createContext<StoreCtx>(null!);
export const useStore = () => useContext(Ctx);

// ── IndexedDB: gewählten Ordner über die Sitzung hinaus merken ──────────────
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

async function readProjectFile(handle: FileSystemFileHandle): Promise<{ data: Project; lastModified: number } | null> {
  const file = await handle.getFile();
  try {
    return { data: JSON.parse(await file.text()) as Project, lastModified: file.lastModified };
  } catch {
    return null; // unlesbare Datei überspringen
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [savedHandleName, setSavedHandleName] = useState<string | null>(null);
  const dirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const modelRef = useRef<Model | null>(null);
  const savedHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const loadModel = useCallback(async (dir: FileSystemDirectoryHandle) => {
    let fh: FileSystemFileHandle;
    try {
      fh = await dir.getFileHandle('model.json');
    } catch {
      // model.json fehlt → mit dem Standard-Katalog anlegen
      try {
        fh = await dir.getFileHandle('model.json', { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(DEFAULT_MODEL, null, 2));
        await w.close();
        setModel(DEFAULT_MODEL);
        modelRef.current = DEFAULT_MODEL;
        setModelError(null);
      } catch {
        setModel(null);
        modelRef.current = null;
        setModelError('model.json fehlt und konnte nicht angelegt werden.');
      }
      return;
    }
    try {
      const file = await fh.getFile();
      const m = JSON.parse(await file.text()) as Model;
      setModel(m);
      modelRef.current = m;
      setModelError(null);
    } catch {
      // vorhandene, aber defekte Datei NICHT überschreiben
      setModel(null);
      modelRef.current = null;
      setModelError('model.json ist unlesbar (kein gültiges JSON).');
    }
  }, []);

  const refreshProjectsIn = useCallback(async (dir: FileSystemDirectoryHandle) => {
    const items: ProjectListItem[] = [];
    try {
      const pd = await dir.getDirectoryHandle('projects');
      for await (const [name, handle] of pd.entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
        const read = await readProjectFile(handle as FileSystemFileHandle);
        if (read) items.push({ slug: name.replace(/\.json$/, ''), ...read });
      }
    } catch {
      // kein projects-Ordner vorhanden → leere Liste
    }
    items.sort((a, b) => (a.data.name || a.slug).localeCompare(b.data.name || b.slug, 'de'));
    setProjects(items);
  }, []);

  const refreshProjects = useCallback(async () => {
    if (dirRef.current) await refreshProjectsIn(dirRef.current);
  }, [refreshProjectsIn]);

  const activateDir = useCallback(async (dir: FileSystemDirectoryHandle) => {
    dirRef.current = dir;
    setDirHandle(dir);
    setSavedHandleName(null);
    savedHandleRef.current = null;
    await loadModel(dir);
    // projects-Ordner anlegen, falls er fehlt
    try { await dir.getDirectoryHandle('projects', { create: true }); } catch { /* readonly? Liste bleibt leer */ }
    await refreshProjectsIn(dir);
  }, [loadModel, refreshProjectsIn]);

  const pickDirectory = useCallback(async () => {
    try {
      // ?opfs = Testmodus: Origin Private File System statt Dateidialog (Entwicklung/Tests)
      const dir = new URLSearchParams(location.search).has('opfs')
        ? await navigator.storage.getDirectory()
        : await window.showDirectoryPicker({ mode: 'readwrite' });
      await persistHandle(dir);
      await activateDir(dir);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[arch-review] pickDirectory:', e);
    }
  }, [activateDir]);

  // Beim Start: gemerkten Ordner wiederherstellen. Ist die Berechtigung noch
  // gültig, direkt verbinden; sonst «Wieder verbinden» anbieten (braucht Geste).
  useEffect(() => {
    (async () => {
      try {
        const handle = await loadStoredHandle();
        if (!handle) return;
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await activateDir(handle);
        } else {
          savedHandleRef.current = handle;
          setSavedHandleName(handle.name || 'gemerkter Ordner');
        }
      } catch {
        // IndexedDB nicht verfügbar oder Handle ungültig
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconnectDirectory = useCallback(async () => {
    const handle = savedHandleRef.current;
    if (!handle) return;
    try {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') await activateDir(handle);
    } catch (e) {
      console.error('[arch-review] reconnectDirectory:', e);
    }
  }, [activateDir]);

  const loadProject = useCallback(async (slug: string) => {
    if (!dirRef.current) return null;
    try {
      const pd = await dirRef.current.getDirectoryHandle('projects');
      const fh = await pd.getFileHandle(`${slug}.json`);
      return await readProjectFile(fh);
    } catch {
      return null;
    }
  }, []);

  // Schreibt projects/<slug>.json. Mit expectedLastModified wird vor dem
  // Schreiben geprüft, ob die Datei inzwischen extern geändert wurde (Konflikt).
  // null = bewusst überschreiben.
  const saveProject = useCallback(async (data: Project, expectedLastModified: number | null): Promise<SaveResult> => {
    if (!dirRef.current) return { status: 'error', message: 'Kein Ordner gewählt.' };
    let json: string;
    try {
      json = JSON.stringify(data, null, 2); // erst serialisieren, dann schreiben
    } catch {
      return { status: 'error', message: 'Projektdaten konnten nicht serialisiert werden.' };
    }
    try {
      const pd = await dirRef.current.getDirectoryHandle('projects', { create: true });
      const fh = await pd.getFileHandle(`${data.slug}.json`, { create: true });
      if (expectedLastModified != null) {
        const cur = await fh.getFile();
        if (cur.lastModified > expectedLastModified) {
          return { status: 'conflict', currentLastModified: cur.lastModified };
        }
      }
      const w = await fh.createWritable();
      await w.write(json);
      await w.close();
      const f = await fh.getFile();
      setProjects(prev => {
        const rest = prev.filter(p => p.slug !== data.slug);
        const next = [...rest, { slug: data.slug, data, lastModified: f.lastModified }];
        next.sort((a, b) => (a.data.name || a.slug).localeCompare(b.data.name || b.slug, 'de'));
        return next;
      });
      return { status: 'saved', lastModified: f.lastModified };
    } catch (e) {
      console.error('[arch-review] saveProject:', e);
      return { status: 'error', message: 'Schreiben fehlgeschlagen — die Datei wurde NICHT gespeichert.' };
    }
  }, []);

  const createProject = useCallback(async (name: string, slug: string, ms10?: Ms10Data) => {
    if (!dirRef.current) return { ok: false as const, message: 'Kein Ordner gewählt.' };
    try {
      const pd = await dirRef.current.getDirectoryHandle('projects', { create: true });
      let exists = true;
      try { await pd.getFileHandle(`${slug}.json`); } catch { exists = false; }
      if (exists) return { ok: false as const, message: 'Ein Projekt mit diesem Slug existiert bereits.' };
    } catch {
      return { ok: false as const, message: 'projects-Ordner konnte nicht angelegt werden.' };
    }
    const foundation = modelRef.current?.factsheets.find(f => f.id === 'foundation');
    let project: Project = {
      version: 1,
      slug,
      name,
      description: '',
      responsibleProject: '',
      responsibleArchitecture: '',
      classification: null,
      reviewDepth: null,
      architectureRelevant: null,
      createdAt: todayIso(),
      updatedAt: nowIsoWithTimezone(),
      reviews: foundation
        ? { foundation: { relevant: true, reviewed: false, result: null, milestone: foundation.milestone, notes: '' } }
        : {},
    };
    if (ms10 && modelRef.current) project = applyMs10(project, ms10, modelRef.current);
    const res = await saveProject(project, null);
    if (res.status === 'saved') return { ok: true as const };
    return { ok: false as const, message: res.status === 'error' ? res.message : 'Speichern fehlgeschlagen.' };
  }, [saveProject]);

  const toggleTheme = () => setIsDark(d => !d);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  }, [isDark]);

  return (
    <Ctx.Provider value={{
      isDark, toggleTheme, dirHandle, pickDirectory, savedHandleName, reconnectDirectory, model, modelError,
      projects, refreshProjects, loadProject, saveProject, createProject,
    }}>
      {children}
    </Ctx.Provider>
  );
}
