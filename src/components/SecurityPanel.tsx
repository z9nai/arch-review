import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { SecurityCheckResult, useStore } from '../store';
import { canWrite, FindingLevel, LEGACY_MODEL_PATH, MODEL_PATH, roleLabel } from '../security';
import type { ItemPermission } from '../backend';

// Admin: Sicherheitscheck der Stammdaten — wer darf die model.json ändern?
// Läuft beim Öffnen des Admins einmal automatisch (nur SharePoint).
export default function SecurityPanel() {
  const { isDark, modelPath, checkModelSecurity, storage } = useStore();
  const [result, setResult] = useState<SecurityCheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  const border = isDark ? 'border-white/8' : 'border-black/8';
  const textMuted = isDark ? 'text-white/30' : 'text-black/30';
  const labelCls = isDark ? 'text-white/40' : 'text-black/40';
  const cardCls = `rounded-xl border ${border} ${isDark ? 'bg-white/2' : 'bg-black/2'}`;

  // nur das Ergebnis der jüngsten Prüfung übernehmen
  const seq = useRef(0);
  const run = useCallback(async () => {
    const mine = ++seq.current;
    setBusy(true);
    let r: SecurityCheckResult;
    try { r = await checkModelSecurity(); }
    catch (e) { r = { ok: false, reason: 'error', message: `Prüfung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` }; }
    if (mine !== seq.current) return;
    setResult(r);
    setBusy(false);
  }, [checkModelSecurity]);

  useEffect(() => { void run(); }, [run, modelPath, storage?.name]);

  const legacy = modelPath === LEGACY_MODEL_PATH;
  const status: 'ok' | 'warn' | 'danger' | 'unknown' =
    result?.ok ? result.report.status : legacy ? 'warn' : 'unknown';

  const tone = {
    ok: isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700',
    warn: isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-700',
    danger: isDark ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-rose-300 bg-rose-50 text-rose-700',
    unknown: isDark ? 'border-white/10 bg-white/5 text-white/60' : 'border-black/10 bg-black/5 text-black/60',
  }[status];
  const headline = {
    ok: 'Schreibrechte eingeschränkt',
    warn: 'Handlungsbedarf',
    danger: 'Stammdaten sind nicht geschützt',
    unknown: busy ? 'Prüfe Berechtigungen …' : 'Nicht automatisch prüfbar',
  }[status];

  const dot = (level: FindingLevel) => ({
    ok: 'bg-emerald-500', info: isDark ? 'bg-white/30' : 'bg-black/30', warn: 'bg-amber-500', danger: 'bg-rose-500',
  }[level]);

  const permTable = (title: string, ps: ItemPermission[]) => (
    <div>
      <div className={`text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>{title}</div>
      {ps.length === 0 ? <div className={`text-[11px] ${textMuted}`}>keine Einträge</div> : (
        <table className="w-full text-[11px]">
          <tbody>
            {ps.map(p => (
              <tr key={p.key} className={`border-t ${border}`}>
                <td className={`py-1 pr-2 ${isDark ? 'text-white/70' : 'text-black/70'}`}>{p.name}</td>
                <td className={`py-1 pr-2 whitespace-nowrap ${canWrite(p) ? (isDark ? 'text-amber-300' : 'text-amber-700') : textMuted}`}>{roleLabel(p)}</td>
                <td className={`py-1 whitespace-nowrap ${textMuted}`}>{p.inherited ? 'geerbt' : 'eigene'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <>
      <h2 className={`text-sm font-semibold uppercase tracking-widest mb-4 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
        Sicherheit (Stammdaten)
      </h2>
      <div className={`${cardCls} mb-8 px-4 py-3 space-y-3`}>
        <div className={`flex items-center gap-3 flex-wrap rounded-lg border px-3 py-2 ${tone}`}>
          {status === 'ok' ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
          <span className="text-[11px] font-bold uppercase tracking-wider">{headline}</span>
          <span className={`text-[11px] ${isDark ? 'text-white/60' : 'text-black/60'}`}>
            Stammdaten: <span className="font-mono">{modelPath}</span>
          </span>
          {storage?.kind === 'sharepoint' && (
            <button onClick={run} disabled={busy}
              className={`ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
              <RefreshCw size={11} className={busy ? 'animate-spin' : ''} /> Erneut prüfen
            </button>
          )}
        </div>

        {result && !result.ok && (
          <p className={`text-[11px] leading-relaxed ${result.reason === 'forbidden' ? (isDark ? 'text-amber-300' : 'text-amber-700') : textMuted}`}>
            {result.message}
            {legacy && ` Die model.json liegt noch im Hauptordner — nach ${MODEL_PATH} verschieben.`}
          </p>
        )}

        {result?.ok && (
          <>
            <ul className="space-y-1.5">
              {result.report.findings.map((f, i) => (
                <li key={i} className={`flex gap-2 text-[11px] leading-relaxed ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot(f.level)}`} />
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            <details className="text-[11px]">
              <summary className={`cursor-pointer ${labelCls}`}>Berechtigungen im Detail</summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {permTable('Datenordner', result.report.rootPermissions)}
                {permTable(modelPath, result.report.modelPermissions)}
              </div>
            </details>
          </>
        )}

        <div className={`text-[10px] leading-relaxed space-y-1 ${textMuted}`}>
          <p>
            Die App prüft Rollen nur im Browser, und die Rollennamen stehen in der model.json selbst. Wer die Datei ändern
            kann, kann sich also zum Admin machen oder den Übergabe-Empfänger umbiegen. Den Schutz setzt nur SharePoint
            durch: Ordner <span className="font-mono">config/</span> mit eigenen Berechtigungen — Admins «Bearbeiten»,
            alle anderen «Lesen».
          </p>
          <p>
            Echte Geheimnisse (Passwörter, API-Keys, Client-Secrets) gehören nie in die model.json: Alles, was die App
            lädt, kann jede angemeldete Person im Browser einsehen.
          </p>
          <a href="https://github.com/z9nai/arch-review/blob/main/docs/SHAREPOINT-SETUP.md#teil-3b--stammdaten-schützen-config" target="_blank" rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${isDark ? 'text-white/50' : 'text-black/50'}`}>
            <ExternalLink size={10} /> Anleitung: config/ in SharePoint einrichten
          </a>
        </div>
      </div>
    </>
  );
}
