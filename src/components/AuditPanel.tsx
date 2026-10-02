// Verlauf — das Änderungsprotokoll des Projekts (siehe audit.ts) als Panel
// rechts, wo sonst die Kommentare stehen: neueste Einträge oben, je Eintrag
// wer, wann, woher (von Hand, Import, beim Laden) und was — Stelle, Feld,
// vorher → nachher. Filtern lässt es sich nach Stelle, nach Person, nach
// Zeitraum, nach Herkunft und mit einer Textsuche; ein Klick auf die Stelle
// springt hin.
import { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Search, X } from 'lucide-react';
import { coalesce, SOURCE_LABEL, type AuditChange, type AuditEntry, type AuditSource } from '../audit';
import { fmtTimestamp } from '../util';

interface Props {
  slug: string;
  /** Version des Projekts — nach jedem Speichern wird neu gelesen */
  version: string | null;
  isDark: boolean;
  load: (slug: string) => Promise<AuditEntry[] | null>;
  /** heutiger Name einer Stelle — null, wenn es sie nicht mehr gibt */
  labelNow: (target: string) => string | null;
  /** kann der OnePager die Stelle anzeigen? */
  canGoto: (target: string) => boolean;
  onGoto: (target: string) => void;
  onClose: () => void;
}

const SOURCES: AuditSource[] = ['manual', 'ms10-import', 'json-import', 'answers-import', 'load'];

type Range = 'all' | 'today' | '7' | '30' | 'custom';
const RANGES: Range[] = ['all', 'today', '7', '30', 'custom'];
const RANGE_LABEL: Record<Range, string> = { all: 'Jederzeit', today: 'Heute', 7: 'Letzte 7 Tage', 30: 'Letzte 30 Tage', custom: 'Zeitraum …' };

/** Lokaler Tagesanfang von `yyyy-mm-dd` (bzw. heute minus `days`) in ms. */
const dayStart = (iso?: string, days = 0): number => {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.getTime();
};

/** Von–bis in ms (bis exklusiv) — null = keine Grenze. */
function bounds(range: Range, from: string, to: string): [number | null, number | null] {
  switch (range) {
    case 'today': return [dayStart(), null];
    case '7': return [dayStart(undefined, 6), null];
    case '30': return [dayStart(undefined, 29), null];
    case 'custom': return [from ? dayStart(from) : null, to ? dayStart(to, -1) : null];
    default: return [null, null];
  }
}

const sourceTone = (s: AuditSource, isDark: boolean) => ({
  manual: isDark ? 'border-white/20 text-white/60' : 'border-black/20 text-black/60',
  'ms10-import': isDark ? 'border-blue-500/40 text-blue-300' : 'border-blue-300 text-blue-700',
  'json-import': isDark ? 'border-violet-500/40 text-violet-300' : 'border-violet-300 text-violet-700',
  'answers-import': isDark ? 'border-amber-500/40 text-amber-300' : 'border-amber-300 text-amber-700',
  load: isDark ? 'border-white/15 text-white/40' : 'border-black/15 text-black/40',
}[s]);

export default function AuditPanel(p: Props) {
  const { isDark } = p;
  const textMuted = isDark ? 'text-white/40' : 'text-black/40';
  const textMuted2 = isDark ? 'text-white/55' : 'text-black/55';
  const text = isDark ? 'text-white/85' : 'text-black/85';
  const border = isDark ? 'border-white/10' : 'border-black/10';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-white/25 focus:border-white/30'
    : 'bg-black/5 border-black/10 text-black placeholder-black/25 focus:border-black/30';
  const iconBtn = `p-1 rounded transition-colors ${isDark ? 'text-white/40 hover:text-white' : 'text-black/40 hover:text-black'}`;

  const [entries, setEntries] = useState<AuditEntry[] | null | undefined>(undefined);
  const [hidden, setHidden] = useState<Set<AuditSource>>(new Set());
  /** Stelle oder '' = alle */
  const [focus, setFocus] = useState('');
  /** Person (Name) oder '' = alle */
  const [who, setWho] = useState('');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // nach jedem Speichern neu lesen — das Protokoll wächst mit
  const { load, slug, version } = p;
  useEffect(() => {
    let alive = true;
    load(slug).then(e => { if (alive) setEntries(e); });
    return () => { alive = false; };
  }, [load, slug, version]);

  // Esc schliesst (ausser beim Tippen in einem Feld)
  const onClose = p.onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === 'Escape' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const merged = useMemo(() => (entries ? coalesce(entries) : []), [entries]);

  // Stellen im Protokoll — für die Auswahl; heutiger Name, sonst der letzte bekannte
  const { labelNow } = p;
  const elements = useMemo(() => {
    const m = new Map<string, { label: string; gone: boolean }>();
    for (const e of merged) for (const ch of e.changes) {
      if (m.has(ch.target)) continue;
      const now = labelNow(ch.target);
      m.set(ch.target, { label: now ?? ch.label, gone: now === null });
    }
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'de', { numeric: true }));
  }, [merged, labelNow]);

  const authors = useMemo(() => [...new Set(merged.map(e => e.author))].sort((a, b) => a.localeCompare(b, 'de')), [merged]);

  /**
   * Textsuche: alle Wörter müssen vorkommen. Passen Person oder Notiz, bleibt
   * der ganze Eintrag; sonst nur die Änderungen, die passen (Stelle, Feld,
   * vorher, nachher).
   */
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (t: string) => { const l = t.toLowerCase(); return words.every(w => l.includes(w)); };
    const changeText = (ch: AuditChange) => [ch.label, ch.field, ch.before, ch.after].filter(Boolean).join(' ');
    const [lo, hi] = bounds(range, from, to);
    const inRange = (at: string) => { const t = new Date(at).getTime(); return (lo == null || t >= lo) && (hi == null || t < hi); };
    return merged
      .filter(e => !hidden.has(e.source) && (!who || e.author === who) && inRange(e.at))
      .map(e => (focus ? { ...e, changes: e.changes.filter(ch => ch.target === focus) } : e))
      .map(e => {
        if (!words.length) return e;
        const head = [e.author, e.email, e.note, SOURCE_LABEL[e.source]].filter(Boolean).join(' ');
        if (hit(head)) return e;
        return { ...e, changes: e.changes.filter(ch => hit(`${head} ${changeText(ch)}`)) };
      })
      .filter(e => e.changes.length);
  }, [merged, hidden, focus, who, query, range, from, to]);
  const filtered = !!focus || !!who || !!query.trim() || hidden.size > 0 || range !== 'all';

  const toggleSource = (s: AuditSource) => setHidden(prev => {
    const n = new Set(prev);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });

  return (
    <aside className={`w-[380px] max-w-[45vw] flex-shrink-0 sticky top-0 self-start max-h-[calc(100vh-120px)] flex flex-col rounded-xl border shadow-lg ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}>
      <div className={`px-3 py-2 border-b ${border} flex items-center gap-1.5`}>
        <History size={13} className={textMuted} />
        <span className={`text-xs font-semibold flex-1 min-w-0 truncate ${isDark ? 'text-white' : 'text-black'}`}>
          Verlauf
          {entries && <span className={`ml-2 text-[10px] font-normal ${textMuted}`}>{shown.length} {shown.length === 1 ? 'Eintrag' : 'Einträge'}</span>}
        </span>
        <button type="button" onClick={onClose} title="Schliessen (Esc)" className={iconBtn}><X size={13} /></button>
      </div>

      {/* Filter */}
      <div className={`px-3 py-1.5 border-b ${border} space-y-1.5`}>
        <div className="relative">
          <Search size={11} className={`absolute left-2 top-1/2 -translate-y-1/2 ${textMuted}`} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Suchen — Stelle, Feld, Wert, Notiz …"
            className={`w-full text-[11px] pl-6 pr-6 py-1 rounded border outline-none ${inputCls}`} />
          {query && (
            <button type="button" onClick={() => setQuery('')} title="Suche leeren"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${textMuted}`}><X size={11} /></button>
          )}
        </div>
        <div className="flex gap-1.5">
          <select value={focus} onChange={e => setFocus(e.target.value)} title="Nur die Änderungen an dieser Stelle"
            className={`flex-1 min-w-0 text-[11px] px-2 py-1 rounded border outline-none ${inputCls}`}>
            <option value="">Alle Stellen</option>
            {elements.map(([key, { label, gone }]) => <option key={key} value={key}>{label}{gone ? ' (entfallen)' : ''}</option>)}
          </select>
          <select value={who} onChange={e => setWho(e.target.value)} title="Nur die Änderungen dieser Person"
            className={`flex-1 min-w-0 text-[11px] px-2 py-1 rounded border outline-none ${inputCls}`}>
            <option value="">Alle Personen</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={range} onChange={e => setRange(e.target.value as Range)} title="Nur Änderungen in diesem Zeitraum"
            className={`flex-1 min-w-0 text-[11px] px-2 py-1 rounded border outline-none ${inputCls}`}>
            {RANGES.map(r => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
          </select>
        </div>
        {range === 'custom' && (
          <div className={`flex items-center gap-1.5 text-[10px] ${textMuted}`}>
            <span>von</span>
            <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)}
              className={`flex-1 min-w-0 text-[11px] px-1.5 py-0.5 rounded border outline-none ${inputCls}`} />
            <span>bis</span>
            <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)}
              className={`flex-1 min-w-0 text-[11px] px-1.5 py-0.5 rounded border outline-none ${inputCls}`} />
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {SOURCES.map(s => (
            <button key={s} type="button" onClick={() => toggleSource(s)} title={hidden.has(s) ? 'Einblenden' : 'Ausblenden'}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-opacity ${sourceTone(s, isDark)} ${hidden.has(s) ? 'opacity-30 line-through' : ''}`}>
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
        {entries === undefined && <p className={`flex items-center gap-1.5 text-[11px] ${textMuted}`}><Loader2 size={11} className="animate-spin" /> Lade Verlauf …</p>}
        {entries === null && <p className={`text-[11px] ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>Das Protokoll ist nicht lesbar.</p>}
        {entries && !shown.length && (
          <p className={`text-[11px] ${textMuted}`}>
            {entries.length ? 'Keine Änderungen für diese Auswahl.' : 'Noch keine Änderungen protokolliert — das Protokoll beginnt mit der nächsten Änderung.'}
          </p>
        )}
        {!!entries?.length && filtered && (
          <button type="button" onClick={() => { setQuery(''); setWho(''); setRange('all'); setFrom(''); setTo(''); setHidden(new Set()); setFocus(''); }}
            className={`text-[10px] underline ${textMuted}`}>Alle Filter zurücksetzen</button>
        )}
        {shown.map(e => (
          <div key={e.id} className={`rounded border ${border} px-2.5 py-2 space-y-1`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-[10px] tabular-nums flex-shrink-0 ${textMuted2}`}>{fmtTimestamp(e.at)}</span>
              <span className={`text-[11px] font-semibold truncate ${text}`} title={e.email ?? e.author}>{e.author}</span>
              <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded border flex-shrink-0 ${sourceTone(e.source, isDark)}`}>{SOURCE_LABEL[e.source]}</span>
            </div>
            {e.note && <p className={`text-[10px] italic ${textMuted2}`}>{e.note}</p>}
            <ul className="space-y-0.5">
              {e.changes.map((ch, i) => (
                <ChangeLine key={i} ch={ch} isDark={isDark} label={labelNow(ch.target) ?? ch.label}
                  canGoto={p.canGoto(ch.target)} onGoto={p.onGoto} />
              ))}
            </ul>
            {!!e.more && !focus && !query.trim() && <p className={`text-[10px] ${textMuted}`}>… und {e.more} weitere Änderungen</p>}
          </div>
        ))}
      </div>
    </aside>
  );
}

function ChangeLine({ ch, label, isDark, canGoto, onGoto }: { ch: AuditChange; label: string; isDark: boolean; canGoto: boolean; onGoto: (t: string) => void }) {
  const text = isDark ? 'text-white/85' : 'text-black/85';
  const textMuted = isDark ? 'text-white/40' : 'text-black/40';
  const textMuted2 = isDark ? 'text-white/55' : 'text-black/55';
  const sign = ch.op === 'add' ? '+' : ch.op === 'remove' ? '−' : '~';
  const tone = ch.op === 'add' ? (isDark ? 'text-emerald-400' : 'text-emerald-700')
    : ch.op === 'remove' ? (isDark ? 'text-rose-400' : 'text-rose-600')
      : (isDark ? 'text-amber-300' : 'text-amber-700');
  const del = isDark ? 'text-rose-300/80 line-through' : 'text-rose-700/80 line-through';
  const ins = isDark ? 'text-emerald-300' : 'text-emerald-800';
  return (
    <li className="text-[10px] leading-snug">
      <span className={`font-mono mr-1 ${tone}`}>{sign}</span>
      {/* span statt button: bleibt im Textfluss, lange Fragetexte brechen hinter dem Zeichen um */}
      <span role="button" tabIndex={canGoto ? 0 : -1} aria-disabled={!canGoto}
        onClick={() => { if (canGoto) onGoto(ch.target); }}
        onKeyDown={e => { if (canGoto && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onGoto(ch.target); } }}
        title={canGoto ? 'Zur Stelle' : 'Diese Stelle ist zurzeit nicht sichtbar'}
        className={`${text} ${canGoto ? 'cursor-pointer hover:underline' : ''}`}>{label}</span>
      {ch.field && <span className={textMuted2}> · {ch.field}</span>}
      {(ch.before !== undefined || ch.after !== undefined) && (
        <div className="pl-3 break-words whitespace-pre-wrap">
          {ch.op === 'change' ? <>
            <span className={ch.before === undefined ? textMuted : del}>{ch.before ?? 'leer'}</span>
            <span className={textMuted}> → </span>
            <span className={ch.after === undefined ? textMuted : ins}>{ch.after ?? 'leer'}</span>
          </> : <span className={textMuted2}>{ch.after ?? ch.before}</span>}
        </div>
      )}
    </li>
  );
}
