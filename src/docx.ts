// Word-Dokumente (Factsheets) aus dem geteilten Ordner lesen und als HTML
// rendern (mammoth, lazy geladen). Ergebnisse werden pro Pfad gecacht.

async function getFileByPath(dir: FileSystemDirectoryHandle, relPath: string): Promise<File> {
  const parts = relPath.split('/').filter(Boolean);
  let current: FileSystemDirectoryHandle = dir;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  const fh = await current.getFileHandle(parts[parts.length - 1]);
  return fh.getFile();
}

const cache = new Map<string, string>();

export type DocxResult = { status: 'ok'; html: string } | { status: 'notFound' } | { status: 'error' };

export async function loadDocxHtml(dir: FileSystemDirectoryHandle, relPath: string): Promise<DocxResult> {
  const cached = cache.get(relPath);
  if (cached !== undefined) return { status: 'ok', html: cached };
  let buf: ArrayBuffer;
  try {
    const file = await getFileByPath(dir, relPath);
    buf = await file.arrayBuffer();
  } catch {
    return { status: 'notFound' };
  }
  try {
    const mammoth = await import('mammoth');
    const res = await mammoth.convertToHtml({ arrayBuffer: buf });
    cache.set(relPath, res.value);
    return { status: 'ok', html: res.value };
  } catch (e) {
    console.error('[arch-review] loadDocxHtml:', relPath, e);
    return { status: 'error' };
  }
}

// Cache leeren (z. B. nach Ordnerwechsel)
export function clearDocxCache() {
  cache.clear();
}
