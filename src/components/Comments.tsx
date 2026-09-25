// Kommentare am OnePager: Sprechblase je Stelle (Antwort, Bemerkung,
// Kontrollpunkt, Beschrieb), ein seitliches Panel mit dem Faden der aktiven
// Stelle, Übersicht über alle Stellen mit Kommentaren und Schrittfolge
// («Weiter»/«Zurück» durch alle Stellen mit offenen — auf Wunsch auch
// erledigten — Kommentaren). Die Daten hält OnePagerView (Sidecar-Datei via
// store.loadComments/updateComments); hier nur Darstellung und Formulare.
import React, { useEffect, useRef, useState } from 'react';
import { AtSign, Check, ChevronLeft, ChevronRight, Clock, CornerDownRight, List, MessageSquare, RotateCcw, Send, Trash2, X } from 'lucide-react';
import type { Comment, CommentAuthor, DirectoryUser } from '../types';
import type { DirectorySearchResult } from '../store';
import { fmtTimestamp } from '../util';

// Eine kommentierbare Stelle: key = Anker (siehe Comment.target), label wie im
// Panel und in der Übersicht angezeigt (z. B. «M10A1 Frage …»).
export interface CommentTargetInfo {
  key: string;
  label: string;
  group?: string; // z. B. «M20 · Architektur-Vorgaben» — Überschrift in der Übersicht
}

// Namensteile für das Kürzel. Bevorzugt die E-Mail, wenn sie wie
// «vorname.nachname@…» aussieht — sie ist eindeutig geordnet, während der
// Anzeigename je nach Tenant «Pascal Mengelt» oder «Mengelt Pascal (ESP)»
// heisst. Sonst der Anzeigename: Zusätze in Klammern und alles ausser
// Buchstaben weg; Leerzeichen, Punkt, Bindestrich und Unterstrich trennen;
// «Mengelt, Pascal» wird gedreht.
function nameParts(p: { name: string; email?: string }): string[] {
  const local = (p.email ?? '').split('@')[0];
  const fromMail = local.split(/[._\-]+/).filter(s => /^[\p{L}]+$/u.test(s));
  if (fromMail.length >= 2) return fromMail;
  let n = p.name.trim().replace(/\([^)]*\)/g, ' ');
  if (n.includes('@')) n = n.split('@')[0];
  if (n.includes(',')) n = n.split(',').reverse().map(s => s.trim()).join(' ');
  const parts = n.split(/[\s._\-]+/).map(s => s.replace(/[^\p{L}]/gu, '')).filter(Boolean);
  return parts.length ? parts : (fromMail.length ? fromMail : [p.name.trim() || '?']);
}

// Kürzel-Stufe: 0 = 1 Buchstabe Vorname + 1 Nachname (ein Wort: 2), jede
// weitere Stufe nimmt einen Buchstaben mehr vom Nachnamen (ein Wort: vom
// Wort) — PM › PME › PMEN … Ist das Wort ausgeschöpft, hängt eine Zahl an.
function initialsLevel(p: { name: string; email?: string }, level: number): string {
  const parts = nameParts(p);
  if (!parts.length) return '?';
  const first = parts[0], last = parts[parts.length - 1];
  const raw = parts.length === 1
    ? first.slice(0, 2 + level)
    : first[0] + last.slice(0, 1 + level);
  const max = parts.length === 1 ? first.length : 1 + last.length;
  const want = 2 + level;
  const base = raw.toUpperCase();
  return want > max ? `${base}${want - max + 1}` : base;
}

// Kürzel ohne Rücksicht auf andere (Stufe 0): «Pascal Mengelt» → PM
export function initialsOf(name: string, email?: string): string {
  return initialsLevel({ name, email }, 0);
}

export const personKey = (p: { name: string; email?: string }) => (p.email?.trim() || p.name.trim()).toLowerCase();

// Eindeutige Kürzel für eine Gruppe von Personen: in der gegebenen
// Reihenfolge bekommt jede das kürzeste noch freie Kürzel (wer zuerst kommt,
// behält das kurze; die nächste Person mit gleichem Kürzel bekommt eines
// mit einem Buchstaben mehr).
export function assignInitials(people: { name: string; email?: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const p of people) {
    const key = personKey(p);
    if (!key || out.has(key)) continue;
    let level = 0, cand = initialsLevel(p, 0);
    while (taken.has(cand) && level < 12) { level++; cand = initialsLevel(p, level); }
    out.set(key, cand);
    taken.add(cand);
  }
  return out;
}

export function authorOf(name: string, email?: string, initials?: string): CommentAuthor {
  return { name: name.trim(), initials: initials ?? initialsOf(name, email), ...(email?.trim() ? { email: email.trim() } : {}) };
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
export function AuthorChip({ author, initials, isDark }: { author: CommentAuthor; initials?: string; isDark: boolean }) {
  const cls = `inline-flex items-center justify-center min-w-[26px] h-5 px-1.5 rounded-full text-[10px] font-bold tracking-wide border flex-shrink-0 ${
    isDark ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-300'}`;
  const title = author.email ? `${author.name} · ${author.email}` : author.name;
  const text = initials ?? author.initials;
  return author.email
    ? <a href={`mailto:${author.email}`} title={title} className={`${cls} hover:underline`}>{text}</a>
    : <span title={title} className={cls}>{text}</span>;
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

// ── @-Erwähnungen ────────────────────────────────────────────────────────────
// «@» im Text öffnet eine Auswahl: zuerst die im Ordner bekannten Personen
// (users.json, Kommentar-Autoren), dann Treffer aus Entra (Graph-Suche,
// entprellt). Auswahl fügt «@Name » ein und merkt sich die Person; beim
// Senden zählen nur Erwähnungen, deren «@Name» noch im Text steht.
const MENTION_RE = /(^|[\s(«"'])@([^\s@]{0,40})$/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Erwähnungen im Text hervorheben (mailto-Link)
export function renderWithMentions(text: string, mentions: DirectoryUser[] | undefined, isDark: boolean): React.ReactNode {
  const names = (mentions ?? []).map(m => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const re = new RegExp(`@(${names.map(escapeRe).join('|')})`, 'g');
  const out: React.ReactNode[] = [];
  let last = 0, i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const u = (mentions ?? []).find(x => x.name === m[1]);
    out.push(
      <a key={i++} href={u?.email ? `mailto:${u.email}` : undefined} title={u?.email}
        className={`font-semibold rounded px-0.5 ${isDark ? 'text-blue-300 bg-blue-500/15' : 'text-blue-700 bg-blue-50'}`}>
        @{m[1]}
      </a>,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MentionTextarea(p: {
  value: string;
  onChange: (v: string) => void;
  onMention: (u: DirectoryUser) => void;
  onSubmit: () => void;
  users: DirectoryUser[];
  searchUsers: (q: string) => Promise<DirectorySearchResult>;
  onDirectoryProblem: (r: Extract<DirectorySearchResult, { ok: false }>) => void;
  initialsFor: (p: { name: string; email?: string }) => string;
  isDark: boolean;
  placeholder: string;
  rows: number;
  autoFocus?: boolean;
  className: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const { isDark } = p;
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = p.textareaRef ?? innerRef;
  const [menu, setMenu] = useState<{ query: string; start: number; caret: number } | null>(null);
  const [remote, setRemote] = useState<DirectoryUser[]>([]);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const remoteOff = useRef(false); // Suche einmal gescheitert → in dieser Sitzung nicht mehr versuchen

  const detect = () => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const m = el.value.slice(0, caret).match(MENTION_RE);
    if (!m) { setMenu(null); return; }
    const query = m[2];
    setMenu(prev => (prev && prev.query === query && prev.caret === caret) ? prev : { query, start: caret - query.length - 1, caret });
  };

  // Entra-Suche entprellt
  useEffect(() => {
    if (!menu || remoteOff.current) { setRemote([]); return; }
    const q = menu.query.trim();
    if (q.length < 2) { setRemote([]); return; }
    let alive = true;
    setRemoteBusy(true);
    const t = setTimeout(async () => {
      const r = await p.searchUsers(q);
      if (!alive) return;
      setRemoteBusy(false);
      if (r.ok) setRemote(r.users);
      else { setRemote([]); remoteOff.current = true; p.onDirectoryProblem(r); }
    }, 300);
    return () => { alive = false; clearTimeout(t); setRemoteBusy(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.query]);

  const q = (menu?.query ?? '').toLowerCase();
  // Rang: Name beginnt mit … › ein Wort beginnt mit … › kommt vor (Name/E-Mail)
  const rank = (u: DirectoryUser) => {
    const n = u.name.toLowerCase();
    if (!q) return 0;
    if (n.startsWith(q)) return 0;
    if (n.split(/\s+/).some(w => w.startsWith(q)) || u.email.toLowerCase().startsWith(q)) return 1;
    if (n.includes(q) || u.email.toLowerCase().includes(q)) return 2;
    return 9;
  };
  const local = p.users.map(u => ({ u, r: rank(u) })).filter(x => x.r < 9).sort((a, b) => a.r - b.r).map(x => x.u).slice(0, 6);
  const items = [...local, ...remote.filter(r => !local.some(l => l.email.toLowerCase() === r.email.toLowerCase()))].slice(0, 10);
  useEffect(() => { setSel(0); }, [menu?.query, items.length]);

  const pick = (u: DirectoryUser) => {
    if (!menu) return;
    const before = p.value.slice(0, menu.start);
    const after = p.value.slice(menu.caret);
    const inserted = `@${u.name} `;
    p.onChange(before + inserted + after);
    p.onMention(u);
    setMenu(null);
    const pos = before.length + inserted.length;
    setTimeout(() => { const el = ref.current; if (el) { el.focus({ preventScroll: true }); el.setSelectionRange(pos, pos); } }, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); p.onSubmit(); return; }
    if (!menu) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, Math.max(items.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && items[sel]) { e.preventDefault(); pick(items[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(null); }
  };

  const muted = isDark ? 'text-white/40' : 'text-black/40';
  return (
    <div className="relative">
      <textarea ref={ref} value={p.value} rows={p.rows} autoFocus={p.autoFocus} placeholder={p.placeholder}
        onChange={e => { p.onChange(e.target.value); requestAnimationFrame(detect); }}
        onKeyDown={onKeyDown} onKeyUp={e => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) detect(); }}
        onClick={detect} onBlur={() => setTimeout(() => setMenu(null), 150)}
        className={p.className} />
      {menu && (items.length > 0 || remoteBusy || menu.query.length > 0) && (
        <div className={`absolute left-0 right-0 top-full mt-1 z-20 rounded border shadow-lg overflow-hidden ${isDark ? 'bg-neutral-900 border-white/15' : 'bg-white border-black/15'}`}>
          {items.map((u, i) => (
            <button key={u.email} type="button" onMouseDown={e => { e.preventDefault(); pick(u); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-[11px] ${i === sel ? (isDark ? 'bg-white/10' : 'bg-black/5') : ''}`}>
              <span className={`inline-flex items-center justify-center min-w-[26px] h-5 px-1.5 rounded-full text-[10px] font-bold border ${isDark ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-300'}`}>{p.initialsFor(u)}</span>
              <span className={`truncate ${isDark ? 'text-white/85' : 'text-black/85'}`}>{u.name}</span>
              <span className={`truncate ml-auto text-[10px] ${muted}`}>{u.email}</span>
            </button>
          ))}
          {items.length === 0 && !remoteBusy && (
            <p className={`px-2 py-1.5 text-[10px] ${muted}`}>{menu.query.length < 2 ? 'Weitertippen — Name oder E-Mail' : 'Niemand gefunden'}</p>
          )}
          {remoteBusy && <p className={`px-2 py-1 text-[10px] flex items-center gap-1 ${muted}`}><AtSign size={9} /> Entra durchsuchen …</p>}
        </div>
      )}
    </div>
  );
}

interface PanelProps {
  isDark: boolean;
  comments: Comment[];
  users: DirectoryUser[];                 // bekannte Personen (users.json + Kommentar-Autoren)
  searchUsers: (q: string) => Promise<DirectorySearchResult>;
  onDirectoryProblem: (r: Extract<DirectorySearchResult, { ok: false }>) => void;
  initialsFor: (p: { name: string; email?: string }) => string; // eindeutige Kürzel (assignInitials)
  targets: CommentTargetInfo[]; // Reihenfolge = Schrittfolge (Dokumentreihenfolge)
  active: string | null;        // null = Übersicht
  showResolved: boolean;
  onToggleResolved: (v: boolean) => void;
  onSelect: (key: string | null) => void;
  onClose: () => void;
  canComment: boolean;                    // alle mit Zugriff, auch Viewer
  canDelete: (c: Comment) => boolean;     // eigene Kommentare; Reviewer/Admin alle
  author: CommentAuthor | null; // null = Name fehlt (nicht angemeldet und kein Name eingegeben)
  askName?: { value: string; onChange: (v: string) => void }; // ohne Anmeldung: Name manuell
  onAdd: (target: string, text: string, mentions: DirectoryUser[], parentId?: string) => Promise<boolean>;
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
  const [draftMentions, setDraftMentions] = useState<DirectoryUser[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyMentions, setReplyMentions] = useState<DirectoryUser[]>([]);
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const addMention = (set: React.Dispatch<React.SetStateAction<DirectoryUser[]>>) => (u: DirectoryUser) =>
    set(prev => prev.some(x => x.email.toLowerCase() === u.email.toLowerCase()) ? prev : [...prev, u]);
  // nur Erwähnungen, deren «@Name» noch im Text steht
  const effectiveMentions = (text: string, ms: DirectoryUser[]) => ms.filter(m => text.includes(`@${m.name}`)).map(({ name, email }) => ({ name, email }));

  // Stellenwechsel: Entwürfe verwerfen, neues Kommentarfeld fokussieren
  useEffect(() => { setDraft(''); setDraftMentions([]); setReplyTo(null); setReplyDraft(''); setReplyMentions([]); }, [active]);
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

  const submit = async (target: string, text: string, mentions: DirectoryUser[], parentId?: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const ok = await p.onAdd(target, t, effectiveMentions(t, mentions), parentId);
      if (ok) {
        if (parentId) { setReplyTo(null); setReplyDraft(''); setReplyMentions([]); } else { setDraft(''); setDraftMentions([]); }
      }
    } finally {
      setBusy(false);
    }
  };
  const mentionProps = {
    users: p.users, searchUsers: p.searchUsers, onDirectoryProblem: p.onDirectoryProblem, initialsFor: p.initialsFor, isDark,
    className: `w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y ${inputCls}`,
  };

  const nameField = p.askName && (
    <input value={p.askName.value} onChange={e => p.askName!.onChange(e.target.value)}
      placeholder="Dein Name (nicht angemeldet)"
      className={`w-full text-[11px] px-2 py-1 rounded border outline-none transition-colors ${inputCls} ${!p.askName.value.trim() ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
  );

  const commentRow = (c: Comment, isReply: boolean) => (
    <div key={c.id} className={`flex gap-2 ${isReply ? 'ml-5' : ''} ${c.resolved ? 'opacity-60' : ''}`}>
      {isReply ? <CornerDownRight size={12} className={`mt-1 flex-shrink-0 ${textMuted}`} /> : null}
      <AuthorChip author={c.author} initials={p.initialsFor(c.author)} isDark={isDark} />
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-2 text-[10px] ${textMuted}`}>
          <span className="truncate" title={c.author.name}>{c.author.name}</span>
          <span className="flex-shrink-0">{fmtTimestamp(c.createdAt)}</span>
          {/* Teams-Benachrichtigung: gesendet / noch ausstehend */}
          {(c.notified?.length ?? 0) > 0 && (
            <Send size={9} className={`flex-shrink-0 ${isDark ? 'text-emerald-400/80' : 'text-emerald-600'}`}
              aria-label="Teams-Nachricht gesendet" />
          )}
          {(c.notifyPending?.length ?? 0) > 0 && (
            <Clock size={9} className="flex-shrink-0 opacity-70" aria-label="Teams-Nachricht ausstehend" />
          )}
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
            {p.canComment && p.canDelete(c) && (
              <button type="button" title={isReply ? 'Antwort löschen' : 'Kommentar samt Antworten löschen'}
                className={`p-1 rounded transition-colors ${isDark ? 'text-white/30 hover:text-rose-400' : 'text-black/30 hover:text-rose-500'}`}
                onClick={() => { if (window.confirm(isReply ? 'Antwort endgültig löschen?' : 'Kommentar samt Antworten endgültig löschen?')) void p.onDelete(c.id); }}>
                <Trash2 size={11} />
              </button>
            )}
          </span>
        </div>
        <p className={`text-[11px] leading-relaxed whitespace-pre-wrap break-words mt-0.5 ${textBase}`}>{renderWithMentions(c.text, c.mentions, isDark)}</p>
        {c.resolved && (
          <p className={`text-[10px] mt-0.5 ${isDark ? 'text-emerald-400/80' : 'text-emerald-600'}`}>
            ✓ erledigt{c.resolvedBy ? ` von ${p.initialsFor(c.resolvedBy)}` : ''}{c.resolvedAt ? ` · ${fmtTimestamp(c.resolvedAt)}` : ''}
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
                <MentionTextarea {...mentionProps} value={replyDraft} onChange={setReplyDraft} onMention={addMention(setReplyMentions)}
                  onSubmit={() => void submit(target, replyDraft, replyMentions, r.id)} autoFocus rows={2}
                  placeholder="Antwort … (@ erwähnt jemanden, Ctrl/Cmd+Enter sendet)" />
                <div className="flex gap-1.5">
                  <button type="button" className={btnPrimary} disabled={busy || !replyDraft.trim() || !p.author}
                    onClick={() => void submit(target, replyDraft, replyMentions, r.id)}>Antworten</button>
                  <button type="button" className={btnGhost} onClick={() => { setReplyTo(null); setReplyDraft(''); setReplyMentions([]); }}>Abbrechen</button>
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
          <MentionTextarea {...mentionProps} textareaRef={draftRef} value={draft} onChange={setDraft} onMention={addMention(setDraftMentions)}
            onSubmit={() => void submit(active, draft, draftMentions)} rows={2}
            placeholder="Neuer Kommentar … (@ erwähnt jemanden, Ctrl/Cmd+Enter sendet)" />
          <div className="flex items-center gap-2">
            {p.author && <AuthorChip author={p.author} initials={p.initialsFor(p.author)} isDark={isDark} />}
            <span className={`text-[10px] truncate flex-1 ${textMuted}`}>{p.author?.name ?? 'Name eingeben'}</span>
            <button type="button" className={btnPrimary} disabled={busy || !draft.trim() || !p.author}
              onClick={() => void submit(active, draft, draftMentions)}>
              {busy ? 'Speichert …' : 'Kommentieren'}
            </button>
          </div>
        </div>
      )}
      {active && !p.canComment && (
        <div className={`px-3 py-2 border-t ${border} text-[10px] ${textMuted}`}>Nur lesen — Kommentieren ist hier nicht möglich.</div>
      )}
    </aside>
  );
}
