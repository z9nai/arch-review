// Speicher-Backend: lokaler Ordner (File System Access API) oder
// SharePoint-Ordner (Microsoft Graph). Der Store arbeitet nur über diese
// Schnittstelle; Pfade sind relativ zum gewählten Ordner
// (`model.json`, `projects/<slug>.json`).
//
// «version» ist ein opaker String für die Konflikterkennung: beim lokalen
// Ordner lastModified, bei Graph das ETag.

export interface FileInfo { name: string; version: string }
export interface ReadResult { text: string; version: string }
export interface BlobReadResult { blob: Blob; version: string }
export type WriteResult =
  | { ok: true; version: string }
  | { ok: false; reason: 'conflict' | 'exists' | 'forbidden' | 'error'; message: string; currentVersion?: string };

export interface StorageBackend {
  kind: 'local' | 'sharepoint';
  name: string;
  /** null = Datei existiert nicht */
  read(path: string): Promise<ReadResult | null>;
  /** wie read, aber als Blob — für Binärdateien (z. B. hochgeladene Quellen) */
  readBlob(path: string): Promise<BlobReadResult | null>;
  write(path: string, text: string, opts?: { ifMatch?: string; createOnly?: boolean }): Promise<WriteResult>;
  /** wie write, aber mit einem Blob als Inhalt (z. B. hochgeladene Quellen) */
  writeBlob(path: string, blob: Blob, opts?: { ifMatch?: string; createOnly?: boolean }): Promise<WriteResult>;
  /** nur Dateien; leer, wenn der Ordner fehlt */
  list(dir: string): Promise<FileInfo[]>;
  ensureDir(dir: string): Promise<void>;
  /** Datei löschen; fehlt sie, ist das kein Fehler */
  delete(path: string, opts?: { keepalive?: boolean }): Promise<void>;
}

// ── Lokaler Ordner ───────────────────────────────────────────────────────────
export class LocalBackend implements StorageBackend {
  kind = 'local' as const;
  constructor(private root: FileSystemDirectoryHandle) {}
  get name() { return this.root.name || 'Ordner'; }

  private async dirOf(path: string, create: boolean): Promise<{ dir: FileSystemDirectoryHandle; file: string }> {
    const parts = path.split('/').filter(Boolean);
    const file = parts.pop()!;
    let dir = this.root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
    return { dir, file };
  }

  private async readAny(path: string): Promise<{ file: File; version: string } | null> {
    try {
      const { dir, file } = await this.dirOf(path, false);
      const fh = await dir.getFileHandle(file);
      const f = await fh.getFile();
      return { file: f, version: String(f.lastModified) };
    } catch {
      return null;
    }
  }

  async read(path: string): Promise<ReadResult | null> {
    const r = await this.readAny(path);
    return r ? { text: await r.file.text(), version: r.version } : null;
  }

  async readBlob(path: string): Promise<BlobReadResult | null> {
    const r = await this.readAny(path);
    return r ? { blob: r.file, version: r.version } : null;
  }

  private async writeAny(path: string, body: string | Blob, opts: { ifMatch?: string; createOnly?: boolean }): Promise<WriteResult> {
    try {
      const { dir, file } = await this.dirOf(path, true);
      if (opts.createOnly) {
        let exists = true;
        try { await dir.getFileHandle(file); } catch { exists = false; }
        if (exists) return { ok: false, reason: 'exists', message: 'Datei existiert bereits.' };
      }
      const fh = await dir.getFileHandle(file, { create: true });
      if (opts.ifMatch != null) {
        const cur = await fh.getFile();
        if (cur.lastModified > Number(opts.ifMatch)) {
          return { ok: false, reason: 'conflict', message: 'Datei wurde inzwischen geändert.', currentVersion: String(cur.lastModified) };
        }
      }
      const w = await fh.createWritable();
      await w.write(body);
      await w.close();
      const f = await fh.getFile();
      return { ok: true, version: String(f.lastModified) };
    } catch (e) {
      console.error('[arch-review] LocalBackend.write:', e);
      return { ok: false, reason: 'error', message: 'Schreiben fehlgeschlagen.' };
    }
  }

  async write(path: string, text: string, opts: { ifMatch?: string; createOnly?: boolean } = {}): Promise<WriteResult> {
    return this.writeAny(path, text, opts);
  }

  async writeBlob(path: string, blob: Blob, opts: { ifMatch?: string; createOnly?: boolean } = {}): Promise<WriteResult> {
    return this.writeAny(path, blob, opts);
  }

  async list(dir: string): Promise<FileInfo[]> {
    const out: FileInfo[] = [];
    try {
      let d = this.root;
      for (const p of dir.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p);
      for await (const [name, handle] of d.entries()) {
        if (handle.kind !== 'file') continue;
        const f = await (handle as FileSystemFileHandle).getFile();
        out.push({ name, version: String(f.lastModified) });
      }
    } catch {
      // Ordner fehlt
    }
    return out;
  }

  async ensureDir(dir: string): Promise<void> {
    let d = this.root;
    for (const p of dir.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: true });
  }

  async delete(path: string): Promise<void> {
    try {
      const { dir, file } = await this.dirOf(path, false);
      await dir.removeEntry(file);
    } catch {
      // fehlt bereits
    }
  }
}
