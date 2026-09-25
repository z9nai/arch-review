// Anmeldung über Microsoft Entra ID (MSAL, Authorization Code Flow + PKCE).
//
// Die App ist eine reine Client-App. Beim lokalen Ordner ist die Anmeldung
// ein Zugangs-Gate für die Oberfläche (wer darf rein, wer ist Prüfer/in,
// welche Stufe); beim SharePoint-Ordner liefert sie zusätzlich das Token für
// Microsoft Graph — dort setzt SharePoint die Berechtigungen serverseitig
// durch.
//
// Konfiguration:
// - Tenant-/Client-ID (öffentliche Werte): `auth` in der model.json (Admin)
//   und lokal im Browser gemerkt (localStorage). Damit der SharePoint-Modus
//   schon VOR dem Ordner anmelden kann, lassen sich die IDs pro Browser
//   einmalig hinterlegen: über einen Einrichtungs-Link
//   (?setup=…, «Teilen») oder im Verbinden-Dialog (Verzeichnis-ID aus dem
//   SharePoint-Link, Anwendungs-ID eintragen). Nichts davon liegt im Repo.
// - Rollen (Admin/Reviewer/Viewer) und enabled (Login-Pflicht beim lokalen
//   Ordner): `auth` in der model.json.
// Die lokal gemerkten IDs bleiben erhalten, auch wenn eine model.json ohne
// IDs geladen wird. MSAL wird nur geladen, wenn eine Anmeldung ansteht.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { AccountInfo, PublicClientApplication } from '@azure/msal-browser';
import type { AuthSettings } from './types';

export type AuthConfig = AuthSettings;

export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccessLevel = 'admin' | 'reviewer' | 'viewer' | 'none';

export interface AuthUser {
  id: string;    // Objekt-ID in Entra (für Graph, z. B. Chat-Mitglied)
  name: string;
  email: string;
  roles: string[];
  level: AccessLevel;
  isAdmin: boolean;
}

export const LEVEL_LABELS: Record<AccessLevel, string> = {
  admin: 'Admin', reviewer: 'Reviewer', viewer: 'Viewer (nur lesen)', none: 'keine Berechtigung',
};

type AuthStatus = 'loading' | 'disabled' | 'signedOut' | 'signedIn' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  config: AuthConfig | null;
  /** Tenant-/Client-ID bekannt → Login möglich */
  loginAvailable: boolean;
  /** wirksame IDs */
  ids: { tenantId: string; clientId: string } | null;
  /** IDs für diesen Browser hinterlegen (Einrichtung) */
  setLocalIds: (tenantId: string, clientId: string) => void;
  login: () => Promise<void>;
  /** Anmeldung für den SharePoint-Modus (mit Graph-Berechtigung), auch ohne enabled.
   *  'ready' = angemeldet mit Graph-Token; 'redirect' = Anmeldung läuft; 'setup' = IDs fehlen */
  loginForSharePoint: () => Promise<'ready' | 'redirect' | 'setup'>;
  logout: () => Promise<void>;
  /** Access-Token für die angegebenen Scopes (still, sonst Redirect) */
  getToken: (scopes: string[]) => Promise<string>;
  /** Wie getToken, aber NIE ein Redirect: 'interaction' = Zustimmung fehlt (per
   *  requestConsent nachholbar), 'noAccount' = nicht angemeldet */
  tryToken: (scopes: string[]) => Promise<{ ok: true; token: string } | { ok: false; reason: 'noAccount' | 'interaction' | 'error'; message: string }>;
  /** Zustimmung für zusätzliche Scopes interaktiv einholen (Redirect, Seite lädt neu) */
  requestConsent: (scopes: string[]) => Promise<void>;
  /** Konfiguration aus der model.json übernehmen (beim Laden und nach Admin-Änderungen) */
  applyConfig: (cfg: AuthSettings | null | undefined) => void;
  /** Ordner wechseln, ohne sich anzumelden: Login-Pflicht des bisherigen
   *  Ordners in diesem Browser vergessen (IDs bleiben) */
  suspendLogin: () => void;
  /** SharePoint-Modus: Anmeldung ist für den Dateizugriff (Graph) nötig */
  sharePointMode: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const LOGIN_SCOPES = ['openid', 'profile', 'email'];
const GRAPH_LOGIN_SCOPES = ['openid', 'profile', 'email', 'Files.ReadWrite.All'];

// Redirect-URI = Ursprung + Basis-Pfad der App (lokal wie auf GitHub Pages)
const redirectUri = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

const CACHE_KEY = 'arch-review.auth';
const MODE_KEY = 'arch-review.mode';

function normalize(raw: unknown): AuthConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    enabled: r.enabled === true,
    tenantId: String(r.tenantId ?? '').trim(),
    clientId: String(r.clientId ?? '').trim(),
    ...(r.adminRole ? { adminRole: String(r.adminRole).trim() } : {}),
    ...(r.reviewerRole ? { reviewerRole: String(r.reviewerRole).trim() } : {}),
    ...(r.viewerRole ? { viewerRole: String(r.viewerRole).trim() } : {}),
  };
}

// Zugriffsstufe aus den App-Rollen im ID-Token
export function levelOf(roles: string[], cfg: AuthConfig | null): AccessLevel {
  const adminRole = cfg?.adminRole, reviewerRole = cfg?.reviewerRole, viewerRole = cfg?.viewerRole;
  if (!adminRole && !reviewerRole && !viewerRole) return 'admin';
  if (adminRole && roles.includes(adminRole)) return 'admin';
  if (reviewerRole && roles.includes(reviewerRole)) return 'reviewer';
  if (viewerRole && roles.includes(viewerRole)) return 'viewer';
  // keine passende Rolle: ohne konfigurierte Reviewer-Rolle gilt «angemeldet = Reviewer»
  return reviewerRole ? 'none' : 'reviewer';
}

function readCache(): AuthConfig | null {
  try { return normalize(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')); } catch { return null; }
}
function writeCache(cfg: AuthConfig | null) {
  try {
    if (cfg) localStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
}

export const PENDING_FOLDER_KEY = 'arch-review.pendingFolder';

// Einrichtungs-Link kompakt: ?setup=<Token>. Das Token ist nur KODIERT, nicht
// verschlüsselt — die IDs sind öffentliche Kennungen (sie stehen ohnehin in
// jeder Anmelde-URL). Aufbau (base64url): 1 Byte Version, Verzeichnis-ID und
// Anwendungs-ID als je 16 Bytes, danach der Ordner-Link (UTF-8, optional).
const SETUP_VERSION = 1;
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const guidBytes = (g: string) => Uint8Array.from(g.replace(/-/g, '').match(/../g)!.map(h => parseInt(h, 16)));
const bytesGuid = (b: Uint8Array) => {
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

function encodeSetup(tenantId: string, clientId: string, folder = ''): string {
  const f = new TextEncoder().encode(folder.trim());
  const out = new Uint8Array(33 + f.length);
  out[0] = SETUP_VERSION;
  out.set(guidBytes(tenantId), 1);
  out.set(guidBytes(clientId), 17);
  out.set(f, 33);
  return b64url(out);
}

function decodeSetup(token: string): { tenantId: string; clientId: string; folder: string } | null {
  try {
    const b = fromB64url(token.trim());
    if (b.length < 33 || b[0] !== SETUP_VERSION) return null;
    return {
      tenantId: bytesGuid(b.subarray(1, 17)),
      clientId: bytesGuid(b.subarray(17, 33)),
      folder: new TextDecoder().decode(b.subarray(33)),
    };
  } catch {
    return null;
  }
}

// Einrichtungs-Link aus URL-Parametern lesen: kompakt (?setup=…) oder im
// früheren Format (?tenant=…&client=…[&folder=…]) — alte Links gelten weiter
function setupFromParams(q: URLSearchParams): { tenantId: string; clientId: string; folder: string } | null {
  const token = q.get('setup');
  const r = token
    ? decodeSetup(token)
    : { tenantId: (q.get('tenant') ?? '').trim(), clientId: (q.get('client') ?? '').trim(), folder: (q.get('folder') ?? '').trim() };
  return r && GUID_RE.test(r.tenantId) && GUID_RE.test(r.clientId) ? r : null;
}

// Einrichtungs-Link einmalig übernehmen und aus der URL entfernen. Der
// SharePoint-Ordner wird nach der Anmeldung verbunden — er ersetzt einen
// bisher gemerkten Ordner.
function takeIdsFromUrl(): { tenantId: string; clientId: string } | null {
  try {
    const u = new URL(window.location.href);
    const r = setupFromParams(u.searchParams);
    if (!r) return null;
    if (/^https:\/\//i.test(r.folder)) {
      try {
        localStorage.removeItem('arch-review.sharepoint'); // gemerkter Ordner (store.tsx SP_KEY)
        localStorage.setItem(PENDING_FOLDER_KEY, r.folder); localStorage.setItem(MODE_KEY, 'sharepoint');
      } catch { /* ignore */ }
    }
    for (const k of ['setup', 'tenant', 'client', 'folder']) u.searchParams.delete(k);
    window.history.replaceState(null, '', u.toString());
    return { tenantId: r.tenantId, clientId: r.clientId };
  } catch {
    return null;
  }
}

// Einrichtungs-Link für die Weitergabe (Admin): IDs + SharePoint-Ordner
export function setupLink(tenantId: string, clientId: string, folderUrl?: string): string {
  const u = new URL(`${window.location.origin}${import.meta.env.BASE_URL}`);
  u.searchParams.set('setup', encodeSetup(tenantId, clientId, folderUrl));
  return u.toString();
}

// Einrichtungs-Link in ein Eingabefeld eingefügt (statt geöffnet)? → IDs und Ordner
export function parseSetupLink(text: string): { tenantId: string; clientId: string; folder: string } | null {
  try {
    return setupFromParams(new URL(text.trim()).searchParams);
  } catch {
    return null;
  }
}

// Verzeichnis-ID (Tenant) aus einem SharePoint-Link ermitteln: Die Adresse
// firma.sharepoint.com (OneDrive: firma-my.sharepoint.com) gehört zum Tenant
// firma.onmicrosoft.com; dessen GUID steht öffentlich in der
// OpenID-Konfiguration (ohne Anmeldung, im Browser abrufbar). Klappt nicht
// bei umbenannten Tenants — dann trägt man die ID selbst ein.
export async function resolveTenantId(link: string): Promise<string> {
  let host = '';
  try { host = new URL(link.trim()).hostname.toLowerCase(); } catch { /* s. u. */ }
  const m = host.match(/^([a-z0-9-]+?)(?:-my)?\.sharepoint\.com$/);
  if (!m) throw new Error('Das ist kein SharePoint-Link (…sharepoint.com) — Verzeichnis-ID bitte selbst eintragen.');
  let res: Response;
  try {
    res = await fetch(`https://login.microsoftonline.com/${m[1]}.onmicrosoft.com/v2.0/.well-known/openid-configuration`);
  } catch {
    throw new Error('Verzeichnis-ID konnte nicht ermittelt werden (Netzwerk) — bitte selbst eintragen.');
  }
  const issuer = res.ok ? String((await res.json().catch(() => ({}))).issuer ?? '') : '';
  const guid = issuer.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!guid) throw new Error(`Verzeichnis-ID für «${m[1]}» nicht gefunden — bitte selbst eintragen.`);
  return guid;
}

const devBypass = () => import.meta.env.DEV && new URLSearchParams(location.search).has('noauth');
// Entwicklung: ?noauth&me=vorname.nachname@firma.ch simuliert eine angemeldete
// Person (Name aus der E-Mail) — für Kommentare, users.json, Teams-Mock
function devUser(): AuthUser | null {
  if (!devBypass()) return null;
  const email = (new URLSearchParams(location.search).get('me') ?? '').trim();
  if (!email.includes('@')) return null;
  const name = email.split('@')[0].split(/[._-]+/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  return { id: `dev-${email}`, name, email, roles: [], level: 'admin', isAdmin: true };
}
const isValidIds = (cfg: { tenantId: string; clientId: string } | null | undefined): cfg is { tenantId: string; clientId: string } =>
  !!cfg && GUID_RE.test(cfg.tenantId) && GUID_RE.test(cfg.clientId);
const sharePointMode = () => { try { return localStorage.getItem(MODE_KEY) === 'sharepoint'; } catch { return false; } };

function toUser(account: AccountInfo, cfg: AuthConfig | null): AuthUser {
  const claims = (account.idTokenClaims ?? {}) as Record<string, unknown>;
  const name = String(claims.name ?? account.name ?? account.username);
  const email = String(claims.preferred_username ?? claims.email ?? account.username);
  const roles = Array.isArray(claims.roles) ? (claims.roles as unknown[]).map(String) : [];
  const level = levelOf(roles, cfg);
  return { id: account.localAccountId, name, email, roles, level, isAdmin: level === 'admin' };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const pcaRef = useRef<PublicClientApplication | null>(null);
  const accountRef = useRef<AccountInfo | null>(null);
  const configRef = useRef<AuthConfig | null>(null);
  const runningKeyRef = useRef<string>(''); // IDs, mit denen MSAL läuft

  const effectiveIds = (cfg: AuthConfig | null) =>
    isValidIds(cfg) ? { tenantId: cfg.tenantId, clientId: cfg.clientId } : null;

  // MSAL starten: Rückkehr vom Login verarbeiten, sonst vorhandenes Konto verwenden
  const startMsal = useCallback(async (ids: { tenantId: string; clientId: string }) => {
    const key = `${ids.tenantId}|${ids.clientId}`;
    if (runningKeyRef.current === key && pcaRef.current) return pcaRef.current;
    runningKeyRef.current = key;
    setStatus('loading');
    setError(null);
    try {
      const { PublicClientApplication } = await import('@azure/msal-browser');
      const pca = new PublicClientApplication({
        auth: {
          clientId: ids.clientId,
          authority: `https://login.microsoftonline.com/${ids.tenantId}`,
          redirectUri: redirectUri(),
          postLogoutRedirectUri: redirectUri(),
        },
        cache: { cacheLocation: 'localStorage' },
      });
      await pca.initialize();
      pcaRef.current = pca;
      const result = await pca.handleRedirectPromise();
      // Konto des konfigurierten Tenants bevorzugen (Browser kann mehrere kennen)
      const all = pca.getAllAccounts();
      const account = result?.account ?? all.find(a => a.tenantId === ids.tenantId) ?? all[0] ?? null;
      if (runningKeyRef.current !== key) return pca; // inzwischen andere IDs
      if (account) {
        pca.setActiveAccount(account);
        accountRef.current = account;
        setUser(toUser(account, configRef.current));
        setStatus('signedIn');
      } else {
        accountRef.current = null;
        setUser(null);
        setStatus('signedOut');
      }
      return pca;
    } catch (e) {
      console.error('[arch-review] auth:', e);
      if (runningKeyRef.current === key) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
      return null;
    }
  }, []);

  const applyConfig = useCallback((raw: AuthSettings | null | undefined) => {
    let cfg = normalize(raw);
    // Lokal bekannte IDs behalten, wenn die model.json keine (gültigen) liefert
    const prev = readCache();
    if (!isValidIds(cfg) && isValidIds(prev)) {
      cfg = { ...(cfg ?? { enabled: false, tenantId: '', clientId: '' }), tenantId: prev.tenantId, clientId: prev.clientId };
    }
    writeCache(cfg);
    setConfig(cfg);
    configRef.current = cfg;
    // Stufe mit den neuen Rollen neu berechnen
    if (accountRef.current) setUser(toUser(accountRef.current, cfg));
    if (devBypass()) { setUser(devUser()); setStatus('disabled'); return; }
    const needLogin = cfg?.enabled === true || sharePointMode();
    // eine noch laufende MSAL-Initialisierung (z. B. mit der beim Start
    // gemerkten Einstellung) darf den Status danach nicht mehr überschreiben
    if (!needLogin) { runningKeyRef.current = ''; setStatus('disabled'); return; }
    const ids = effectiveIds(cfg);
    if (!ids) {
      runningKeyRef.current = '';
      if (cfg?.enabled) {
        setError('Anmeldung ist aktiviert, aber Tenant-ID/Client-ID sind keine gültigen IDs (Admin → Anmeldung).');
        setStatus('error');
      } else {
        setStatus('disabled');
      }
      return;
    }
    void startMsal(ids);
  }, [startMsal]);

  // Aus dem Login-Gate heraus einen anderen Ordner wählen: Die Login-Pflicht
  // stammt aus der model.json des bisherigen Ordners (bzw. dem SharePoint-
  // Modus) und ist im Browser gemerkt — ohne diesen Ausweg käme man nie zurück
  // zur Ordnerwahl. Die IDs bleiben; der nächste Ordner bringt seine eigene
  // Einstellung mit (model.json → applyConfig), SharePoint verlangt ohnehin
  // die Anmeldung.
  const suspendLogin = useCallback(() => {
    try { localStorage.removeItem(MODE_KEY); localStorage.removeItem(PENDING_FOLDER_KEY); } catch { /* ignore */ }
    const prev = readCache();
    const cfg = prev ? { ...prev, enabled: false } : null;
    writeCache(cfg);
    setConfig(cfg);
    configRef.current = cfg;
    runningKeyRef.current = '';
    setError(null);
    setStatus('disabled');
  }, []);

  // IDs für diesen Browser hinterlegen (Einrichtungsdialog / Link / Datei)
  const setLocalIds = useCallback((tenantId: string, clientId: string) => {
    const prev = readCache();
    const cfg: AuthConfig = { ...(prev ?? { enabled: false, tenantId: '', clientId: '' }), tenantId: tenantId.trim(), clientId: clientId.trim() };
    applyConfig(cfg);
  }, [applyConfig]);

  // Start: Einrichtungs-Link auswerten, dann zuletzt bekannte Konfiguration
  // anwenden (z. B. Rückkehr vom Microsoft-Login); die model.json des Ordners
  // aktualisiert sie anschliessend über applyConfig
  const appliedRef = useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    const fromUrl = takeIdsFromUrl();
    if (fromUrl) setLocalIds(fromUrl.tenantId, fromUrl.clientId);
    else applyConfig(readCache());
  }, [applyConfig, setLocalIds]);

  const login = async () => {
    const pca = pcaRef.current;
    if (!pca) return;
    try {
      await pca.loginRedirect({ scopes: sharePointMode() ? GRAPH_LOGIN_SCOPES : LOGIN_SCOPES, prompt: 'select_account' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const loginForSharePoint = async (): Promise<'ready' | 'redirect' | 'setup'> => {
    if (devBypass()) return 'ready'; // Entwicklung mit Graph-Mock
    const ids = effectiveIds(configRef.current ?? readCache());
    if (!ids) return 'setup';
    try { localStorage.setItem(MODE_KEY, 'sharepoint'); } catch { /* ignore */ }
    const pca = await startMsal(ids);
    if (!pca) return 'redirect';
    const account = pca.getActiveAccount();
    try {
      if (account) {
        // Schon angemeldet: Graph-Token still holen; klappt das nicht (z. B.
        // fehlende Zustimmung oder fremde Browser-Sitzung), interaktiv nachholen
        try {
          await pca.acquireTokenSilent({ scopes: GRAPH_LOGIN_SCOPES, account });
          return 'ready';
        } catch {
          await pca.acquireTokenRedirect({ scopes: GRAPH_LOGIN_SCOPES, account, loginHint: account.username });
          return 'redirect';
        }
      }
      await pca.loginRedirect({ scopes: GRAPH_LOGIN_SCOPES, prompt: 'select_account' });
      return 'redirect';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
      return 'redirect';
    }
  };

  const logout = async () => {
    const pca = pcaRef.current;
    if (!pca) return;
    await pca.logoutRedirect({ account: pca.getActiveAccount() ?? undefined });
  };

  const getToken = useCallback(async (scopes: string[]): Promise<string> => {
    if (devBypass()) return 'dev-token';
    const pca = pcaRef.current;
    const account = pca?.getActiveAccount() ?? accountRef.current;
    if (!pca || !account) throw new Error('Nicht angemeldet.');
    try {
      const res = await pca.acquireTokenSilent({ scopes, account });
      return res.accessToken;
    } catch (e) {
      const code = (e as { errorCode?: string })?.errorCode ?? (e instanceof Error ? e.name : 'unbekannt');
      console.warn('[arch-review] acquireTokenSilent:', code, e);
      // Stille Erneuerung gescheitert (fehlende Zustimmung, abgelaufene oder
      // fremde Browser-Sitzung) → einmal interaktiv; Schleifenschutz pro Sitzung
      const guardKey = `arch-review.tokenRedirect:${scopes.join(' ')}`;
      const last = Number(sessionStorage.getItem(guardKey) ?? 0);
      if (Date.now() - last > 20_000) {
        sessionStorage.setItem(guardKey, String(Date.now()));
        try {
          await pca.acquireTokenRedirect({ scopes, account, loginHint: account.username });
          throw new Error('Anmeldung wird erneuert …');
        } catch (e2) {
          const code2 = (e2 as { errorCode?: string })?.errorCode;
          if (code2 === 'interaction_in_progress') {
            throw new Error('Eine Anmeldung ist noch in Arbeit — bitte Seite neu laden.');
          }
          throw e2;
        }
      }
      throw new Error(`Token-Erneuerung fehlgeschlagen (${code}) — bitte Seite neu laden und erneut anmelden.`);
    }
  }, []);

  const tryToken = useCallback(async (scopes: string[]) => {
    if (devBypass()) return { ok: false as const, reason: 'noAccount' as const, message: 'Entwicklung ohne Anmeldung.' };
    const pca = pcaRef.current;
    const account = pca?.getActiveAccount() ?? accountRef.current;
    if (!pca || !account) return { ok: false as const, reason: 'noAccount' as const, message: 'Nicht angemeldet.' };
    try {
      const res = await pca.acquireTokenSilent({ scopes, account });
      return { ok: true as const, token: res.accessToken };
    } catch (e) {
      const code = (e as { errorCode?: string })?.errorCode ?? '';
      const name = e instanceof Error ? e.name : '';
      const interaction = name === 'InteractionRequiredAuthError' || /interaction_required|consent_required|invalid_grant/i.test(code);
      return { ok: false as const, reason: interaction ? 'interaction' as const : 'error' as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  const requestConsent = useCallback(async (scopes: string[]) => {
    const pca = pcaRef.current;
    const account = pca?.getActiveAccount() ?? accountRef.current;
    if (!pca || !account) return;
    await pca.acquireTokenRedirect({ scopes, account, loginHint: account.username });
  }, []);

  const ids = effectiveIds(config);
  const loginAvailable = !!ids;

  return (
    <AuthContext.Provider value={{ status, user, error, config, loginAvailable, ids, setLocalIds, login, loginForSharePoint, logout, getToken, tryToken, requestConsent, applyConfig, suspendLogin, sharePointMode: sharePointMode() }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ausserhalb von AuthProvider');
  return ctx;
}

// Was darf die aktuelle Person? Ohne aktive Anmeldung: alles.
export function usePermissions(): { level: AccessLevel; canAdmin: boolean; canEdit: boolean; canView: boolean } {
  const { status, user } = useAuth();
  // Entwicklung: ?noauth&as=viewer|reviewer simuliert eine Stufe ohne Login
  const devAs = import.meta.env.DEV ? new URLSearchParams(location.search).get('as') : null;
  const level: AccessLevel = status === 'disabled'
    ? (devAs === 'viewer' || devAs === 'reviewer' ? devAs : 'admin')
    : (user?.level ?? 'none');
  return {
    level,
    canAdmin: level === 'admin',
    canEdit: level === 'admin' || level === 'reviewer',
    canView: level !== 'none',
  };
}
