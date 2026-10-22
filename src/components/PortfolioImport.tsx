import { useMemo, useState } from 'react';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../auth';
import { colLetter, readXlsxRows } from '../xlsx';
import { AdminSection, type AdminState } from './adminUi';
import { detectTable, ImportColumns, ImportTable, mergeImport, NEW_PROJECT_STATUS, PORTFOLIO_PATH, PORTFOLIO_STATUS_META } from '../portfolio';
import { nowIsoWithTimezone } from '../util';

// Admin: Projektliste aus Excel importieren. Die Datei wird in die bestehende
// Liste gemischt (Schlüssel = Projektnummer): neue Projekte kommen mit Status
// «offen» dazu, bestehende behalten ihren Status, fehlende bleiben stehen.
// Ein Regex auf die Projektnummer filtert die Zeilen (z. B. nur KP-Projekte).
export default function PortfolioImport({ state }: { state?: AdminState }) {
  const { isDark, portfolio, portfolioError, updatePortfolio } = useStore();
  const { user } = useAuth();
  const [file, setFile] = useState<{ name: string; table: ImportTable } | null>(null);
  const [columns, setColumns] = useState<ImportColumns>({ number: 0, name: 1, date: -1 });
  const [details, setDetails] = useState<number[]>([]); // Spalten für die Detailansicht
  const [filter, setFilter] = useState<string | null>(null); // null = gespeicherter Wert
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');

  const border = isDark ? 'border-white/8' : 'border-black/8';
  const textMuted = isDark ? 'text-white/30' : 'text-black/30';
  const labelCls = isDark ? 'text-white/40' : 'text-black/40';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30'
    : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30';
  const errCls = isDark ? 'text-rose-400' : 'text-rose-600';

  const filterText = filter ?? portfolio?.numberFilter ?? '';
  const regex = useMemo((): { re: RegExp | null; error?: string } => {
    if (!filterText.trim()) return { re: null };
    try { return { re: new RegExp(filterText.trim(), 'i') }; }
    catch (e) { return { re: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [filterText]);

  const table = useMemo(() => file ? { ...file.table, columns, details } : null, [file, columns, details]);
  const preview = useMemo(
    () => table && portfolio && !regex.error ? mergeImport(portfolio, table, regex.re, nowIsoWithTimezone()) : null,
    [table, portfolio, regex]);

  const pick = async (f: File) => {
    setErr(''); setDone('');
    try {
      const rows = await readXlsxRows(await f.arrayBuffer());
      if (!rows.some(r => r.some(Boolean))) { setErr('Die Excel-Datei ist leer.'); return; }
      const t = detectTable(rows, portfolio?.detailColumns);
      setFile({ name: f.name, table: t });
      setColumns(t.columns);
      setDetails(t.details);
    } catch (e) {
      console.error('[arch-review] Excel-Import:', e);
      setErr(e instanceof Error ? e.message : 'Excel-Datei konnte nicht gelesen werden.');
    }
  };

  const apply = async () => {
    if (!table || regex.error) return;
    setBusy(true); setErr('');
    const at = nowIsoWithTimezone();
    let summary = '';
    // auf dem aktuellen Stand der Datei mischen (jemand anders könnte inzwischen geändert haben)
    const res = await updatePortfolio(prev => {
      const m = mergeImport(prev, table, regex.re, at);
      summary = `${m.added.length} neu, ${m.renamed.length} umbenannt, ${m.updated} aktualisiert, ${m.unchanged} unverändert`;
      return {
        ...m.merged,
        numberFilter: filterText.trim() || undefined,
        lastImport: { at, ...(user?.name ? { by: user.name } : {}), fileName: file!.name },
      };
    });
    setBusy(false);
    if (!res.ok) { setErr(res.message); return; }
    setFile(null); setFilter(null);
    setDone(`Import übernommen: ${summary}.`);
  };

  const headerLabel = (i: number) => `${colLetter(i)} — ${file?.table.headers[i] ?? ''}`;
  const colCount = file?.table.headers.length ?? 0;
  // wählbare Detailspalten: alle ausser Nummer und Name (die zeigt schon die Übersicht)
  const detailChoices = Array.from({ length: colCount }, (_, i) => i).filter(i => i !== columns.number && i !== columns.name);
  const toggleDetail = (i: number) =>
    setDetails(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i].sort((a, b) => a - b));
  // Beispielwert aus der ersten Datenzeile mit Inhalt
  const sample = (i: number) => {
    const v = file?.table.rows.slice(file.table.headerRow + 1).find(r => (r[i] ?? '').trim())?.[i] ?? '';
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('.') : v;
  };
  const colSelect = (key: keyof ImportColumns, optional: boolean) => (
    <select value={columns[key]} onChange={e => setColumns(c => ({ ...c, [key]: Number(e.target.value) }))}
      className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none ${inputCls}`}>
      {optional && <option value={-1}>— keine —</option>}
      {Array.from({ length: colCount }, (_, i) => <option key={i} value={i}>{headerLabel(i)}</option>)}
    </select>
  );

  return (
    <AdminSection id="portfolio" icon={<FileSpreadsheet size={13} />} title="Projektliste" isDark={isDark} state={state}
      hint="Alle Projekte der Organisation für die Projektübersicht — auch solche ohne Architektur-Review."
      more={<>Excel-Import (erstes Tabellenblatt, Kopfzeile wird gesucht): neue Projekte kommen mit Status «{PORTFOLIO_STATUS_META[NEW_PROJECT_STATUS].label}» dazu,
          bereits importierte behalten ihren Status (Name, Datum und Details werden nachgeführt), Projekte, die in der Datei fehlen,
          bleiben stehen. Gespeichert in <span className="font-mono">{PORTFOLIO_PATH}</span>.</>}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs ${isDark ? 'text-white/80' : 'text-black/80'}`}>
            {portfolio ? `${portfolio.projects.length} Projekte in der Liste` : 'Liste wird geladen …'}
          </span>
          <label className={`ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border cursor-pointer transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
            <input type="file" className="hidden" disabled={busy || !portfolio}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
            <Upload size={11} /> Excel importieren …
          </label>
        </div>
        {portfolioError && <p className={`text-[11px] ${errCls}`}>{portfolioError}</p>}

        {file && table && (
          <div className={`rounded-lg border px-3 py-3 space-y-3 ${border}`}>
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={12} className={labelCls} />
              <span className={`text-xs ${isDark ? 'text-white/80' : 'text-black/80'}`}>{file.name}</span>
              <span className={`text-[10px] ${textMuted}`}>Kopfzeile: Zeile {table.headerRow + 1}</span>
              <button onClick={() => setFile(null)} title="Import abbrechen"
                className={`ml-auto p-1 rounded transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <X size={12} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Spalte Projektnummer</label>
                {colSelect('number', false)}
              </div>
              <div>
                <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Spalte Projektname</label>
                {colSelect('name', false)}
              </div>
              <div>
                <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Spalte Datum <span className="normal-case tracking-normal">— optional</span></label>
                {colSelect('date', true)}
              </div>
            </div>
            <div>
              <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>
                Filter Projektnummer <span className="normal-case tracking-normal">— regulärer Ausdruck, leer = alle; Gross-/Kleinschreibung egal</span>
              </label>
              <input value={filterText} onChange={e => setFilter(e.target.value)} placeholder="^KP\d{6}$"
                className={`w-full text-xs px-3 py-1.5 rounded border outline-none font-mono ${inputCls} ${regex.error ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
              {regex.error && <p className={`text-[11px] mt-1 ${errCls}`}>Ungültiger Ausdruck: {regex.error}</p>}
            </div>
            {detailChoices.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <label className={`text-[10px] uppercase tracking-wider ${labelCls}`}>
                    Spalten für die Detailansicht <span className="normal-case tracking-normal">— {details.length} von {detailChoices.length} gewählt; Nummer und Name sind immer dabei</span>
                  </label>
                  <button type="button" onClick={() => setDetails(detailChoices)} className={`ml-auto text-[10px] ${textMuted} hover:underline`}>alle</button>
                  <button type="button" onClick={() => setDetails([])} className={`text-[10px] ${textMuted} hover:underline`}>keine</button>
                </div>
                <div className={`grid grid-cols-2 gap-x-4 gap-y-0.5 max-h-56 overflow-y-auto rounded border px-2 py-1.5 ${border}`}>
                  {detailChoices.map(i => (
                    <label key={i} className={`flex items-baseline gap-2 text-[11px] py-0.5 cursor-pointer min-w-0 ${isDark ? 'text-white/80' : 'text-black/80'}`}>
                      <input type="checkbox" checked={details.includes(i)} onChange={() => toggleDetail(i)} className="flex-shrink-0 translate-y-0.5" />
                      <span className="truncate" title={file.table.headers[i]}>{file.table.headers[i]}</span>
                      {sample(i) && <span className={`truncate text-[10px] ${textMuted}`} title={sample(i)}>z. B. {sample(i)}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {preview && (
              <div className={`text-[11px] space-y-1 ${isDark ? 'text-white/60' : 'text-black/60'}`}>
                <p>
                  <span className="font-semibold">{preview.added.length} neu</span> · {preview.renamed.length} umbenannt ·{' '}
                  {preview.updated} aktualisiert · {preview.unchanged} unverändert · {preview.filteredOut} durch Filter ausgeschlossen
                  {preview.duplicates > 0 && <> · {preview.duplicates} doppelt (erste Zeile gilt)</>}
                </p>
                {preview.added.length > 0 && (
                  <p className={textMuted}>
                    Neu: {preview.added.slice(0, 8).map(p => `${p.number} ${p.name}`).join(' · ')}{preview.added.length > 8 ? ` · … (+${preview.added.length - 8})` : ''}
                  </p>
                )}
                {preview.renamed.length > 0 && (
                  <p className={textMuted}>
                    Umbenannt: {preview.renamed.slice(0, 5).map(r => `${r.number}: «${r.from}» → «${r.to}»`).join(' · ')}{preview.renamed.length > 5 ? ` · … (+${preview.renamed.length - 5})` : ''}
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setFile(null)} disabled={busy}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/40 hover:border-white/30 hover:text-white/70' : 'border-black/15 text-black/40 hover:border-black/30 hover:text-black/70'}`}>
                Abbrechen
              </button>
              <button onClick={() => void apply()} disabled={busy || !preview || !!regex.error || columns.number === columns.name}
                className={`flex-1 text-xs py-2 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                {busy ? 'Speichere …' : 'In Projektliste übernehmen'}
              </button>
            </div>
          </div>
        )}
        {err && <p className={`text-[11px] ${errCls}`}>{err}</p>}
        {done && <p className={`text-[11px] ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{done}</p>}
    </AdminSection>
  );
}
