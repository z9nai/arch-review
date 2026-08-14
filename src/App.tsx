import { useState } from 'react';
import { Sun, Moon, FolderOpen, AlertTriangle } from 'lucide-react';
import { useStore } from './store';
import ProjectsView from './components/ProjectsView';
import OnePagerView from './components/OnePagerView';

type View = { kind: 'projects' } | { kind: 'project'; slug: string };

export default function App() {
  const { isDark, toggleTheme, dirHandle, pickDirectory, savedHandleName, reconnectDirectory, model, modelError } = useStore();
  const [view, setView] = useState<View>({ kind: 'projects' });

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
          {/* Geteilter Ordner */}
          <button
            onClick={pickDirectory}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
              dirHandle
                ? isDark ? 'border-white/15 text-white/50 hover:border-white/30' : 'border-black/15 text-black/50 hover:border-black/30'
                : isDark ? 'border-blue-500/40 text-blue-400 hover:border-blue-400' : 'border-blue-500/40 text-blue-600 hover:border-blue-500'
            }`}
            title={dirHandle ? 'Anderen Ordner wählen' : 'Geteilten Ordner wählen'}
          >
            <FolderOpen size={12} />
            {dirHandle ? dirHandle.name : 'Ordner wählen'}
          </button>

          {/* Theme toggle */}
          <button onClick={toggleTheme}
            className={`flex items-center gap-1 p-1.5 rounded transition-colors ${isDark ? 'text-white/35 hover:text-white/70' : 'text-black/35 hover:text-black/70'}`}>
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {!dirHandle ? (
          // Start / Ordnerwahl — die App merkt sich nichts über die Sitzung hinaus
          <div className="h-full flex items-center justify-center p-6">
            <div className={`max-w-md w-full rounded-xl border p-8 text-center ${border} ${isDark ? 'bg-white/2' : 'bg-black/2'}`}>
              <FolderOpen size={28} className={`mx-auto mb-4 ${textMuted}`} />
              <h1 className={`text-sm font-semibold uppercase tracking-widest mb-3 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                Architekturprüfung
              </h1>
              <p className={`text-xs leading-relaxed mb-6 ${textMuted}`}>
                Wähle den geteilten Ordner mit <span className="font-semibold">model.json</span> und
                dem Unterordner <span className="font-semibold">projects/</span> —
                fehlen sie, werden sie automatisch angelegt.
                Die Daten bleiben lokal — kein Server, keine Netzwerkzugriffe.
                Erfordert Chrome oder Edge.
              </p>
              {savedHandleName ? (
                <div className="space-y-3">
                  <button onClick={reconnectDirectory}
                    className={`w-full text-xs px-4 py-2.5 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                    Wieder verbinden: {savedHandleName}
                  </button>
                  <button onClick={pickDirectory}
                    className={`w-full text-xs px-4 py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    Anderen Ordner wählen
                  </button>
                </div>
              ) : (
                <button onClick={pickDirectory}
                  className={`text-xs px-4 py-2.5 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                  Geteilten Ordner wählen
                </button>
              )}
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
        ) : (
          <OnePagerView slug={view.slug} onBack={() => setView({ kind: 'projects' })} />
        )}
      </div>
    </div>
  );
}
