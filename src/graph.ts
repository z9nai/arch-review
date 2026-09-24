// SharePoint-Ordner über Microsoft Graph (delegiert, Token aus der
// Entra-Anmeldung). Konflikterkennung über ETags (If-Match → 412),
// Anlegen ohne Überschreiben über conflictBehavior=fail (→ 409).
import type { BlobReadResult, FileInfo, ItemPermission, PermissionsResult, ReadResult, StorageBackend, WriteResult } from './backend';

export const GRAPH_SCOPES = ['Files.ReadWrite.All'];
const DEFAULT_BASE = 'https://graph.microsoft.com/v1.0';

export interface SharePointFolder {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
}

export type TokenProvider = () => Promise<string>;

const enc = encodeURIComponent;

// Freigabelink → Graph-Sharing-Token («u!» + base64url)
function shareId(link: string): string {
  const b64 = btoa(unescape(encodeURIComponent(link.trim())))
    .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return `u!${b64}`;
}

async function graphFetch(getToken: TokenProvider, base: string, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${base}${path}`, { ...init, headers });
}

// Ordner aus einem SharePoint-/OneDrive-Link auflösen
export async function resolveFolderLink(getToken: TokenProvider, link: string, base = DEFAULT_BASE): Promise<SharePointFolder> {
  const res = await graphFetch(getToken, base, `/shares/${shareId(link)}/driveItem?$select=id,name,webUrl,folder,parentReference`);
  if (res.status === 403) throw new Error('Kein Zugriff auf diesen Ordner (SharePoint-Berechtigung prüfen).');
  if (!res.ok) throw new Error(`Link konnte nicht aufgelöst werden (HTTP ${res.status}).`);
  const item = await res.json();
  if (!item.folder) throw new Error('Der Link zeigt nicht auf einen Ordner.');
  const driveId = item.parentReference?.driveId;
  if (!driveId || !item.id) throw new Error('Unerwartete Antwort von Microsoft Graph.');
  return { driveId, itemId: item.id, name: item.name ?? 'SharePoint-Ordner', webUrl: item.webUrl ?? link };
}

// Graph-Berechtigung → ItemPermission. SharePoint liefert Site-Gruppen
// (Besitzer/Mitglieder/Besucher) als grantedToV2.siteGroup, Freigabelinks
// mit link.scope; roles z. B. ['owner'] / ['write'] / ['read'].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toItemPermission(p: any): ItemPermission {
  const roles: string[] = Array.isArray(p?.roles) ? p.roles.map((r: unknown) => String(r).toLowerCase()) : [];
  const inherited = !!p?.inheritedFrom;
  if (p?.link) {
    const scope = String(p.link.scope ?? 'users');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const who = (p.grantedToIdentitiesV2 ?? p.grantedToIdentities ?? []).map((g: any) =>
      g?.user?.displayName ?? g?.siteUser?.displayName ?? g?.user?.email).filter(Boolean);
    return {
      key: `link:${p.id ?? p.link.webUrl ?? scope}`,
      name: `Freigabelink (${scope === 'anonymous' ? 'jede Person mit dem Link' : scope === 'organization' ? 'ganze Organisation' : who.length ? who.join(', ') : 'bestimmte Personen'})`,
      kind: 'link', roles, inherited, linkScope: scope,
    };
  }
  const g = p?.grantedToV2 ?? p?.grantedTo ?? {};
  const pick: [ItemPermission['kind'], unknown][] = [
    ['siteGroup', g.siteGroup], ['group', g.group], ['user', g.user ?? g.siteUser], ['application', g.application],
  ];
  const [kind, principal] = pick.find(([, v]) => v) ?? ['other', null];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pr = (principal ?? {}) as any;
  const name = String(pr.displayName ?? pr.email ?? pr.loginName ?? pr.id ?? 'unbekannt');
  const id = String(pr.id ?? pr.loginName ?? pr.email ?? name);
  return { key: `${kind}:${id}`, name, kind, roles, inherited };
}

export class GraphBackend implements StorageBackend {
  kind = 'sharepoint' as const;
  constructor(private folder: SharePointFolder, private getToken: TokenProvider, private base = DEFAULT_BASE) {}
  get name() { return this.folder.name; }

  private itemPath(path: string): string {
    const rel = path.split('/').filter(Boolean).map(enc).join('/');
    return `/drives/${enc(this.folder.driveId)}/items/${enc(this.folder.itemId)}:/${rel}`;
  }

  private f(path: string, init?: RequestInit) { return graphFetch(this.getToken, this.base, path, init); }

  private async fetchContent(path: string): Promise<{ res: Response; eTag: string } | null> {
    const meta = await this.f(`${this.itemPath(path)}?$select=id,eTag,@microsoft.graph.downloadUrl`);
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error(`Lesen fehlgeschlagen (HTTP ${meta.status}).`);
    const m = await meta.json();
    const url = m['@microsoft.graph.downloadUrl'];
    // Download-URL ist vorauthentifiziert (ohne Authorization-Header laden)
    const body = url
      ? await fetch(url)
      : await this.f(`${this.itemPath(path)}:/content`);
    if (!body.ok) throw new Error(`Lesen fehlgeschlagen (HTTP ${body.status}).`);
    return { res: body, eTag: String(m.eTag ?? '') };
  }

  async read(path: string): Promise<ReadResult | null> {
    const r = await this.fetchContent(path);
    return r ? { text: await r.res.text(), version: r.eTag } : null;
  }

  async readBlob(path: string): Promise<BlobReadResult | null> {
    const r = await this.fetchContent(path);
    return r ? { blob: await r.res.blob(), version: r.eTag } : null;
  }

  private async putContent(path: string, body: string | Blob, opts: { ifMatch?: string; createOnly?: boolean } = {}): Promise<WriteResult> {
    const headers: Record<string, string> = {};
    if (typeof body === 'string') headers['Content-Type'] = 'application/json';
    else if (body.type) headers['Content-Type'] = body.type;
    if (opts.ifMatch) headers['If-Match'] = opts.ifMatch;
    const q = opts.createOnly ? '?@microsoft.graph.conflictBehavior=fail' : '';
    let res: Response;
    try {
      res = await this.f(`${this.itemPath(path)}:/content${q}`, { method: 'PUT', headers, body });
    } catch (e) {
      return { ok: false, reason: 'error', message: `Netzwerkfehler: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (res.ok) {
      const m = await res.json().catch(() => ({}));
      return { ok: true, version: String(m.eTag ?? '') };
    }
    if (res.status === 412) {
      const cur = await this.f(`${this.itemPath(path)}?$select=eTag`).then(r => r.ok ? r.json() : null).catch(() => null);
      return { ok: false, reason: 'conflict', message: 'Datei wurde inzwischen von jemand anderem geändert.', currentVersion: String(cur?.eTag ?? '') };
    }
    if (res.status === 409) return { ok: false, reason: 'exists', message: 'Datei existiert bereits.' };
    if (res.status === 403 || res.status === 401) return { ok: false, reason: 'forbidden', message: 'Keine Schreibberechtigung in SharePoint (nur Lesen?).' };
    return { ok: false, reason: 'error', message: `Schreiben fehlgeschlagen (HTTP ${res.status}).` };
  }

  async write(path: string, text: string, opts: { ifMatch?: string; createOnly?: boolean } = {}): Promise<WriteResult> {
    return this.putContent(path, text, opts);
  }

  async writeBlob(path: string, blob: Blob, opts: { ifMatch?: string; createOnly?: boolean } = {}): Promise<WriteResult> {
    return this.putContent(path, blob, opts);
  }

  async list(dir: string): Promise<FileInfo[]> {
    const out: FileInfo[] = [];
    let next: string | null = `${this.itemPath(dir)}:/children?$select=name,eTag,file&$top=200`;
    while (next) {
      const res: Response = await this.f(next.startsWith('http') ? next.slice(this.base.length) : next);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`Auflisten fehlgeschlagen (HTTP ${res.status}).`);
      const page = await res.json();
      for (const it of page.value ?? []) {
        if (it.file) out.push({ name: it.name, version: String(it.eTag ?? '') });
      }
      next = page['@odata.nextLink'] ?? null;
    }
    return out;
  }

  async delete(path: string, opts: { keepalive?: boolean } = {}): Promise<void> {
    const res = await this.f(this.itemPath(path), { method: 'DELETE', keepalive: opts.keepalive === true });
    if (!res.ok && res.status !== 404) throw new Error(`Löschen fehlgeschlagen (HTTP ${res.status}).`);
  }

  async permissions(path: string): Promise<PermissionsResult> {
    const item = path
      ? `${this.itemPath(path)}:`
      : `/drives/${enc(this.folder.driveId)}/items/${enc(this.folder.itemId)}`;
    const out: ItemPermission[] = [];
    let next: string | null = `${item}/permissions`;
    try {
      while (next) {
        const res: Response = await this.f(next.startsWith('http') ? next.slice(this.base.length) : next);
        if (res.status === 404) return { ok: false, reason: 'notFound', message: 'Datei nicht gefunden.' };
        if (res.status === 403 || res.status === 401) {
          return { ok: false, reason: 'forbidden', message: 'Berechtigungen nicht lesbar — nur Besitzer/innen der Site dürfen sie sehen.' };
        }
        if (!res.ok) return { ok: false, reason: 'error', message: `Berechtigungen konnten nicht gelesen werden (HTTP ${res.status}).` };
        const page = await res.json();
        for (const p of page.value ?? []) out.push(toItemPermission(p));
        next = page['@odata.nextLink'] ?? null;
      }
    } catch (e) {
      return { ok: false, reason: 'error', message: `Netzwerkfehler: ${e instanceof Error ? e.message : String(e)}` };
    }
    return { ok: true, permissions: out };
  }

  async ensureDir(dir: string): Promise<void> {
    const parts = dir.split('/').filter(Boolean);
    let parent = `/drives/${enc(this.folder.driveId)}/items/${enc(this.folder.itemId)}`;
    for (const p of parts) {
      const res = await this.f(`${parent}/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: p, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
      if (res.status === 201) {
        const it = await res.json();
        parent = `/drives/${enc(this.folder.driveId)}/items/${enc(it.id)}`;
      } else if (res.status === 409) {
        const existing = await this.f(`${parent}:/${enc(p)}?$select=id`);
        if (!existing.ok) throw new Error('Ordner konnte nicht angelegt werden.');
        const it = await existing.json();
        parent = `/drives/${enc(this.folder.driveId)}/items/${enc(it.id)}`;
      } else {
        throw new Error(`Ordner konnte nicht angelegt werden (HTTP ${res.status}).`);
      }
    }
  }
}
