// Kommentare am OnePager: Sprechblase je Stelle (Antwort, Bemerkung,
// Kontrollpunkt, Beschrieb), ein seitliches Panel mit dem Faden der aktiven
// Stelle, Übersicht über alle Stellen mit Kommentaren und Schrittfolge
// («Weiter»/«Zurück» durch alle Stellen mit offenen — auf Wunsch auch
// erledigten — Kommentaren). Die Daten hält OnePagerView (Sidecar-Datei via
// store.loadComments/updateComments); hier nur Darstellung und Formulare.
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CornerDownRight, List, MessageSquare, RotateCcw, Trash2, X } from 'lucide-react';
import type { Comment, CommentAuthor } from '../types';
import { fmtTimestamp } from '../util';

// Eine kommentierbare Stelle: key = Anker (siehe Comment.target), label wie im
// Panel und in der Übersicht angezeigt (z. B. «M10A1 Frage …»).
export interface CommentTargetInfo {
  key: string;
  label: string;
  group?: string; // z. B. «M20 · Architektur-Vorgaben» — Überschrift in der Übersicht
}

// Kürzel aus dem Namen: «Pascal Mengelt» → PM, «Mengelt, Pascal» → PM,
// «pascal.mengelt@firma.ch» → PM, einzelnes Wort → erste zwei Buchstaben.
export function initialsOf(name: string): string {
  let n = name.trim();
  if (!n) return '?';
  if (n.includes('@')) n = n.split('@')[0].replace(/[._-]+/g, ' ');
  if (n.includes(',')) n = n.split(',').reverse().map(s => s.trim()).join(' ');
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function authorOf(name: string, email?: string): CommentAuthor {
  return { name: name.trim(), initials: initialsOf(name), ...(email?.trim() ? { email: email.trim() } : {}) };
}

// Wurzelkommentare einer Stelle (ohne Antworten), chronologisch
export const rootsOf = (comments: Comment[], target: string) =>
  comments.filter(c => c.target === target && !c.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const repliesOf = (comments: Comment[], parentId: string) =>
  comments.filter(c => c.parentId === parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export function countsOf(comments: Comment[], target: string): { open: number; resolved: number } {
  const roots = rootsOf(comments, target);
  const resolved = roots.filter(r => r.resolved === true).length;
  return { open: roots.length - resolved, resolved };
}

// Kürzel als Chip, mit mailto-Link wenn eine E-Mail bekannt ist
export function AuthorChip({ author, isDark }: { author: CommentAuthor; isDark: boolean }) {
  const cls = `inline-flex items-center justify-center min-w-[26px] h-5 px-1.5 rounded-full text-[10px] font-bold tracking-wide border flex-shrink-0 ${
    isDark ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-300'}`;
  const title = author.email ? `${author.name} · ${author.email}` : author.name;
  return author.email
    ? <a href={`mailto:${author.email}`} title={title} className={`${cls} hover:underline`}>{author.initials}</a>
    : <span title={title} className={cls}>{author.initials}</span>;
}

// Sprechblase an einer Stelle: zeigt die Zahl offener Kommentare; nur
// erledigte → gedämpftes Häkchen; aktiv (im Panel geöffnet) → hervorgehoben
export function CommentBubble({ open, resolved, active, onClick, isDark, title }: {
  open: number; resolved: number; active: boolean; onClick: () => void; isDark: boolean; title?: string;
}) {
  const has = open > 0;
  const cls = active
    ? (isDark ? 'text-blue-300 bg-blue-500/20 border-blue-500/40' : 'text-blue-700 bg-blue-50 border-blue-300')
    : has
      ? (isDark ? 'text-blue-300 border-blue-500/30 hover:bg-blue-500/10' : 'text-blue-700 border-blue-300 hover:bg-blue-50')
      : resolved > 0
        ? (isDark ? 'text-emerald-400/70 border-transparent hover:border-white/20' : 'text-emerald-600/70 border-transparent hover:border-black/20')
        : (isDark ? 'text-white/25 border-transparent hover:text-white/70 hover:border-white/20' : 'text-black/25 border-transparent hover:text-black/70 hover:border-black/20');
  const tip = title ?? (has ? `${open} offene${open === 1 ? 'r Kommentar' : ' Kommentare'}` : resolved > 0 ? `${resolved} erledigte${resolved === 1 ? 'r Kommentar' : ' Kommentare'}` : 'Kommentieren');
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onClick(); }} title={tip}
      className={`inline-flex items-center gap-1 h-[18px] px-1 rounded border text-[10px] font-normal leading-none flex-shrink-0 transition-colors ${cls}`}>
      <MessageSquare size={11} />
      {has ? <span>{open}</span> : resolved > 0 ? <Check size={9} /> : null}
    </button>
  );
}

interface PanelProps {
  isDark: boolean;
  comments: Comment[];
  targets: CommentTargetInfo[]; // Reihenfolge = Schrittfolge (Dokumentreihenfolge)
  active: string | null;        // null = Übersicht
  showResolved: boolean;
  onToggleResolved: (v: boolean) => void;
  onSelect: (key: string | null) => void;
  onClose: () => void;
  canComment: boolean;
  author: CommentAuthor | null; // null = Name fehlt (nicht angemeldet und kein Name eingegeben)
  askName?: { value: string; onChange: (v: string) => void }; // ohne Anmeldung: Name manuell
  onAdd: (target: string, text: string, parentId?: string) => Promise<boolean>;
  onResolve: (id: string, resolved: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function CommentsPanel(p: PanelProps) {
  const { isDark, comments, targets, active, showResolved } = p;
  const textMuted = isDark ? 'text-white/40' : 'text-black/40';
  const textBase = isDark ? 'text-white/85' : 'text-black/85';
  const border = isDark ? 'border-white/10' : 'border-black/10';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30'
    : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30';
  const btnGhost = `text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/60 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/60 hover:border-black/30 hover:text-black'}`;
  const btnPrimary = `text-[11px] px-2.5 py-1 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`;
  const iconBtn = `p-1 rounded transition-colors disabled:opacity-30 ${isDark ? 'text-white/40 hover:text-white' : 'text-black/40 hover:text-black'}`;

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // Stellenwechsel: Entwürfe verwerfen, neues Kommentarfeld fokussieren
  useEffect(() => { setDraft(''); setReplyTo(null); setReplyDraft(''); }, [active]);
  useEffect(() => {
    // preventScroll: sonst bricht das Fokussieren den sanften Scroll zur Stelle ab
    if (active && p.canComment) setTimeout(() => draftRef.current?.focus({ preventScroll: true }), 50);
  }, [active, p.canComment]);

  // Esc schliesst (ausser beim Tippen in einem Feld)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      p.onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [p.onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schrittfolge: Stellen mit (offenen bzw. allen) Kommentaren in Dokumentreihenfolge
  const hasVisible = (key: string) => {
    const c = countsOf(comments, key);
    return c.open > 0 || (showResolved && c.resolved > 0);
  };
  const steps = targets.filter(t => hasVisible(t.key));
  const totalOpen = targets.reduce((n, t) => n + countsOf(comments, t.key).open, 0);
  const totalResolved = targets.reduce((n, t) => n + countsOf(comments, t.key).resolved, 0);
  const pos = active ? targets.findIndex(t => t.key === active) : -1;
  const stepIndex = active ? steps.findIndex(t => t.key === active) : -1;
  // Schrittfolge läuft rund: nach der letzten Stelle kommt wieder die erste
  const prev = [...steps].reverse().find(t => targets.findIndex(x => x.key === t.key) < pos) ?? steps[steps.length - 1];
  const next = steps.find(t => targets.findIndex(x => x.key === t.key) > pos) ?? steps[0];
  const canStep = steps.length > 1 || (steps.length === 1 && stepIndex < 0);

  const submit = async (target: string, text: string, parentId?: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const ok = await p.onAdd(target, t, parentId);
      if (ok) {
        if (parentId) { setReplyTo(null); setReplyDraft(''); } else setDraft('');
      }
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, fn: () => void) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); fn(); }
  };

  const nameField = p.askName && (
    <input value={p.askName.value} onChange={e => p.askName!.onChange(e.target.value)}
      placeholder="Dein Name (nicht angemeldet)"
      className={`w-full text-[11px] px-2 py-1 rounded border outline-none transition-colors ${inputCls} ${!p.askName.value.trim() ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
  );

  const commentRow = (c: Comment, isReply: boolean) => (
    <div key={c.id} className={`flex gap-2 ${isReply ? 'ml-5' : ''} ${c.resolved ? 'opacity-60' : ''}`}>
      {isReply ? <CornerDownRight size={12} className={`mt-1 flex-shrink-0 ${textMuted}`} /> : null}
      <AuthorChip author={c.author} isDark={isDark} />
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-2 text-[10px] ${textMuted}`}>
          <span className="truncate" title={c.author.name}>{c.author.name}</span>
          <span className="flex-shrink-0">{fmtTimestamp(c.createdAt)}</span>
          <span className="ml-auto flex items-center gap-0.5 flex-shrink-0">
            {p.canComment && !isReply && (
              <button type="button" title="Antworten" className={iconBtn}
                onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyDraft(''); }}>
                <CornerDownRight size={11} />
              </button>
            )}
            {p.canComment && !isReply && (
              <button type="button" title={c.resolved ? 'Wieder öffnen' : 'Als erledigt markieren'} className={iconBtn}
                onClick={() => void p.onResolve(c.id, !c.resolved)}>
                {c.resolved ? <RotateCcw size={11} /> : <Check size={11} />}
              </button>
            )}
            {p.canComment && (
              <button type="button" title={isReply ? 'Antwort löschen' : 'Kommentar samt Antworten löschen'}
                className={`p-1 rounded transition-colors ${isDark ? 'text-white/30 hover:text-rose-400' : 'text-black/30 hover:text-rose-500'}`}
                onClick={() => { if (window.confirm(isReply ? 'Antwort endgültig löschen?' : 'Kommentar samt Antworten endgültig löschen?')) void p.onDelete(c.id); }}>
                <Trash2 size={11} />
              </button>
            )}
          </span>
        </div>
        <p className={`text-[11px] leading-relaxed whitespace-pre-wrap break-words mt-0.5 ${textBase}`}>{c.text}</p>
        {c.resolved && (
          <p className={`text-[10px] mt-0.5 ${isDark ? 'text-emerald-400/80' : 'text-emerald-600'}`}>
            ✓ erledigt{c.resolvedBy ? ` von ${c.resolvedBy.initials}` : ''}{c.resolvedAt ? ` · ${fmtTimestamp(c.resolvedAt)}` : ''}
          </p>
        )}
      </div>
    </div>
  );

  const thread = (target: string) => {
    const roots = rootsOf(comments, target).filter(r => showResolved || r.resolved !== true);
    const hidden = rootsOf(comments, target).length - roots.length;
    return (
      <div className="space-y-4">
        {roots.length === 0 && (
          <p className={`text-[11px] ${textMuted}`}>
            {hidden > 0 ? `${hidden} erledigte${hidden === 1 ? 'r Kommentar' : ' Kommentare'} ausgeblendet.` : 'Noch keine Kommentare an dieser Stelle.'}
          </p>
        )}
        {roots.map(r => (
          <div key={r.id} className="space-y-2">
            {commentRow(r, false)}
            {repliesOf(comments, r.id).map(c => commentRow(c, true))}
            {replyTo === r.id && (
              <div className="ml-5 space-y-1.5">
                {nameField}
                <textarea value={replyDraft} autoFocus rows={2}
                  onChange={e => setReplyDraft(e.target.value)}
                  onKeyDown={e => onKey(e, () => void submit(target, replyDraft, r.id))}
                  placeholder="Antwort … (Ctrl/Cmd+Enter sendet)"
                  className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y ${inputCls}`} />
                <div className="flex gap-1.5">
                  <button type="button" className={btnPrimary} disabled={busy || !replyDraft.trim() || !p.author}
                    onClick={() => void submit(target, replyDraft, r.id)}>Antworten</button>
                  <button type="button" className={btnGhost} onClick={() => { setReplyTo(null); setReplyDraft(''); }}>Abbrechen</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {roots.length > 0 && hidden > 0 && (
          <p className={`text-[10px] ${textMuted}`}>{hidden} erledigte{hidden === 1 ? 'r Kommentar' : ' Kommentare'} ausgeblendet.</p>
        )}
      </div>
    );
  };

  // Übersicht: alle Stellen mit Kommentaren, gruppiert nach Meilenstein/Bereich
  const overview = () => {
    if (steps.length === 0) {
      return (
        <p className={`text-[11px] ${textMuted}`}>
          {totalResolved > 0 && !showResolved
            ? `Keine offenen Kommentare — ${totalResolved} erledigte ausgeblendet.`
            : 'Noch keine Kommentare. Die Sprechblase neben einer Antwort oder Bemerkung öffnet den Kommentar-Dialog.'}
        </p>
      );
    }
    const groups: { group: string; items: CommentTargetInfo[] }[] = [];
    for (const t of steps) {
      const g = t.group ?? '';
      const last = groups[groups.length - 1];
      if (last && last.group === g) last.items.push(t); else groups.push({ group: g, items: [t] });
    }
    return (
      <div className="space-y-3">
        {groups.map((g, i) => (
          <div key={i}>
            {g.group && <p className={`text-[10px] uppercase tracking-wider mb-1 ${textMuted}`}>{g.group}</p>}
            <div className="space-y-0.5">
              {g.items.map(t => {
                const c = countsOf(comments, t.key);
                return (
                  <button key={t.key} type="button" onClick={() => p.onSelect(t.key)}
                    className={`w-full flex items-start gap-2 text-left px-2 py-1.5 rounded transition-colors ${isDark ? 'hover:bg-white/8' : 'hover:bg-black/5'}`}>
                    <span className={`text-[11px] flex-1 min-w-0 leading-snug ${textBase}`}>{t.label}</span>
                    <span className={`text-[10px] flex-shrink-0 ${c.open > 0 ? (isDark ? 'text-blue-300' : 'text-blue-700') : textMuted}`}>
                      {c.open > 0 ? `${c.open} offen` : ''}{c.open > 0 && c.resolved > 0 && showResolved ? ' · ' : ''}{showResolved && c.resolved > 0 ? `${c.resolved} erledigt` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const activeInfo = active ? targets.find(t => t.key === active) : null;

  return (
    <aside className={`w-[380px] max-w-[45vw] flex-shrink-0 sticky top-0 self-start max-h-[calc(100vh-120px)] flex flex-col rounded-xl border shadow-lg ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}>
      {/* Kopf */}
      <div className={`px-3 py-2 border-b ${border} flex items-center gap-1.5`}>
        {active ? (
          <button type="button" onClick={() => p.onSelect(null)} title="Übersicht aller Kommentare" className={iconBtn}>
            <List size={13} />
          </button>
        ) : (
          <MessageSquare size={13} className={textMuted} />
        )}
        <span className={`text-xs font-semibold flex-1 min-w-0 truncate ${isDark ? 'text-white' : 'text-black'}`}>
          {active ? 'Kommentar' : 'Kommentare'}
          <span className={`ml-2 text-[10px] font-normal ${textMuted}`}>
            {totalOpen} offen{showResolved ? ` · ${totalResolved} erledigt` : ''}
          </span>
        </span>
        <button type="button" onClick={() => prev && p.onSelect(prev.key)} disabled={!canStep} title="Vorheriger Kommentar" className={iconBtn}>
          <ChevronLeft size={13} />
        </button>
        <span className={`text-[10px] tabular-nums ${textMuted}`}>{stepIndex >= 0 ? `${stepIndex + 1}/${steps.length}` : `${steps.length}`}</span>
        <button type="button" onClick={() => next && p.onSelect(next.key)} disabled={!canStep} title="Nächster Kommentar" className={iconBtn}>
          <ChevronRight size={13} />
        </button>
        <button type="button" onClick={p.onClose} title="Schliessen (Esc)" className={iconBtn}>
          <X size={13} />
        </button>
      </div>
      <div className={`px-3 py-1.5 border-b ${border} flex items-center gap-3`}>
        <label className={`flex items-center gap-1.5 text-[10px] cursor-pointer ${textMuted}`}>
          <input type="checkbox" checked={showResolved} onChange={e => p.onToggleResolved(e.target.checked)} className="accent-blue-500" />
          Erledigte einblenden
        </label>
        {!active && steps.length > 0 && (
          <button type="button" className={`ml-auto ${btnGhost}`} onClick={() => p.onSelect(steps[0].key)}>
            Alle durchgehen <ChevronRight size={10} className="inline -mt-0.5" />
          </button>
        )}
      </div>
      {activeInfo && (
        <div className={`px-3 py-2 border-b ${border}`}>
          {activeInfo.group && <p className={`text-[10px] uppercase tracking-wider ${textMuted}`}>{activeInfo.group}</p>}
          <p className={`text-[11px] font-semibold leading-snug ${textBase}`}>{activeInfo.label}</p>
        </div>
      )}
      {active && !activeInfo && (
        <div className={`px-3 py-2 border-b ${border}`}>
          <p className={`text-[11px] ${textMuted}`}>Stelle nicht mehr im OnePager sichtbar ({active}).</p>
        </div>
      )}

      {/* Inhalt */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {active ? thread(active) : overview()}
      </div>

      {/* Neuer Kommentar */}
      {active && p.canComment && (
        <div className={`px-3 py-2 border-t ${border} space-y-1.5`}>
          {nameField}
          <textarea ref={draftRef} value={draft} rows={2}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => onKey(e, () => void submit(active, draft))}
            placeholder="Neuer Kommentar … (Ctrl/Cmd+Enter sendet)"
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y ${inputCls}`} />
          <div className="flex items-center gap-2">
            {p.author && <AuthorChip author={p.author} isDark={isDark} />}
            <span className={`text-[10px] truncate flex-1 ${textMuted}`}>{p.author?.name ?? 'Name eingeben'}</span>
            <button type="button" className={btnPrimary} disabled={busy || !draft.trim() || !p.author}
              onClick={() => void submit(active, draft)}>
              {busy ? 'Speichert …' : 'Kommentieren'}
            </button>
          </div>
        </div>
      )}
      {active && !p.canComment && (
        <div className={`px-3 py-2 border-t ${border} text-[10px] ${textMuted}`}>Nur lesen — Kommentieren braucht Reviewer- oder Admin-Rechte.</div>
      )}
    </aside>
  );
}
