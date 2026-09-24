import { useEffect, useState } from 'react';
import { Sun, Moon, FolderOpen, AlertTriangle, Wrench, LogIn, LogOut, ShieldCheck, Cloud, X, KeyRound } from 'lucide-react';
import { useStore } from './store';
import { GUID_RE, LEVEL_LABELS, useAuth, usePermissions } from './auth';
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
    connectSharePoint, savedSharePoint, forgetSharePoint, disconnect } = useStore();
  const [spOpen, setSpOpen] = useState(false);
  const [spLink, setSpLink] = useState('');
  const [spBusy, setSpBusy] = useState(false);
  const [spError, setSpError] = useState('');
  const auth = useAuth();
  const { canAdmin, canView, level } = usePermissions();
  const [view, setView] = useState<View>({ kind: 'projects' });
  // Anmeldung aktiv und noch nicht angemeldet → Gate; Admin nur mit Rolle
  const gated = auth.status !== 'disabled' && auth.status !== 'signedIn';
  const dirHandle = storage; // Kurzname: verbundener Speicher (lokal oder SharePoint)

  // Deep Link einlösen, sobald die App bereit ist
  const [deepLinkPending] = useState(() => takeDeepLink());
  useEffect(() => {
    if (!deepLinkPending || !storage || !model || gated) return;
    try { sessionStorage.removeItem(DEEP_LINK_KEY); } catch { /* ignore */ }
    setView({ kind: 'project', slug: deepLinkPending.slug, ...(deepLinkPending.commentId ? { commentId: deepLinkPending.commentId } : {}) });
  }, [deepLinkPending, storage, model, gated]);

  // SharePoint: Link auflösen und verbinden
  const doConnectSharePoint = async () => {
    setSpBusy(true); setSpError('');
    const res = await connectSharePoint(spLink);
    setSpBusy(false);
    if (res.ok) { setSpOpen(false); setSpLink(''); }
    else setSpError(res.message);
  };
  // Start des SharePoint-Modus: immer zuerst Anmeldung + Graph-Token sicherstellen
  // (Redirect, falls nötig), erst dann der Link-Dialog
  const [spPreparing, setSpPreparing] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupTenant, setSetupTenant] = useState('');
  const [setupClient, setSetupClient] = useState('');
  const [setupError, setSetupError] = useState('');
  const startSharePoint = async () => {
    setSpPreparing(true);
    try {
      const r = await auth.loginForSharePoint();
      if (r === 'ready') setSpOpen(true);
      else if (r === 'setup') { setSetupError(''); setSetupOpen(true); }
    } finally {
      setSpPreparing(false);
    }
  };
  const saveSetup = async () => {
    const t = setupTenant.trim(), c = setupClient.trim();
    if (!GUID_RE.test(t) || !GUID_RE.test(c)) { setSetupError('Beide IDs müssen gültige GUIDs sein (Format 8-4-4-4-12).'); return; }
    auth.setLocalIds(t, c);
    setSetupOpen(false);
    // direkt weiter zur Anmeldung
    setTimeout(() => { void startSharePoint(); }, 50);
  };

  const denied = auth.status === 'signedIn' && !canView;

  // Anmelde-Konfiguration kommt aus der model.json des geteilten Ordners
  const applyConfig = auth.applyConfig;
  useEffect(() => { if (model) applyConfig(model.auth); }, [model, applyConfig]);

  const bg = isDark ? 'bg-[#0e0f11]' : 'bg-[#f5f4f0]';
  const border = isDark ? 'border-white/8' : 'border-black/8';
  const topBg = isDark ? 'bg-[#0c0d0f]' : 'bg-[#eae9e5]';
  const textBase = isDark ? 'text-white' : 'text-black';
  const textMuted = isDark ? 'text-white/40' : 'text-black/40';

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
                <p className={`text-xs ${textMuted}`}>Anmeldung wird geprüft …</p>
              ) : auth.status === 'error' ? (
                <>
                  <p className={`text-xs leading-relaxed mb-4 ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>
                    Anmeldung nicht möglich: {auth.error}
                  </p>
                  <button onClick={() => window.location.reload()}
                    className={`text-xs px-4 py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    Erneut versuchen
                  </button>
                </>
              ) : (
                <>
                  <p className={`text-xs leading-relaxed mb-6 ${textMuted}`}>
                    Bitte mit dem Microsoft-Konto anmelden. Die Anmeldung läuft über
                    Microsoft Entra ID; die App selbst speichert keine Zugangsdaten.
                  </p>
                  <button onClick={auth.login}
                    className={`w-full flex items-center justify-center gap-2 text-xs px-4 py-2.5 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                    <LogIn size={12} /> Mit Microsoft anmelden
                  </button>
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
                    <button onClick={startSharePoint} disabled={spPreparing}
                      className={`w-full flex items-center justify-center gap-2 text-xs px-4 py-2.5 rounded font-semibold transition-colors disabled:opacity-50 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                      <Cloud size={12} /> {spPreparing ? 'Anmeldung …' : `Wieder verbinden: ${savedSharePoint.name}`}
                    </button>
                    <button onClick={forgetSharePoint} className={`text-[10px] ${textMuted} hover:underline`}>anderen SharePoint-Ordner wählen</button>
                  </div>
                ) : (
                  <button onClick={startSharePoint} disabled={spPreparing}
                    title={auth.loginAvailable ? '' : 'Beim ersten Mal: Einrichtungs-Link vom Admin öffnen oder IDs eintragen'}
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
              <button onClick={pickDirectory}
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

      {/* Einrichtung: Microsoft-Anmeldung für diesen Browser (einmalig) */}
      {setupOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setSetupOpen(false)}>
          <div className={`max-w-lg w-full rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <h3 className={`flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>
                <KeyRound size={14} /> Microsoft-Anmeldung einrichten
              </h3>
              <button onClick={() => setSetupOpen(false)}
                className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <X size={14} />
              </button>
            </div>
            <p className={`text-[11px] leading-relaxed mb-3 ${textMuted}`}>
              Am einfachsten den <span className="font-semibold">Einrichtungs-Link</span> vom Admin öffnen — er
              richtet Anmeldung und SharePoint-Ordner in einem Schritt ein. Alternativ hier die beiden IDs der
              App-Registrierung in Microsoft Entra eintragen (einmalig pro Browser, keine Geheimnisse).
            </p>
            <div className="space-y-2">
              <label className={`block text-[10px] uppercase tracking-wider ${textMuted}`}>Verzeichnis-ID (Tenant)</label>
              <input value={setupTenant} onChange={e => setSetupTenant(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000"
                className={`w-full text-xs px-3 py-2 rounded border outline-none font-mono transition-colors ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30' : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30'}`} />
              <label className={`block text-[10px] uppercase tracking-wider ${textMuted}`}>Anwendungs-ID (Client)</label>
              <input value={setupClient} onChange={e => setSetupClient(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000"
                className={`w-full text-xs px-3 py-2 rounded border outline-none font-mono transition-colors ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30' : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30'}`} />
            </div>
            {setupError && <p className={`text-[11px] mt-2 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{setupError}</p>}
            <div className="flex gap-2 pt-4">
              <button onClick={() => setSetupOpen(false)}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                Abbrechen
              </button>
              <button onClick={saveSetup} disabled={!GUID_RE.test(setupTenant.trim()) || !GUID_RE.test(setupClient.trim())}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                <LogIn size={12} /> Speichern und anmelden
              </button>
            </div>
          </div>
        </div>
      )}

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
              Browserzeile). In diesem Ordner liegen config/model.json und projects/ — fehlen sie, legt die App sie an.
            </p>
            <input value={spLink} autoFocus disabled={spBusy}
              onChange={e => setSpLink(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && spLink.trim()) doConnectSharePoint(); }}
              placeholder="https://firma.sharepoint.com/sites/Architekturpruefung/Freigegebene Dokumente/arch-review"
              className={`w-full text-xs px-3 py-2 rounded border outline-none font-mono transition-colors ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30' : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30'}`} />
            {spError && <p className={`text-[11px] mt-2 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{spError}</p>}
            <div className="flex gap-2 pt-4">
              <button onClick={() => setSpOpen(false)} disabled={spBusy}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                Abbrechen
              </button>
              <button onClick={doConnectSharePoint} disabled={spBusy || !spLink.trim()}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                <Cloud size={12} /> {spBusy ? 'Verbinde …' : 'Verbinden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
