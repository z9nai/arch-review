import { useEffect, useState } from 'react';
import { Sun, Moon, FolderOpen, AlertTriangle, Wrench, LogIn, LogOut, ShieldCheck, Cloud, X, Link2, Check } from 'lucide-react';
import { useStore } from './store';
import { GUID_RE, LEVEL_LABELS, parseSetupLink, setupLink, PENDING_FOLDER_KEY, resolveTenantId, useAuth, usePermissions } from './auth';
import ProjectsView from './components/ProjectsView';
import OnePagerView from './components/OnePagerView';
import AdminView from './components/AdminView';

type View = { kind: 'projects' } | { kind: 'project'; slug: string; commentId?: string } | { kind: 'admin' };

// Deep Link (?project=<slug>&comment=<id>, siehe util.deepLink): beim Start
// aus der URL nehmen und im Tab merken — so überlebt er den Login-Redirect —
// und einlösen, sobald Ordner und model.json da sind.
const DEEP_LINK_KEY = 'arch-review.deepLink';
function takeDeepLink(): { slug: string; commentId?: string } | null {
  try {
    const u = new URL(window.location.href);
    const slug = (u.searchParams.get('project') ?? '').trim();
    const commentId = (u.searchParams.get('comment') ?? '').trim();
    if (slug) {
      u.searchParams.delete('project'); u.searchParams.delete('comment');
      window.history.replaceState(null, '', u.toString());
      const link = { slug, ...(commentId ? { commentId } : {}) };
      sessionStorage.setItem(DEEP_LINK_KEY, JSON.stringify(link));
      return link;
    }
    const stored = sessionStorage.getItem(DEEP_LINK_KEY);
    return stored ? JSON.parse(stored) as { slug: string; commentId?: string } : null;
  } catch {
    return null;
  }
}

export default function App() {
  const { isDark, toggleTheme, storage, pickDirectory, savedHandleName, reconnectDirectory, model, modelError,
    connectSharePoint, savedSharePoint, reconnectSharePoint, forgetSharePoint, queueSharePoint, disconnect } = useStore();
  const [spOpen, setSpOpen] = useState(false);
  const [spLink, setSpLink] = useState('');
  const [spBusy, setSpBusy] = useState(false);
  const [spError, setSpError] = useState('');
  const auth = useAuth();
  const { canAdmin, canView, level } = usePermissions();
  const [view, setView] = useState<View>({ kind: 'projects' });
  // Anmeldung aktiv und noch nicht angemeldet → Gate; Admin nur mit Rolle.
  // Ob ein lokaler Ordner die Anmeldung verlangt, steht erst in SEINER
  // model.json — die beim Start gemerkte Einstellung stammt vom zuletzt
  // geladenen Ordner. Solange kein Ordner geladen ist (z. B. «Wieder
  // verbinden» braucht nach dem Neustart einen Klick), daher die Ordnerwahl
  // zeigen statt des Gates. SharePoint braucht die Anmeldung immer (Graph).
  const loginPending = auth.status !== 'disabled' && auth.status !== 'signedIn';
  // model.json verlangt Anmeldung, die Einstellung ist aber noch nicht
  // übernommen (ein Render vor dem applyConfig-Effekt) → nichts durchlassen
  const configPending = model?.auth?.enabled === true && auth.config?.enabled !== true && auth.status === 'disabled';
  const gated = (loginPending && (auth.sharePointMode || !!storage)) || configPending;
  const dirHandle = storage; // Kurzname: verbundener Speicher (lokal oder SharePoint)

  // Deep Link einlösen, sobald die App bereit ist
  const [deepLinkPending] = useState(() => takeDeepLink());
  useEffect(() => {
    if (!deepLinkPending || !storage || !model || gated) return;
    try { sessionStorage.removeItem(DEEP_LINK_KEY); } catch { /* ignore */ }
    setView({ kind: 'project', slug: deepLinkPending.slug, ...(deepLinkPending.commentId ? { commentId: deepLinkPending.commentId } : {}) });
  }, [deepLinkPending, storage, model, gated]);

  // SharePoint verbinden — zuerst der Link, dann (falls nötig) die Anmeldung.
  // Einrichtungs-Link (Teilen) eingefügt → IDs und Ordner daraus. Sonst:
  // Verzeichnis-ID aus dem Link, Anwendungs-ID aus dem Feld bzw. die im
  // Browser gemerkte desselben Tenants — kennt der Browser keine, fragt der
  // Dialog danach (App-Registrierung liegt im Tenant der Organisation).
  // Braucht es den Microsoft-Login, wird der Ordner vorgemerkt und danach
  // automatisch verbunden (store: PENDING_FOLDER_KEY).
  const [spClient, setSpClient] = useState('');
  const [spTenant, setSpTenant] = useState('');
  const [spTenantManual, setSpTenantManual] = useState(false);
  const [spClientOpen, setSpClientOpen] = useState(false);
  const [spPreparing, setSpPreparing] = useState(false);
  const devNoAuth = import.meta.env.DEV && new URLSearchParams(location.search).has('noauth');
  const setupFromLink = parseSetupLink(spLink);
  const showIdOptions = !setupFromLink && !devNoAuth;
  const showClient = !auth.ids || spClientOpen; // ohne gemerkte IDs Pflicht
  const needSignIn = !auth.user && !devNoAuth;
  const startSharePoint = () => { setSpError(''); setSpOpen(true); };
  // gemerkten Ordner wieder verbinden: nur anmelden, kein Link nötig
  const reconnectSavedSharePoint = async () => {
    setSpPreparing(true);
    try {
      const r = await auth.loginForSharePoint();
      if (r === 'ready') await reconnectSharePoint();
      else if (r === 'setup') { setSpLink(savedSharePoint?.webUrl ?? ''); startSharePoint(); }
    } finally {
      setSpPreparing(false);
    }
  };
  const doConnectSharePoint = async () => {
    setSpBusy(true); setSpError('');
    try {
      let link = spLink.trim();
      let ids = auth.ids;
      if (setupFromLink) {
        if (!setupFromLink.folder) throw new Error('Der Einrichtungs-Link enthält keinen Ordner — bitte zusätzlich den Link zum SharePoint-Ordner einfügen.');
        link = setupFromLink.folder;
        ids = { tenantId: setupFromLink.tenantId, clientId: setupFromLink.clientId };
      } else if (!devNoAuth) {
        let tenantId = spTenant.trim();
        if (!tenantId) {
          try { tenantId = await resolveTenantId(link); }
          catch (e) {
            // nicht ermittelbar: gemerkte IDs verwenden, sonst nachfragen
            if (!ids) { setSpTenantManual(true); throw e; }
            tenantId = ids.tenantId;
          }
        }
        if (!GUID_RE.test(tenantId)) throw new Error('Verzeichnis-ID (Tenant) ist keine gültige ID (Format 8-4-4-4-12).');
        const own = showClient ? spClient.trim() : '';
        if (own && !GUID_RE.test(own)) throw new Error('Anwendungs-ID (Client) ist keine gültige ID (Format 8-4-4-4-12).');
        const clientId = own || (ids && ids.tenantId === tenantId ? ids.clientId : '');
        if (!clientId) {
          setSpClientOpen(true);
          throw new Error('Anwendungs-ID fehlt. Am einfachsten statt des Ordner-Links den Einrichtungs-Link einfügen («Teilen» bei jemandem, der schon verbunden ist) — oder die Anwendungs-ID vom Admin eintragen.');
        }
        ids = { tenantId, clientId };
      }
      if (!/^https:\/\//i.test(link)) throw new Error('Bitte den Link zum Ordner einfügen (beginnt mit https://).');
      queueSharePoint(link);
      if (ids && (ids.tenantId !== auth.ids?.tenantId || ids.clientId !== auth.ids?.clientId)) auth.setLocalIds(ids.tenantId, ids.clientId);
      const r = await auth.loginForSharePoint();
      if (r === 'setup') throw new Error('Anmelde-IDs fehlen.');
      if (r === 'redirect') return; // Microsoft-Anmeldung läuft; danach wird der Ordner verbunden
      // schon angemeldet: selbst verbinden — ausser der Store hat den
      // vorgemerkten Ordner inzwischen übernommen
      let pending: string | null = null;
      try { pending = localStorage.getItem(PENDING_FOLDER_KEY); localStorage.removeItem(PENDING_FOLDER_KEY); } catch { /* ignore */ }
      if (pending) {
        const res = await connectSharePoint(link);
        if (!res.ok) throw new Error(res.message);
      }
      setSpOpen(false); setSpLink(''); setSpClient(''); setSpTenant(''); setSpTenantManual(false); setSpClientOpen(false);
    } catch (e) {
      setSpError(e instanceof Error ? e.message : String(e));
    } finally {
      setSpBusy(false);
    }
  };

  const denied = auth.status === 'signedIn' && !canView;

  // Einrichtungs-Link für den aktuell verbundenen SharePoint-Ordner — mit den
  // IDs, mit denen diese Sitzung angemeldet ist. Wer ihn öffnet, landet nach
  // dem Login direkt in diesem Ordner (Zugriff regelt weiterhin SharePoint).
  const [shareCopied, setShareCopied] = useState(false);
  const shareLink = storage?.kind === 'sharepoint' && storage.webUrl && auth.ids
    ? setupLink(auth.ids.tenantId, auth.ids.clientId, storage.webUrl) : null;
  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.prompt('Link zu diesem Ordner kopieren:', shareLink);
    }
  };

  // Zurück zur Ordnerwahl — auch aus dem Login-Gate, «Keine Berechtigung» und
  // Fehlerseiten (sonst steckt man in der Login-Pflicht des letzten Ordners fest)
  const leaveFolder = () => { disconnect(); auth.suspendLogin(); setView({ kind: 'projects' }); };
  const folderName = storage?.name ?? savedSharePoint?.name ?? savedHandleName;

  // Anmelde-Konfiguration kommt aus der model.json des geteilten Ordners
  const applyConfig = auth.applyConfig;
  useEffect(() => { if (model) applyConfig(model.auth); }, [model, applyConfig]);

  const bg = isDark ? 'bg-[#0e0f11]' : 'bg-[#f5f4f0]';
  const border = isDark ? 'border-white/8' : 'border-black/8';
  const topBg = isDark ? 'bg-[#0c0d0f]' : 'bg-[#eae9e5]';
  const textBase = isDark ? 'text-white' : 'text-black';
  const textMuted = isDark ? 'text-white/40' : 'text-black/40';
  const leaveFolderLink = (
    <button onClick={leaveFolder} className={`block mx-auto mt-4 text-[11px] ${textMuted} hover:underline`}>
      {folderName ? <>Ordner «{folderName}» verlassen — anderen Ordner wählen</> : 'Anderen Ordner wählen'}
    </button>
  );

  return (
    <div className={`flex flex-col h-screen ${bg} ${textBase}`}>
      {/* Top bar */}
      <div className={`flex items-center gap-3 px-4 py-2 border-b ${border} ${topBg} flex-shrink-0`}>
        <a href="https://z9nai.ch" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 mr-1 opacity-80 hover:opacity-100 transition-opacity">
          <img src="favicon.png" alt="Z9nAI" className="w-6 h-6" />
        </a>
        <span className={`text-xs font-bold tracking-widest mr-4 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
          Z9nAI Arch Review
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Admin-Modus: Themen und Fragen pflegen */}
          {dirHandle && model && canAdmin && (
            <button
              onClick={() => setView(v => v.kind === 'admin' ? { kind: 'projects' } : { kind: 'admin' })}
              title="Admin — Themen und Fragen bearbeiten"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
                view.kind === 'admin'
                  ? isDark ? 'border-white/40 text-white bg-white/10' : 'border-black/40 text-black bg-black/10'
                  : isDark ? 'border-white/15 text-white/50 hover:border-white/30' : 'border-black/15 text-black/50 hover:border-black/30'
              }`}
            >
              <Wrench size={12} />
              Admin
            </button>
          )}

          {/* Angemeldete Person */}
          {auth.status === 'signedIn' && auth.user && (
            <div className={`flex items-center gap-2 text-[11px] ${textMuted}`} title={auth.user.email}>
              <span className="flex items-center gap-1" title={`${auth.user.email} · ${LEVEL_LABELS[level]}`}>
                {auth.user.isAdmin && auth.config?.adminRole && <ShieldCheck size={11} />}
                {auth.user.name}
                <span className="opacity-60">· {LEVEL_LABELS[level]}</span>
              </span>
              <button onClick={auth.logout} title="Abmelden"
                className={`p-1 rounded transition-colors ${isDark ? 'text-white/35 hover:text-white/70' : 'text-black/35 hover:text-black/70'}`}>
                <LogOut size={12} />
              </button>
            </div>
          )}

          {/* Link zu diesem SharePoint-Ordner teilen */}
          {!gated && !denied && shareLink && (
            <button onClick={copyShareLink}
              title={`Link kopieren, der Anmeldung und den Ordner «${dirHandle?.name ?? ''}» in einem Schritt einrichtet — Empfänger öffnen ihn und melden sich an. Zugriff erhält nur, wer in SharePoint berechtigt ist.`}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
                shareCopied
                  ? (isDark ? 'border-emerald-500/40 text-emerald-300' : 'border-emerald-400 text-emerald-700')
                  : (isDark ? 'border-white/15 text-white/50 hover:border-white/30' : 'border-black/15 text-black/50 hover:border-black/30')}`}>
              {shareCopied ? <Check size={12} /> : <Link2 size={12} />}
              {shareCopied ? 'Kopiert' : 'Teilen'}
            </button>
          )}

          {/* Geteilter Ordner (lokal oder SharePoint) */}
          {!gated && !denied && dirHandle && (
          <button
            onClick={() => { disconnect(); setView({ kind: 'projects' }); }}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30' : 'border-black/15 text-black/50 hover:border-black/30'}`}
            title={dirHandle.kind === 'sharepoint' ? `SharePoint: ${dirHandle.webUrl ?? ''} — Klick: anderen Ordner wählen` : 'Anderen Ordner wählen'}
          >
            {dirHandle.kind === 'sharepoint' ? <Cloud size={12} /> : <FolderOpen size={12} />}
            {dirHandle.name}
          </button>
          )}

          {/* Theme toggle */}
          <button onClick={toggleTheme}
            className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'text-white/35 hover:text-white/70' : 'text-black/35 hover:text-black/70'}`}>
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {gated ? (
          // Anmeldung (Microsoft Entra ID) — vor allem anderen
          <div className="h-full flex items-center justify-center p-6">
            <div className={`max-w-md w-full rounded-xl border p-8 text-center ${border} ${isDark ? 'bg-white/2' : 'bg-black/2'}`}>
              <LogIn size={28} className={`mx-auto mb-4 ${textMuted}`} />
              <h1 className={`text-sm font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                Architekturprüfung
              </h1>
              {auth.status === 'loading' ? (
                <>
                  <p className={`text-xs ${textMuted}`}>Anmeldung wird geprüft …</p>
                  {leaveFolderLink}
                </>
              ) : auth.status === 'error' ? (
                <>
                  <p className={`text-xs leading-relaxed mb-4 ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                    Anmeldung nicht möglich: {auth.error}
                  </p>
                  <button onClick={() => window.location.reload()}
                    className={`text-xs px-4 py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    Erneut versuchen
                  </button>
                  {leaveFolderLink}
                </>
              ) : (
                <>
                  <p className={`text-xs leading-relaxed mb-6 ${textMuted}`}>
                    {storage?.kind === 'local'
                      ? <>Der Ordner <span className="font-semibold">«{storage.name}»</span> verlangt eine Anmeldung (eingeschaltet unter Admin → Anmeldung).</>
                      : <>Der SharePoint-Ordner{folderName ? <> <span className="font-semibold">«{folderName}»</span></> : ''} ist nur mit Anmeldung erreichbar — der Dateizugriff läuft über Microsoft Graph.</>}
                    {' '}Die Anmeldung läuft über Microsoft Entra ID; die App selbst speichert keine Zugangsdaten.
                  </p>
                  <button onClick={auth.login}
                    className={`w-full flex items-center justify-center gap-2 text-xs px-4 py-2.5 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                    <LogIn size={12} /> Mit Microsoft anmelden
                  </button>
                  {leaveFolderLink}
                </>
              )}
            </div>
          </div>
        ) : denied ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className={`max-w-md w-full rounded-xl border p-8 text-center ${isDark ? 'border-rose-500/30 bg-rose-500/5' : 'border-rose-300 bg-rose-50'}`}>
              <AlertTriangle size={28} className={`mx-auto mb-4 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
              <p className={`text-xs leading-relaxed mb-2 ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                Keine Berechtigung für diese App.
              </p>
              <p className={`text-[11px] leading-relaxed mb-6 ${textMuted}`}>
                {auth.user?.email} ist angemeldet, hat aber keine der Rollen Admin, Reviewer oder Viewer.
                Die Zuweisung erfolgt in Entra unter «Unternehmensanwendungen → Benutzer und Gruppen».
              </p>
              <button onClick={auth.logout}
                className={`text-xs px-4 py-2.5 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                Abmelden
              </button>
              {leaveFolderLink}
            </div>
          </div>
        ) : !dirHandle ? (
          // Start / Speicherwahl
          <div className="h-full flex items-center justify-center p-6">
            <div className={`max-w-md w-full rounded-xl border p-8 text-center ${border} ${isDark ? 'bg-white/2' : 'bg-black/2'}`}>
              <FolderOpen size={28} className={`mx-auto mb-4 ${textMuted}`} />
              <h1 className={`text-sm font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                Architekturprüfung
              </h1>
              <p className={`text-xs leading-relaxed mb-6 ${textMuted}`}>
                Wo liegen <span className="font-semibold">config/model.json</span> und der Unterordner{' '}
                <span className="font-semibold">projects/</span>? Fehlen sie, werden sie automatisch angelegt.
                Kein eigener Server — die Daten bleiben im gewählten Ordner.
              </p>
              <div className="space-y-3">
                {/* SharePoint */}
                {savedSharePoint ? (
                  <div className="space-y-1">
                    <button onClick={reconnectSavedSharePoint} disabled={spPreparing}
                      className={`w-full flex items-center justify-center gap-2 text-xs px-4 py-2.5 rounded font-semibold transition-colors disabled:opacity-50 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                      <Cloud size={12} /> {spPreparing ? 'Anmeldung …' : `Wieder verbinden: ${savedSharePoint.name}`}
                    </button>
                    <button onClick={forgetSharePoint} className={`text-[10px] ${textMuted} hover:underline`}>anderen SharePoint-Ordner wählen</button>
                  </div>
                ) : (
                  <button onClick={startSharePoint} disabled={spPreparing}
                    title="Link zum SharePoint-Ordner einfügen und mit dem Microsoft-Konto anmelden"
                    className={`w-full flex items-center justify-center gap-2 text-xs px-4 py-2.5 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                    <Cloud size={12} /> {spPreparing ? 'Anmeldung …' : 'SharePoint-Ordner verbinden'}
                  </button>
                )}
                {/* Lokal */}
                {savedHandleName ? (
                  <>
                    <button onClick={reconnectDirectory}
                      className={`w-full flex items-center justify-center gap-2 text-xs px-4 py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                      <FolderOpen size={12} /> Wieder verbinden: {savedHandleName}
                    </button>
                    <button onClick={pickDirectory} className={`text-[10px] ${textMuted} hover:underline`}>anderen lokalen Ordner wählen</button>
                  </>
                ) : (
                  <button onClick={pickDirectory}
                    className={`w-full flex items-center justify-center gap-2 text-xs px-4 py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    <FolderOpen size={12} /> Lokalen Ordner wählen
                  </button>
                )}
              </div>
              <p className={`text-[10px] leading-relaxed mt-5 ${textMuted}`}>
                SharePoint: Link zum Ordner einfügen, Anmeldung mit dem Microsoft-Konto, Berechtigungen aus SharePoint —
                funktioniert in jedem Browser. Lokaler Ordner (auch OneDrive-/Drive-Sync): Chrome oder Edge.
              </p>
            </div>
          </div>
        ) : modelError ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className={`max-w-md w-full rounded-xl border p-8 text-center ${isDark ? 'border-rose-500/30 bg-rose-500/5' : 'border-rose-300 bg-rose-50'}`}>
              <AlertTriangle size={28} className={`mx-auto mb-4 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
              <p className={`text-xs leading-relaxed mb-6 ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>{modelError}</p>
              <button onClick={() => { disconnect(); setView({ kind: 'projects' }); }}
                className={`text-xs px-4 py-2.5 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                Anderen Ordner wählen
              </button>
            </div>
          </div>
        ) : !model ? (
          <div className={`h-full flex items-center justify-center text-xs ${textMuted}`}>Lade model.json …</div>
        ) : view.kind === 'projects' ? (
          <ProjectsView onOpen={slug => setView({ kind: 'project', slug })} />
        ) : view.kind === 'admin' ? (
          canAdmin
            ? <AdminView onBack={() => setView({ kind: 'projects' })} />
            : <ProjectsView onOpen={slug => setView({ kind: 'project', slug })} />
        ) : (
          <OnePagerView slug={view.slug} focusCommentId={view.commentId} onBack={() => setView({ kind: 'projects' })} />
        )}
      </div>

      {/* SharePoint-Ordner verbinden */}
      {spOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => !spBusy && setSpOpen(false)}>
          <div className={`max-w-lg w-full rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>SharePoint-Ordner verbinden</h3>
              <button onClick={() => setSpOpen(false)} disabled={spBusy}
                className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <X size={14} />
              </button>
            </div>
            <p className={`text-[11px] leading-relaxed mb-3 ${textMuted}`}>
              Link zum Ordner aus SharePoint oder Teams einfügen (Ordner öffnen → «Link kopieren» bzw. die Adresse aus der
              Browserzeile) — oder den Einrichtungs-Link vom Admin. In diesem Ordner liegen config/model.json und
              projects/ — fehlen sie, legt die App sie an.
            </p>
            <input value={spLink} autoFocus disabled={spBusy}
              onChange={e => setSpLink(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && spLink.trim()) doConnectSharePoint(); }}
              placeholder="https://firma.sharepoint.com/sites/Architekturpruefung/Freigegebene Dokumente/arch-review"
              className={`w-full text-xs px-3 py-2 rounded border outline-none font-mono transition-colors ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30' : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30'}`} />
            {setupFromLink && (
              <p className={`text-[11px] mt-2 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                Einrichtungs-Link erkannt — Anmeldung{setupFromLink.folder ? ' und Ordner' : ''} werden daraus übernommen.
              </p>
            )}
            {showIdOptions && (
              <div className="mt-3 space-y-2">
                {showClient ? (
                  <>
                    {!auth.ids && (
                      <p className={`text-[11px] leading-relaxed ${textMuted}`}>
                        <span className="font-semibold">Einmalig für diesen Browser:</span> die Anwendungs-ID der
                        App-Registrierung (vom Admin; keine Geheimnisse) — oder oben statt des Ordner-Links den
                        Einrichtungs-Link einfügen («Teilen» in der App), dann entfällt sie. Die Verzeichnis-ID
                        ermittelt die App aus dem Link.
                      </p>
                    )}
                    <label className={`block text-[10px] uppercase tracking-wider ${textMuted}`}>Anwendungs-ID (Client)</label>
                    <input value={spClient} onChange={e => setSpClient(e.target.value)} disabled={spBusy}
                      onKeyDown={e => { if (e.key === 'Enter' && spLink.trim()) doConnectSharePoint(); }}
                      placeholder="00000000-0000-0000-0000-000000000000"
                      className={`w-full text-xs px-3 py-2 rounded border outline-none font-mono transition-colors ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30' : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30'}`} />
                  </>
                ) : (
                  <button type="button" onClick={() => setSpClientOpen(true)} className={`block text-[10px] ${textMuted} hover:underline`}
                    title="Nur nötig für einen Ordner einer anderen Organisation (anderer Tenant, andere App-Registrierung)">
                    Andere Anwendungs-ID verwenden
                  </button>
                )}
                {spTenantManual ? (
                  <>
                    <label className={`block text-[10px] uppercase tracking-wider ${textMuted}`}>Verzeichnis-ID (Tenant)</label>
                    <input value={spTenant} onChange={e => setSpTenant(e.target.value)} disabled={spBusy}
                      placeholder="00000000-0000-0000-0000-000000000000"
                      className={`w-full text-xs px-3 py-2 rounded border outline-none font-mono transition-colors ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30' : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30'}`} />
                  </>
                ) : (
                  <button type="button" onClick={() => setSpTenantManual(true)} className={`block text-[10px] ${textMuted} hover:underline`}>
                    Verzeichnis-ID selbst eintragen
                  </button>
                )}
              </div>
            )}
            {spError && <p className={`text-[11px] mt-2 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{spError}</p>}
            <div className="flex gap-2 pt-4">
              <button onClick={() => setSpOpen(false)} disabled={spBusy}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                Abbrechen
              </button>
              <button onClick={doConnectSharePoint} disabled={spBusy || !spLink.trim()}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                {needSignIn ? <LogIn size={12} /> : <Cloud size={12} />}
                {spBusy ? 'Verbinde …' : needSignIn ? 'Anmelden und verbinden' : 'Verbinden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
