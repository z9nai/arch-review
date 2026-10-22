import { useEffect, useState } from 'react';
import { Sun, Moon, FolderOpen, AlertTriangle, Wrench, LogIn, Cloud, X, Link2, Check, LayoutList, ClipboardList } from 'lucide-react';
import { useStore } from './store';
import { GUID_RE, knownClientId, LEVEL_LABELS, parseSetupLink, setupLink, PENDING_FOLDER_KEY, resolveTenantId, useAuth, usePermissions } from './auth';
import ProjectsView from './components/ProjectsView';
import OnePagerView from './components/OnePagerView';
import AdminView from './components/AdminView';
import PortfolioView from './components/PortfolioView';
import { AccountChip, HeaderButton } from './components/Header';

type View = { kind: 'projects' } | { kind: 'project'; slug: string; commentId?: string } | { kind: 'admin'; section?: string } | { kind: 'portfolio' };

// Ansicht in der URL — so lässt sich jede Seite als Link teilen:
//   ?project=<slug>[&comment=<id>]   OnePager (comment: Kommentar öffnen, siehe util.deepLink)
//   ?view=overview                   Projektübersicht
//   ?view=admin[&section=<id>]       Administration, Abschnitt angesprungen
//   (nichts)                         Projektliste
// Beim Start wird die Ansicht aus der URL im Tab gemerkt — so überlebt sie
// den Login-Redirect — und eingelöst, sobald Ordner und model.json da sind.
// Danach folgt die URL jeder Ansicht (Verlauf: Zurück/Vor funktionieren).
// Andere Parameter (z. B. ?opfs, ?noauth) bleiben stehen.
const DEEP_LINK_KEY = 'arch-review.deepLink';
const VIEW_PARAMS = ['project', 'comment', 'view', 'section'];

function viewFromUrl(href: string): View | null {
  const q = new URL(href).searchParams;
  const slug = (q.get('project') ?? '').trim();
  const commentId = (q.get('comment') ?? '').trim();
  const section = (q.get('section') ?? '').trim();
  if (slug) return { kind: 'project', slug, ...(commentId ? { commentId } : {}) };
  if (q.get('view') === 'overview') return { kind: 'portfolio' };
  if (q.get('view') === 'admin') return { kind: 'admin', ...(section ? { section } : {}) };
  return null;
}

function urlForView(view: View): string {
  const u = new URL(window.location.href);
  // übrige Parameter unverändert lassen (URLSearchParams machte aus ?opfs ein ?opfs=)
  const keep = u.search.slice(1).split('&').filter(p => p && !VIEW_PARAMS.includes(decodeURIComponent(p.split('=')[0])));
  const add: string[] = [];
  if (view.kind === 'project') add.push(`project=${encodeURIComponent(view.slug)}`);
  else if (view.kind === 'portfolio') add.push('view=overview');
  else if (view.kind === 'admin') {
    add.push('view=admin');
    if (view.section) add.push(`section=${encodeURIComponent(view.section)}`);
  }
  const q = [...keep, ...add].join('&');
  return `${u.origin}${u.pathname}${q ? `?${q}` : ''}${u.hash}`;
}

function takeDeepLink(): View | null {
  try {
    const fromUrl = viewFromUrl(window.location.href);
    if (fromUrl) {
      sessionStorage.setItem(DEEP_LINK_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    const stored = sessionStorage.getItem(DEEP_LINK_KEY);
    return stored ? JSON.parse(stored) as View : null;
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
  // Lokaler Ordner: warum die Ordnerwahl nicht ging (z. B. eingebetteter Browser)
  const [pickError, setPickError] = useState('');
  const [picking, setPicking] = useState(false); // Ordner-Dialog offen
  const doPickDirectory = async () => {
    setPickError(''); setPicking(true);
    try { setPickError((await pickDirectory()) ?? ''); } finally { setPicking(false); }
  };
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

  // Deep Link einlösen, sobald die App bereit ist; bis dahin bleibt die URL
  // unangetastet (sonst ginge der Link vor dem Laden verloren)
  const [deepLinkPending] = useState(() => takeDeepLink());
  const ready = !!storage && !!model && !gated;
  const [linkTaken, setLinkTaken] = useState(false);
  useEffect(() => {
    if (!ready || linkTaken) return;
    try { sessionStorage.removeItem(DEEP_LINK_KEY); } catch { /* ignore */ }
    if (deepLinkPending) setView(deepLinkPending.kind === 'admin' && !canAdmin ? { kind: 'projects' } : deepLinkPending);
    setLinkTaken(true);
  }, [ready, linkTaken, deepLinkPending, canAdmin]);

  // URL folgt der Ansicht: neuer Verlaufseintrag je Wechsel; der Kommentar-
  // Anker gilt nur beim Öffnen und fällt aus der URL
  useEffect(() => {
    if (!ready || !linkTaken) return;
    const url = urlForView(view);
    if (url === window.location.href) return;
    const cur = viewFromUrl(window.location.href);
    // gleiches Projekt, nur der Kommentar-Anker fällt weg → ersetzen statt neuer Eintrag
    if (cur?.kind === 'project' && view.kind === 'project' && cur.slug === view.slug) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }, [ready, linkTaken, view]);

  // Zurück/Vor im Browser
  useEffect(() => {
    const onPop = () => setView(viewFromUrl(window.location.href) ?? { kind: 'projects' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
        const clientId = own || knownClientId(tenantId);
        if (!clientId) {
          setSpClientOpen(true);
          throw new Error(`Für diese Organisation (Verzeichnis-ID ${tenantId}) ist in diesem Browser keine Anwendungs-ID gemerkt. Am einfachsten statt des Ordner-Links den Einrichtungs-Link einfügen («Teilen» bei jemandem, der schon verbunden ist) — oder die Anwendungs-ID vom Admin eintragen (einmalig).`);
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
      {/* Kopfzeile in drei Spalten: die mittlere ist so breit wie der Inhalt
          darunter (max-w-5xl, px-6) — Logo und Firma links, die Navigation
          der App (Projekte, Übersicht, Admin) rechtsbündig damit. Alles
          andere — Teilen, Ordner, Konto, Darstellung, Herkunft — steht rechts
          am Fensterrand (die Herkunft steht im Footer). Spalten: Rand wie neben dem Inhalt | bis 64rem |
          Rest, mindestens so breit wie die rechte Gruppe — fasst der Rand die
          Gruppe nicht, wird die Mitte schmaler statt zu überlappen. */}
      {/* Gleiche Scrollleisten-Spur wie der Inhalt darunter — sonst rückt
          dieser um eine halbe Scrollleiste, sobald er scrollt */}
      <div className={`border-b ${border} ${topBg} flex-shrink-0 overflow-hidden [scrollbar-gutter:stable]`}>
        <div className="grid items-center py-2"
          style={{ gridTemplateColumns: 'max(0px, calc((100% - 64rem) / 2)) minmax(0, 64rem) minmax(max-content, 1fr)' }}>
          <div />
          <div className="flex items-center gap-2 px-6 min-w-0">
          {/* Wortmarke: Logo und Firma fett, «Arch Review» klein daneben */}
          <button onClick={() => setView({ kind: 'projects' })} className="flex items-center gap-2 flex-shrink-0 mr-2" title="Architekturprüfung — zur Projektliste">
            {model?.logo && (
              <img src={model.logo} alt={model.company ?? ''} className="h-6 max-w-[9rem] object-contain flex-shrink-0" />
            )}
            <span className={`text-xs font-bold tracking-widest ${isDark ? 'text-white/80' : 'text-black/80'}`}>
              {model?.company || 'Arch Review'}
            </span>
            {model?.company && (
              <span className={`text-[10px] tracking-widest hidden sm:inline ${textMuted}`}>Arch Review</span>
            )}
          </button>

          {/* Navigation */}
          {!gated && !denied && dirHandle && model && (
            <div className="ml-auto flex items-center gap-2">
              <HeaderButton isDark={isDark} icon={<ClipboardList size={12} />} label="Projekte"
                active={view.kind === 'projects' || view.kind === 'project'}
                title="Projekte — alle Architektur-Reviews"
                onClick={() => setView({ kind: 'projects' })} />
              <HeaderButton isDark={isDark} icon={<LayoutList size={12} />} label="Übersicht" active={view.kind === 'portfolio'}
                title="Übersicht — alle Projekte mit Review-Status, auch ohne Architektur-Review"
                onClick={() => setView({ kind: 'portfolio' })} />
              {canAdmin && (
                <HeaderButton isDark={isDark} icon={<Wrench size={12} />} label="Admin" active={view.kind === 'admin'}
                  title="Admin — Auftritt, Sicherheit, Anmeldung, Benachrichtigungen, Projektliste, Themen und Fragen"
                  onClick={() => setView({ kind: 'admin' })} />
              )}
            </div>
          )}
          </div>

          {/* Kontext rechts: Teilen, Ordner, Konto, Darstellung */}
          <div className="flex justify-end px-4">
          <div className="flex items-center gap-2">
            {!gated && !denied && shareLink && (
              <HeaderButton isDark={isDark} onClick={copyShareLink}
                icon={shareCopied ? <Check size={12} /> : <Link2 size={12} />} label={shareCopied ? 'Kopiert' : 'Teilen'}
                title={`Link kopieren, der Anmeldung und den Ordner «${dirHandle?.name ?? ''}» in einem Schritt einrichtet — Empfänger öffnen ihn und melden sich an. Zugriff erhält nur, wer in SharePoint berechtigt ist.`}
                tone={shareCopied ? (isDark ? 'border-emerald-500/40 text-emerald-300' : 'border-emerald-400 text-emerald-700') : undefined} />
            )}
            {!gated && !denied && dirHandle && (
              <HeaderButton isDark={isDark} label={dirHandle.name}
                icon={dirHandle.kind === 'sharepoint' ? <Cloud size={12} /> : <FolderOpen size={12} />}
                title={dirHandle.kind === 'sharepoint'
                  ? `SharePoint-Ordner «${dirHandle.name}»\n${dirHandle.webUrl ?? ''}\n\nKlick: anderen Ordner wählen`
                  : `Lokaler Ordner «${dirHandle.name}»\n\nKlick: anderen Ordner wählen`}
                onClick={() => { disconnect(); setView({ kind: 'projects' }); }} />
            )}
            {auth.status === 'signedIn' && auth.user && (
              <AccountChip isDark={isDark} user={auth.user} level={level} onLogout={auth.logout} />
            )}

            {/* Darstellung */}
            {((!gated && !denied && dirHandle) || (auth.status === 'signedIn' && auth.user)) && (
              <span className={`w-px h-5 mx-1 ${isDark ? 'bg-white/10' : 'bg-black/10'}`} />
            )}
            <button onClick={toggleTheme} title={isDark ? 'Helle Darstellung' : 'Dunkle Darstellung'}
              className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'text-white/35 hover:text-white/70' : 'text-black/35 hover:text-black/70'}`}>
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
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
                    <button onClick={doPickDirectory} className={`text-[10px] ${textMuted} hover:underline`}>anderen lokalen Ordner wählen</button>
                  </>
                ) : (
                  <button onClick={doPickDirectory} disabled={picking}
                    className={`w-full flex items-center justify-center gap-2 text-xs px-4 py-2 rounded border transition-colors disabled:opacity-60 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    <FolderOpen size={12} /> {picking ? 'Ordner-Dialog offen …' : 'Lokalen Ordner wählen'}
                  </button>
                )}
                {picking && <p className={`text-[11px] leading-relaxed ${textMuted}`}>Bitte im Dialog einen Ordner wählen — erscheint keiner, liegt er evtl. hinter dem Browserfenster.</p>}
                {pickError && <p className={`text-[11px] leading-relaxed ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{pickError}</p>}
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
        ) : view.kind === 'portfolio' ? (
          <PortfolioView onOpen={slug => setView({ kind: 'project', slug })} onBack={() => setView({ kind: 'projects' })}
            onAdmin={canAdmin ? () => setView({ kind: 'admin', section: 'portfolio' }) : undefined} />
        ) : view.kind === 'admin' ? (
          canAdmin
            ? <AdminView onBack={() => setView({ kind: 'projects' })} focusSection={view.section} onOverview={() => setView({ kind: 'portfolio' })} />
            : <ProjectsView onOpen={slug => setView({ kind: 'project', slug })} />
        ) : (
          <OnePagerView slug={view.slug} focusCommentId={view.commentId} onBack={() => setView({ kind: 'projects' })} />
        )}
      </div>

      {/* Footer: Herkunft, ganz rechts am Fensterrand */}
      <footer className={`border-t ${border} ${topBg} flex-shrink-0 [scrollbar-gutter:stable] overflow-hidden`}>
        <div className="px-4 py-1.5 flex justify-end">
          <a href="https://z9nai.ch" target="_blank" rel="noopener noreferrer"
            title="Z9nAI GmbH — zur Webseite"
            className={`flex items-center gap-1.5 ${textMuted} opacity-80 hover:opacity-100 transition-opacity`}>
            <span className="text-[10px] whitespace-nowrap">by z9nai GmbH</span>
            <img src="favicon.png" alt="" className="w-4 h-4" />
          </a>
        </div>
      </footer>

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
