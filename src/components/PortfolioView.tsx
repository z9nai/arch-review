import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Info, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { ProjectListItem, useStore } from '../store';
import { usePermissions } from '../auth';
import { approvedMilestones, deriveStatus, openMilestone } from '../status';
import {
  numberKey, PORTFOLIO_STATUSES, PORTFOLIO_STATUS_META, PortfolioProject, PortfolioStatus, reviewNumber, reviewsFor,
} from '../portfolio';
import { fmtTimestamp } from '../util';

// Meilenstein-Tags eines Reviews wie in der Projektliste: freigegebene grün,
// der nächste offene gelb; Klick öffnet den Review
function ReviewTags({ review, isDark, onOpen, showName }: { review: ProjectListItem; isDark: boolean; onOpen: (slug: string) => void; showName: boolean }) {
  const status = deriveStatus(review.data);
  const ms = status === 'open' ? openMilestone(review.data) : null;
  const tag = 'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap';
  return (
    <button type="button" onClick={() => onOpen(review.slug)} title={`Review «${review.data.name || review.slug}» öffnen`}
      className={`inline-flex items-center gap-1 flex-wrap rounded px-1 -mx-1 py-0.5 transition-colors ${isDark ? 'hover:bg-white/8' : 'hover:bg-black/5'}`}>
      {showName && <span className={`text-[11px] mr-1 underline-offset-2 hover:underline ${isDark ? 'text-white/60' : 'text-black/60'}`}>{review.data.name || review.slug}</span>}
      {approvedMilestones(review.data).map(m => (
        <span key={m} className={`${tag} ${isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
          <Check size={9} /> {m}
        </span>
      ))}
      {ms && (
        <span className={`${tag} ${isDark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-300'}`}>{ms} offen</span>
      )}
      {status === 'notRelevant' && (
        <span className={`${tag} ${isDark ? 'bg-white/8 text-white/50 border-white/15' : 'bg-black/5 text-black/50 border-black/15'}`}>nicht relevant</span>
      )}
    </button>
  );
}

// Übersicht aller Projekte (config/portfolio.json) mit manuellem
// Review-Status und den Meilenstein-Tags der zugehörigen Reviews
export default function PortfolioView({ onOpen, onBack }: { onOpen: (slug: string) => void; onBack: () => void }) {
  const { isDark, projects, portfolio, portfolioError, refreshPortfolio, refreshProjects, projectsLoading, updatePortfolio } = useStore();
  const { canAdmin } = usePermissions();
  const [qNumber, setQNumber] = useState('');
  const [qName, setQName] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<PortfolioStatus>>(new Set());
  const [err, setErr] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null); // Projekt im Detail-Dialog

  useEffect(() => { void refreshPortfolio(); void refreshProjects(); }, [refreshPortfolio, refreshProjects]);

  const border = isDark ? 'border-white/8' : 'border-black/8';
  const textMuted = isDark ? 'text-white/30' : 'text-black/30';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30'
    : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30';

  const items = portfolio?.projects ?? [];
  const rows = useMemo(() => items.map(p => ({ p, reviews: reviewsFor(p.number, projects) })), [items, projects]);
  // Reviews, die zu keinem Projekt der Liste gehören
  const orphans = useMemo(() => {
    const linked = new Set(rows.flatMap(r => r.reviews.map(x => x.slug)));
    return projects.filter(r => !linked.has(r.slug));
  }, [rows, projects]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(PORTFOLIO_STATUSES.map(s => [s, 0])) as Record<PortfolioStatus, number>;
    for (const { p } of rows) c[p.status]++;
    return c;
  }, [rows]);

  const nq = qNumber.trim().toLowerCase();
  const tq = qName.trim().toLowerCase();
  const visible = rows
    .filter(({ p }) => (!nq || p.number.toLowerCase().includes(nq))
      && (!tq || p.name.toLowerCase().includes(tq))
      && (statusFilter.size === 0 || statusFilter.has(p.status)))
    .sort((a, b) => PORTFOLIO_STATUSES.indexOf(a.p.status) - PORTFOLIO_STATUSES.indexOf(b.p.status)
      || b.p.number.localeCompare(a.p.number, 'de', { numeric: true }));
  const visibleOrphans = orphans.filter(r => (!nq || (reviewNumber(r) ?? '').toLowerCase().includes(nq) || r.slug.includes(nq))
    && (!tq || (r.data.name ?? '').toLowerCase().includes(tq)));

  const change = async (key: string, mutate: (list: PortfolioProject[]) => PortfolioProject[]) => {
    setErr(''); setBusyKey(key);
    const res = await updatePortfolio(prev => ({ ...prev, projects: mutate(prev.projects) }));
    setBusyKey(null);
    if (!res.ok) setErr(res.message);
  };
  const setStatus = (p: PortfolioProject, status: PortfolioStatus) =>
    change(numberKey(p.number), list => list.map(x => numberKey(x.number) === numberKey(p.number) ? { ...x, status } : x));
  const remove = (p: PortfolioProject) => {
    if (!window.confirm(`Projekt ${p.number} «${p.name}» aus der Projektliste entfernen?\n\nEin allfälliger Review bleibt erhalten; ein späterer Import nimmt das Projekt wieder als «${PORTFOLIO_STATUS_META.open.label}» auf.`)) return;
    void change(numberKey(p.number), list => list.filter(x => numberKey(x.number) !== numberKey(p.number)));
  };
  // Review ohne Eintrag: mit seiner Projektnummer in die Liste aufnehmen
  const adopt = (r: ProjectListItem, number: string) =>
    change(numberKey(number), list => list.some(x => numberKey(x.number) === numberKey(number)) ? list
      : [...list, { number, name: r.data.name || r.slug, status: 'inReview', importedAt: new Date().toISOString() }]);

  const toggleStatus = (s: PortfolioStatus) => setStatusFilter(prev => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  const badge = (s: PortfolioStatus) => `${isDark ? PORTFOLIO_STATUS_META[s].dark : PORTFOLIO_STATUS_META[s].light}`;
  // Status: Admins wählen ihn, alle anderen sehen ihn
  const statusControl = (p: PortfolioProject) => canAdmin ? (
    <select value={p.status} disabled={busyKey === numberKey(p.number)} onChange={e => void setStatus(p, e.target.value as PortfolioStatus)}
      title="Review-Status (manuell) — ein erneuter Import ändert ihn nicht"
      className={`text-[10px] px-1.5 py-0.5 rounded-full border outline-none cursor-pointer disabled:opacity-50 ${badge(p.status)}`}>
      {PORTFOLIO_STATUSES.map(s => <option key={s} value={s} className={isDark ? 'bg-neutral-900 text-white' : 'bg-white text-black'}>{PORTFOLIO_STATUS_META[s].label}</option>)}
    </select>
  ) : (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${badge(p.status)}`}>{PORTFOLIO_STATUS_META[p.status].label}</span>
  );
  const detailRow = detailKey ? rows.find(r => numberKey(r.p.number) === detailKey) : undefined;

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className={`flex items-center gap-1.5 text-xs ${textMuted} hover:opacity-70`}>
          <ArrowLeft size={12} /> Reviews
        </button>
        {portfolio?.lastImport && (
          <span className={`text-[11px] ${textMuted}`}>
            Letzter Import: {fmtTimestamp(portfolio.lastImport.at)}{portfolio.lastImport.by ? ` · ${portfolio.lastImport.by}` : ''}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className={`text-sm font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>
          Projektübersicht <span className={`normal-case tracking-normal font-normal ${textMuted}`}>· {items.length} Projekte</span>
        </h2>
        <div className="flex items-center gap-2">
          {([['Nummer', qNumber, setQNumber, 'w-28'], ['Name', qName, setQName, 'w-48']] as const).map(([label, value, set, w]) => (
            <div key={label} className={`flex items-center gap-1.5 px-2 rounded border transition-colors ${inputCls}`}>
              <Search size={11} className={textMuted} />
              <input value={value} placeholder={`${label} …`} onChange={e => set(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') set(''); }}
                className={`${w} text-xs py-1.5 bg-transparent outline-none placeholder:opacity-60`} />
              {value && (
                <button onClick={() => set('')} title="Filter leeren"
                  className={`p-0.5 rounded transition-colors ${isDark ? 'text-white/30 hover:text-white/70' : 'text-black/30 hover:text-black/70'}`}>
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          <button onClick={() => { void refreshPortfolio(); void refreshProjects(); }} title="Neu laden" disabled={projectsLoading}
            className={`p-1.5 rounded transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
            <RefreshCw size={12} className={projectsLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Status-Filter mit Anzahl */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {PORTFOLIO_STATUSES.map(s => {
          const on = statusFilter.has(s);
          return (
            <button key={s} onClick={() => toggleStatus(s)} title={on ? 'Filter entfernen' : `Nur «${PORTFOLIO_STATUS_META[s].label}» zeigen`}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-opacity ${badge(s)} ${statusFilter.size && !on ? 'opacity-40 hover:opacity-70' : ''} ${on ? 'ring-1 ring-current' : ''}`}>
              {PORTFOLIO_STATUS_META[s].label} · {counts[s]}
            </button>
          );
        })}
        {statusFilter.size > 0 && (
          <button onClick={() => setStatusFilter(new Set())} className={`text-[11px] ${textMuted} hover:underline`}>alle</button>
        )}
      </div>

      {portfolioError && <p className={`text-[11px] mb-3 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{portfolioError}</p>}
      {err && <p className={`text-[11px] mb-3 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{err}</p>}

      {portfolio && items.length === 0 && (
        <p className={`text-sm mb-6 ${textMuted}`}>
          Noch keine Projekte in der Liste.{canAdmin ? ' Import der Excel-Liste unter Admin → Projektliste.' : ' Ein Admin importiert sie aus Excel.'}
        </p>
      )}
      {items.length > 0 && visible.length === 0 && <p className={`text-sm mb-6 ${textMuted}`}>Kein Projekt passt zum Filter.</p>}

      {visible.length > 0 && (
        <div className={`rounded-xl border overflow-hidden mb-8 ${border}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className={`text-left text-[10px] uppercase tracking-wider ${isDark ? 'text-white/40 bg-white/3' : 'text-black/40 bg-black/3'}`}>
                <th className="px-3 py-2 font-normal w-28">Nummer</th>
                <th className="px-3 py-2 font-normal">Name</th>
                <th className="px-3 py-2 font-normal w-32">Status</th>
                <th className="px-3 py-2 font-normal">Review</th>
                <th className="w-8" />
                {canAdmin && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ p, reviews }) => {
                const key = numberKey(p.number);
                return (
                  <tr key={key} className={`border-t align-top ${border} ${p.status === 'archived' ? 'opacity-60' : ''}`}>
                    <td className={`px-3 py-2 font-mono whitespace-nowrap ${isDark ? 'text-white/70' : 'text-black/70'}`}>{p.number}</td>
                    <td className={`px-3 py-2 ${isDark ? 'text-white/90' : 'text-black/90'}`}>
                      {p.name
                        ? <button type="button" onClick={() => setDetailKey(key)} title="Details anzeigen" className="text-left hover:underline underline-offset-2">{p.name}</button>
                        : <span className={textMuted}>–</span>}
                      {p.createdDate && <span className={`ml-2 text-[10px] ${textMuted}`}>{p.createdDate.split('-').reverse().join('.')}</span>}
                    </td>
                    <td className="px-3 py-2">{statusControl(p)}</td>
                    <td className="px-3 py-2">
                      {reviews.length === 0
                        ? <span className={textMuted}>–</span>
                        : <div className="flex flex-col gap-0.5 items-start">
                            {reviews.map(r => <ReviewTags key={r.slug} review={r} isDark={isDark} onOpen={onOpen} showName={reviews.length > 1} />)}
                          </div>}
                    </td>
                    <td className="px-1 py-1.5">
                      <button onClick={() => setDetailKey(key)} title="Details anzeigen"
                        className={`p-1.5 rounded transition-colors ${isDark ? 'text-white/35 hover:text-white/85' : 'text-black/35 hover:text-black/85'}`}>
                        <Info size={12} />
                      </button>
                    </td>
                    {canAdmin && (
                      <td className="px-1 py-1.5">
                        <button onClick={() => remove(p)} disabled={busyKey === key} title="Aus der Projektliste entfernen"
                          className={`p-1.5 rounded transition-colors disabled:opacity-40 ${isDark ? 'text-white/20 hover:text-red-400' : 'text-black/20 hover:text-red-500'}`}>
                          <Trash2 size={11} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reviews ohne Eintrag in der Projektliste */}
      {visibleOrphans.length > 0 && statusFilter.size === 0 && (
        <>
          <h3 className={`text-[11px] font-semibold uppercase tracking-widest mb-2 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
            Reviews ohne Eintrag in der Projektliste
          </h3>
          <p className={`text-[11px] mb-3 ${textMuted}`}>
            Zugeordnet wird über die Projektnummer des Reviews (aus dem MS10-Import) oder die Nummer im Review-Namen.
          </p>
          <div className={`rounded-xl border overflow-hidden ${border}`}>
            <table className="w-full text-xs">
              <tbody>
                {visibleOrphans.map(r => {
                  const n = reviewNumber(r);
                  return (
                    <tr key={r.slug} className={`border-t first:border-t-0 ${border}`}>
                      <td className={`px-3 py-2 font-mono w-28 whitespace-nowrap ${n ? (isDark ? 'text-white/70' : 'text-black/70') : textMuted}`}>{n ?? '–'}</td>
                      <td className="px-3 py-2"><ReviewTags review={r} isDark={isDark} onOpen={onOpen} showName /></td>
                      {canAdmin && (
                        <td className="px-3 py-2 text-right">
                          {n ? (
                            <button onClick={() => void adopt(r, n)} disabled={busyKey === numberKey(n)}
                              title={`${n} mit Status «${PORTFOLIO_STATUS_META.inReview.label}» in die Projektliste aufnehmen`}
                              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                              <Plus size={10} /> aufnehmen
                            </button>
                          ) : <span className={`text-[10px] ${textMuted}`}>keine Projektnummer</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detailRow && (
        <PortfolioDetail project={detailRow.p} reviews={detailRow.reviews} order={portfolio?.detailColumns ?? []}
          statusControl={statusControl(detailRow.p)} isDark={isDark}
          onOpen={slug => { setDetailKey(null); onOpen(slug); }} onClose={() => setDetailKey(null)} />
      )}
    </div>
  );
}

const fmtDate = (iso: string) => iso.split('-').reverse().join('.');

// Detail-Dialog eines Projekts: Nummer, Name, Status, die beim Import
// gewählten Excel-Spalten und die verknüpften Reviews
function PortfolioDetail({ project: p, reviews, order, statusControl, isDark, onOpen, onClose }: {
  project: PortfolioProject;
  reviews: ProjectListItem[];
  order: string[];
  statusControl: React.ReactNode;
  isDark: boolean;
  onOpen: (slug: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const textMuted = isDark ? 'text-white/40' : 'text-black/40';
  const border = isDark ? 'border-white/8' : 'border-black/8';
  const details = p.details ?? {};
  // Reihenfolge wie beim Import gewählt, übrige (ältere Importe) danach
  const keys = [...order.filter(k => k in details), ...Object.keys(details).filter(k => !order.includes(k))];
  const value = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v)
      : /^https?:\/\/\S+$/i.test(v) ? <a href={v} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">{v}</a>
      : v;
  const field = (label: string, content: React.ReactNode) => (
    <div key={label} className={`grid grid-cols-[minmax(8rem,14rem)_1fr] gap-3 py-1.5 border-t first:border-t-0 ${border}`}>
      <dt className={`text-[11px] ${textMuted}`}>{label}</dt>
      <dd className={`text-xs whitespace-pre-wrap break-words ${isDark ? 'text-white/85' : 'text-black/85'}`}>{content}</dd>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Projekt ${p.number}`}
        className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b ${border}`}>
          <div className="min-w-0">
            <div className={`text-[11px] font-mono ${textMuted}`}>{p.number}</div>
            <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>{p.name || '–'}</h3>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {statusControl}
            <button onClick={onClose} title="Schliessen (Esc)"
              className={`p-1 rounded transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-6 py-4 space-y-5">
          <dl>
            {p.createdDate && field('Erstellt', fmtDate(p.createdDate))}
            {keys.map(k => field(k, value(details[k])))}
            {!p.createdDate && keys.length === 0 && (
              <p className={`text-[11px] ${textMuted}`}>Keine Details importiert — die Spalten wählt ein Admin beim Excel-Import (Admin → Projektliste).</p>
            )}
          </dl>
          <div>
            <h4 className={`text-[10px] uppercase tracking-wider mb-2 ${textMuted}`}>Architektur-Review</h4>
            {reviews.length === 0 ? (
              <p className={`text-[11px] ${textMuted}`}>Kein Review zu dieser Projektnummer.</p>
            ) : (
              <div className="space-y-1.5">
                {reviews.map(r => (
                  <div key={r.slug} className="flex items-center gap-2">
                    <ReviewTags review={r} isDark={isDark} onOpen={onOpen} showName />
                    <button onClick={() => onOpen(r.slug)} title="Review öffnen"
                      className={`ml-auto p-1 rounded transition-colors ${isDark ? 'text-white/30 hover:text-white/80' : 'text-black/30 hover:text-black/80'}`}>
                      <ExternalLink size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {p.importedAt && (
          <div className={`px-6 py-2 border-t text-[10px] ${border} ${textMuted}`}>Erstmals importiert: {fmtTimestamp(p.importedAt)}</div>
        )}
      </div>
    </div>
  );
}
