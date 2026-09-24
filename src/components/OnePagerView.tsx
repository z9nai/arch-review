import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ClipboardPaste, Copy, Download, ExternalLink, Eye, FileDown, FileUp, Info, Link2, Lock, Mail, MessageSquare, Minus, Pencil, Plus, Save, Trash2, Unlock, X } from 'lucide-react';
import { marked } from 'marked';
import { DirectorySearchResult, lockValid, ProjectLock, useStore } from '../store';
import { useAuth, usePermissions } from '../auth';
import { Comment, CommentAuthor, DirectoryUser, MILESTONES, MILESTONE_INFO, MILESTONE_TITLES, Project, Question, QuestionAnswer, Review, SourceFile, Theme } from '../types';
import { assignInitials, authorOf, CommentBubble, CommentsPanel, CommentTargetInfo, countsOf, initialsOf, personKey } from './Comments';
import { blockingChecks, checkState, deriveStatus, emptyReview, getMilestoneReview, getThemeReview, STATUS_META } from '../status';
import { applyMs10, extractPdfText, hasMs10Data, Ms10Data, MS10_FIELD_LABELS, parseMs10Text } from '../ms10';
import { DEFAULT_MODEL } from '../defaultModel';
import { autoGrow, fmtTimestamp, formatBytes, normalizeUrl, nowIsoWithTimezone, sanitizeFilename } from '../util';

const FOUNDATION_MS = MILESTONES[0]; // M10
const COMMENT_NAME_KEY = 'arch-review.commentName'; // Name für Kommentare ohne Anmeldung (pro Browser)
// Warnung «Entra-Suche nicht möglich» nur einmal pro Sitzung zeigen
let directoryWarned = false;

// Standard-Vorlage für die Übergabe an die Fachstelle; im Admin
// überschreibbar (model.handover). Platzhalter siehe Model.handover in types.ts.
export const DEFAULT_HANDOVER_SUBJECT = 'Architekturprüfung «{{projekt}}» — {{pruefungen}} für {{ms}}';
export const DEFAULT_HANDOVER_BODY = `{{anrede}}

Für das Projekt «{{projekt}}» bitte ich um {{pruefungen}} zum Meilenstein {{meilenstein}}.

{{einschaetzung}}

{{projektblock}}

{{ausloeser}}

{{ausgangslage}}

Ich bitte um Rückmeldung bis {{termin}} — Ergebnis und allfällige Auflagen trage ich in die Architekturprüfung ein.

Vielen Dank!`;

function StatusBadge({ status, isDark }: { status: keyof typeof STATUS_META; isDark: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${isDark ? meta.dark : meta.light}`}>
      {meta.label}
    </span>
  );
}

// Themen-Nummerierung A–Z aus der Reihenfolge
export function themeLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export default function OnePagerView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { isDark, model, loadProject, saveProject, acquireLock, renewLock, releaseLock, readLock, sessionId,
    uploadSourceFile, downloadSourceFile, deleteSourceFile, loadComments, updateComments,
    knownUsers, searchDirectory, requestDirectoryConsent } = useStore();
  const { user: authUser } = useAuth();
  const { canEdit, canView } = usePermissions();
  // Bearbeitungssperre: 'mine' = ich halte sie; 'held' = jemand anderes;
  // 'free' = war fremd gesperrt, ist jetzt frei (Bearbeiten anbieten)
  const [lockState, setLockState] = useState<{ kind: 'mine' } | { kind: 'held'; lock: ProjectLock } | { kind: 'free' } | null>(null);
  const lockedByOther = lockState?.kind === 'held' || lockState?.kind === 'free';
  const ro = !canEdit || lockedByOther; // Viewer oder fremd gesperrt: nur lesen, keine Speicherung
  const [proj, setProj] = useState<Project | null>(null);
  const [baseline, setBaseline] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [toast, setToast] = useState('');
  const [importData, setImportData] = useState<Ms10Data | null>(null);
  const [infoTheme, setInfoTheme] = useState<Theme | null>(null);
  const [infoQuestion, setInfoQuestion] = useState<Question | null>(null);
  const [showClassInfo, setShowClassInfo] = useState(false);
  const [exportMs, setExportMs] = useState<string | null>(null);
  const [exportHandover, setExportHandover] = useState(false); // true = Übergabetext an die Fachstelle statt offene Fragen des Meilensteins
  const [copiedKey, setCopiedKey] = useState<string | null>(null); // welcher Kopieren-Button zuletzt Erfolg hatte
  const [handoverDeadline, setHandoverDeadline] = useState('');
  const [answersMs, setAnswersMs] = useState<string | null>(null);
  const [answersText, setAnswersText] = useState('');
  const [answersPdfItems, setAnswersPdfItems] = useState<ImportItem[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // "M10:themeId"
  const [openRemarks, setOpenRemarks] = useState<Set<string>>(new Set()); // "themeId:frageId"
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<HTMLInputElement>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUrl, setEditUrl] = useState('');
  // Kommentare (Sidecar-Datei, unabhängig von Sperre und Autosave)
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<string | null>(null); // null = Übersicht
  const [showResolved, setShowResolved] = useState(false);
  const [commentName, setCommentName] = useState(() => { try { return localStorage.getItem(COMMENT_NAME_KEY) ?? ''; } catch { return ''; } });
  const [directoryWarning, setDirectoryWarning] = useState<Extract<DirectorySearchResult, { ok: false }> | null>(null);
  const syncRef = useRef<(p: Project) => Project>(p => p);
  // Harte Absicherung gegen ein bereits laufendes Autosave, das erst
  // NACH dem Verlassen des Projekts abschliesst (Timer bereits ausgeloest,
  // Schreibvorgang noch nicht: dann darf er die Datei nicht mehr anfassen).
  const mountedRef = useRef(true);
  useEffect(() => {
    // Setup-Zweig noetig, nicht nur Cleanup: React 18 StrictMode fuehrt
    // Effekte im Dev-Modus doppelt aus (mount -> cleanup -> mount) und
    // wuerde sonst den Ref dauerhaft auf false stehen lassen.
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const border = isDark ? 'border-white/8' : 'border-black/8';
  const textMuted = isDark ? 'text-white/30' : 'text-black/30';
  const labelCls = isDark ? 'text-white/40' : 'text-black/40';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30'
    : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30';
  const cardCls = `rounded-xl border ${border} ${isDark ? 'bg-white/2' : 'bg-black/2'}`;

  const reload = useCallback(async () => {
    const res = await loadProject(slug);
    if (!res) { setNotFound(true); return; }
    // Abgeleitete Werte gleich nachziehen; weicht das Ergebnis ab,
    // schreibt der Autosave die migrierte Fassung
    setProj(syncRef.current(res.data));
    setBaseline(JSON.stringify(res.data));
    setVersion(res.version);
    setNotFound(false);
    setConflict(false);
  }, [loadProject, slug]);

  useEffect(() => { reload(); }, [reload]);

  const dirty = proj != null && JSON.stringify(proj) !== baseline;

  // ── Bearbeitungssperre ────────────────────────────────────────────────────
  const lastRenewRef = useRef(0);
  const tryAcquire = useCallback(async (force = false) => {
    const r = await acquireLock(slug, force);
    if (r.status === 'acquired') { setLockState({ kind: 'mine' }); lastRenewRef.current = Date.now(); }
    else if (r.status === 'held') setLockState({ kind: 'held', lock: r.lock });
    else setLockState(prev => prev ?? { kind: 'mine' }); // Fehler beim Sperren: nicht blockieren, ETag schützt
    return r;
  }, [acquireLock, slug]);

  // Beim Öffnen sperren (nur wer bearbeiten darf)
  useEffect(() => {
    if (!canEdit || !proj) return;
    if (lockState !== null) return;
    void tryAcquire(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, proj != null]);

  // Verlängern bei Aktivität (höchstens einmal pro Minute): Sperre gilt bis
  // letzte Änderung + 5 Minuten
  useEffect(() => {
    if (!dirty || lockState?.kind !== 'mine') return;
    if (Date.now() - lastRenewRef.current < 60_000) return;
    lastRenewRef.current = Date.now();
    renewLock(slug).then(r => {
      if (r.status === 'held') setLockState({ kind: 'held', lock: r.lock }); // jemand hat übernommen
    });
  }, [proj, dirty, lockState, renewLock, slug]);

  // Prüfen: fremd gesperrt → alle 15 s Sperre + neueste Version; eigene
  // Sperre → alle 45 s, ob sie übernommen wurde. Sofort bei Tab-Fokus.
  const checkRef = useRef<() => Promise<void>>(async () => {});
  checkRef.current = async () => {
    if (!lockState) return;
    const l = await readLock(slug);
    if (lockState.kind === 'mine') {
      if (lockValid(l) && l.session !== sessionId) setLockState({ kind: 'held', lock: l });
      return;
    }
    // fremd gesperrt / frei: Sperre aktualisieren und neueste Version laden
    if (lockValid(l) && l.session !== sessionId) setLockState({ kind: 'held', lock: l });
    else setLockState({ kind: 'free' });
    const res = await loadProject(slug);
    if (res && res.version !== version) {
      setProj(syncRef.current(res.data));
      setBaseline(JSON.stringify(res.data));
      setVersion(res.version);
    }
  };
  useEffect(() => {
    if (!lockState) return;
    const every = lockState.kind === 'mine' ? 45_000 : 15_000;
    const t = setInterval(() => { void checkRef.current(); }, every);
    const onVis = () => { if (document.visibilityState === 'visible') void checkRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [lockState?.kind]);

  // Freigabe beim Verlassen (Tab schliessen/neu laden: best effort per keepalive)
  const lockMineRef = useRef(false);
  lockMineRef.current = lockState?.kind === 'mine';
  useEffect(() => {
    const h = () => { if (lockMineRef.current) void releaseLock(slug, true); };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, [releaseLock, slug]);

  useEffect(() => {
    if (!dirty || ro) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const back = async () => {
    if (dirty && !ro) {
      const res = await saveRef.current();
      if (res !== 'saved') return;
    }
    if (lockState?.kind === 'mine') await releaseLock(slug);
    onBack();
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

  // ── Kommentare ────────────────────────────────────────────────────────────
  // Laden beim Öffnen; danach alle 30 s und bei Tab-Fokus nachziehen (andere
  // Personen kommentieren unabhängig von der Bearbeitungssperre).
  useEffect(() => {
    let alive = true;
    const pull = async () => { const c = await loadComments(slug); if (alive) setComments(c); };
    void pull();
    const t = setInterval(() => { void pull(); }, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') void pull(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [loadComments, slug]);

  // Autor/in: angemeldete Person (Kürzel + mailto), sonst der manuell
  // eingegebene Name (ohne Anmeldung, z. B. lokaler Ordner)
  // Eindeutige Kürzel: Wer zuerst kommentiert hat, behält das kurze Kürzel;
  // Namensgleiche danach bekommen einen Buchstaben mehr (PM › PME › PMEN).
  // Reihenfolge: Kommentar-Autoren chronologisch, dann users.json, dann ich.
  const me = authUser ? { name: authUser.name, email: authUser.email } : commentName.trim() ? { name: commentName.trim() } : null;
  const initialsMap = assignInitials([
    ...[...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(c => c.author),
    ...knownUsers,
    ...(me ? [me] : []),
  ]);
  const initialsFor = (p: { name: string; email?: string }) => initialsMap.get(personKey(p)) ?? initialsOf(p.name);
  const commentAuthor: CommentAuthor | null = me ? authorOf(me.name, me.email, initialsFor(me)) : null;
  const setCommentNameStored = (v: string) => {
    setCommentName(v);
    try { localStorage.setItem(COMMENT_NAME_KEY, v); } catch { /* ignore */ }
  };

  const mutateComments = async (fn: (prev: Comment[]) => Comment[]): Promise<boolean> => {
    const res = await updateComments(slug, fn);
    if (!res.ok) { showToast(res.message); return false; }
    setComments(res.comments);
    return true;
  };
  const addComment = (target: string, text: string, mentions: DirectoryUser[], parentId?: string) => {
    if (!commentAuthor) { showToast('Bitte zuerst einen Namen eingeben.'); return Promise.resolve(false); }
    const c: Comment = {
      id: 'c' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4),
      target, text, author: commentAuthor, createdAt: nowIsoWithTimezone(),
      ...(parentId ? { parentId } : {}),
      ...(mentions.length ? { mentions } : {}),
    };
    return mutateComments(prev => [...prev, c]);
  };

  // Personen für «@»: users.json (alle, die sich hier angemeldet haben) plus
  // Kommentar-Autoren mit E-Mail plus die eigene Person — ohne Duplikate
  const mentionUsers: DirectoryUser[] = (() => {
    const seen = new Set<string>();
    const out: DirectoryUser[] = [];
    const add = (u: { name: string; email?: string }) => {
      const key = (u.email ?? '').toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ name: u.name, email: u.email! });
    };
    knownUsers.forEach(add);
    if (commentAuthor) add(commentAuthor);
    comments.forEach(c => add(c.author));
    return out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  })();
  // Entra-Suche nicht möglich: einmal pro Sitzung erklären (Zustimmung
  // nachholen oder Admin-Hinweis); bekannte Personen bleiben wählbar
  const onDirectoryProblem = (r: Extract<DirectorySearchResult, { ok: false }>) => {
    if (r.reason === 'noLogin' || directoryWarned) return;
    directoryWarned = true;
    setDirectoryWarning(r);
  };
  const resolveComment = async (id: string, resolved: boolean) => {
    await mutateComments(prev => prev.map(c => c.id !== id ? c : resolved
      ? { ...c, resolved: true, resolvedAt: nowIsoWithTimezone(), ...(commentAuthor ? { resolvedBy: commentAuthor } : {}) }
      : (({ resolved: _r, resolvedAt: _a, resolvedBy: _b, ...rest }) => rest)(c)));
  };
  const deleteComment = async (id: string) => {
    await mutateComments(prev => prev.filter(c => c.id !== id && c.parentId !== id));
  };

  // Stelle im Panel öffnen: Thema aufklappen (falls Frage) und hinscrollen
  const openCommentTarget = (key: string | null) => {
    if (key?.startsWith('q:')) {
      const [, themeId, qId] = key.split(':');
      const q = allQuestions.find(x => x.id === qId && x.themeId === themeId);
      if (q) setExpanded(prev => new Set(prev).add(`${q.milestone}:${themeId}`));
    }
    setCommentTarget(key);
    setCommentsOpen(true);
  };
  // Aktive Stelle vertikal in die Mitte des Scrollbereichs holen. Bewusst
  // selbst gerechnet statt scrollIntoView: der Scrollbereich ist der
  // Hauptbereich der App (nicht das Fenster), und nach dem Aufklappen eines
  // Themas muss das Layout erst stehen (zwei Frames warten).
  useEffect(() => {
    if (!commentsOpen || !commentTarget) return;
    let id2 = 0;
    const id = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-comment-target="${CSS.escape(commentTarget)}"]`);
        if (!el) return;
        let sc: HTMLElement | null = el.parentElement;
        while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
        const er = el.getBoundingClientRect();
        if (!sc) { window.scrollBy({ top: er.top + er.height / 2 - window.innerHeight / 2, behavior: 'smooth' }); return; }
        const cr = sc.getBoundingClientRect();
        sc.scrollTo({ top: sc.scrollTop + (er.top + er.height / 2) - (cr.top + cr.height / 2), behavior: 'smooth' });
      });
    });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); };
  }, [commentsOpen, commentTarget]);

  // Sprechblase an einer Stelle
  const bubble = (key: string) => {
    const c = countsOf(comments, key);
    const active = commentsOpen && commentTarget === key;
    return <CommentBubble open={c.open} resolved={c.resolved} active={active} isDark={isDark}
      onClick={() => (active ? setCommentsOpen(false) : openCommentTarget(key))} />;
  };
  const anchorCls = (key: string) => commentsOpen && commentTarget === key
    ? (isDark ? 'rounded-md ring-1 ring-blue-400/50 bg-blue-500/5 -mx-2 px-2 py-1' : 'rounded-md ring-1 ring-blue-400/60 bg-blue-50/60 -mx-2 px-2 py-1')
    : '';

  const setField = <K extends keyof Project>(k: K, v: Project[K]) =>
    setProj(p => (p ? { ...p, [k]: v } : p));

  // ── Quellen: Belege/Referenzdokumente hoch-/herunterladen ─────────────────
  // Gespeichert unter projects/<slug>/sources/<id>-<dateiname>; die Metadaten
  // (proj.sources) laufen wie jedes andere Feld über das normale Autosave.
  const storedNameOf = (s: { id: string; filename: string }) => `${s.id}-${sanitizeFilename(s.filename)}`;

  // Mehrere Dateien auf einmal: bei genau einer Datei zählt das getippte
  // Label, sonst dient je Datei ihr eigener Dateiname als Label (der
  // Beschrieb gilt für alle gemeinsam, z. B. «Nachweise aus dem Kickoff»).
  const addSources = async (files: FileList | File[]) => {
    if (!proj || ro) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setSourceBusy(true);
    try {
      const newEntries: SourceFile[] = [];
      for (const file of list) {
        const id = 'src' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4) + newEntries.length;
        const res = await uploadSourceFile(proj.slug, storedNameOf({ id, filename: file.name }), file);
        if (!res.ok) { showToast(`«${file.name}» fehlgeschlagen: ${res.message}`); continue; }
        newEntries.push({
          id, label: list.length === 1 ? (sourceLabel.trim() || file.name) : file.name,
          ...(sourceDescription.trim() ? { description: sourceDescription.trim() } : {}),
          filename: file.name, size: file.size,
          ...(file.type ? { contentType: file.type } : {}),
          uploadedAt: nowIsoWithTimezone(),
          ...(authUser?.name ? { uploadedBy: authUser.name } : {}),
        });
      }
      if (newEntries.length > 0) setProj(p => p ? { ...p, sources: [...(p.sources ?? []), ...newEntries] } : p);
      setSourceLabel(''); setSourceDescription('');
    } finally {
      setSourceBusy(false);
    }
  };

  // Web-Referenz statt Datei-Upload: nur Label/Beschrieb/URL, kein Blob.
  const addWebSource = () => {
    if (!proj || ro) return;
    const label = sourceLabel.trim();
    const url = sourceUrl.trim();
    if (!label || !url) return;
    const entry: SourceFile = {
      id: 'src' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4),
      label, url: normalizeUrl(url),
      ...(sourceDescription.trim() ? { description: sourceDescription.trim() } : {}),
      uploadedAt: nowIsoWithTimezone(),
      ...(authUser?.name ? { uploadedBy: authUser.name } : {}),
    };
    setProj(p => p ? { ...p, sources: [...(p.sources ?? []), entry] } : p);
    setSourceLabel(''); setSourceDescription(''); setSourceUrl('');
  };

  const removeSource = async (source: SourceFile) => {
    if (!proj || ro) return;
    if (!window.confirm(`«${source.label}» endgültig entfernen?`)) return;
    const filename = source.filename;
    if (filename) await deleteSourceFile(proj.slug, storedNameOf({ id: source.id, filename }));
    setProj(p => p ? { ...p, sources: (p.sources ?? []).filter(s => s.id !== source.id) } : p);
  };

  // Nur Metadaten (Label/Beschrieb/URL) bearbeiten — Datei bleibt unverändert
  const startEditSource = (s: SourceFile) => {
    setEditingSourceId(s.id); setEditLabel(s.label); setEditDescription(s.description ?? ''); setEditUrl(s.url ?? '');
  };
  const saveEditSource = () => {
    if (!proj || !editingSourceId) return;
    const label = editLabel.trim();
    if (!label) return;
    const isWebRef = (proj.sources ?? []).find(s => s.id === editingSourceId)?.url !== undefined;
    if (isWebRef && !editUrl.trim()) return;
    setProj(p => p ? {
      ...p,
      sources: (p.sources ?? []).map(s => s.id === editingSourceId
        ? { ...s, label, description: editDescription.trim() || undefined, ...(isWebRef ? { url: normalizeUrl(editUrl) } : {}) }
        : s),
    } : p);
    setEditingSourceId(null);
  };

  const downloadSource = async (source: SourceFile) => {
    if (!proj) return;
    if (source.url) { window.open(source.url, '_blank', 'noopener,noreferrer'); return; }
    const filename = source.filename;
    if (!filename) return;
    const blob = await downloadSourceFile(proj.slug, storedNameOf({ id: source.id, filename }));
    if (!blob) { showToast('Datei konnte nicht geladen werden.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // ── Stammdaten-Zugriffe ───────────────────────────────────────────────────
  const themes = model?.themes?.length ? model.themes : DEFAULT_MODEL.themes;
  const allQuestions = model?.questions?.length ? model.questions : DEFAULT_MODEL.questions;
  // Themen-Buchstabe für die Fragenummerierung (M10A1 …) — siehe themeLetter.
  const themeLetterOf = (themeId: string): string => {
    const ti = themes.findIndex(t => t.id === themeId);
    return ti >= 0 ? themeLetter(ti) : 'X';
  };

  // Gilt die Frage für die Klassifikation des Projekts? (kumulativ nach
  // Reihenfolge, z. B. «ab wegweisend»; ohne minClassification oder solange
  // keine Klassifikation gewählt ist, gilt sie immer). M10-Fragen werden nie
  // gefiltert — die müssen alle ausfüllen, die Klassifikation ist ja gerade
  // deren Ergebnis.
  const classOk = (p: Project, q: Question): boolean => {
    if (q.milestone === FOUNDATION_MS) return true;
    if (!q.minClassification || !p.classification || !model) return true;
    const order = model.classifications.map(c => c.id);
    return order.indexOf(p.classification) >= order.indexOf(q.minClassification);
  };

  // Nummer einer beliebigen Frage (gleiche Regel wie questionsAt, ohne Filter)
  const numberOfQuestion = (q: Question): string => {
    const i = allQuestions.filter(x => x.themeId === q.themeId && x.milestone === q.milestone).findIndex(x => x.id === q.id);
    return `${q.milestone}${themeLetterOf(q.themeId)}${i + 1}`;
  };

  // Hat das Projekt zu dieser Frage schon etwas erfasst? (Ja/Nein, Auswahl
  // oder Bemerkung) — entscheidet, ob eine archivierte Frage noch gezeigt wird.
  const hasAnswer = (p: Project, themeId: string, q: Question): boolean => {
    const a = p.reviews?.[themeId]?.answers?.[q.id];
    return !!a && (a.value !== null || !!a.choice || (a.remarks ?? '').trim() !== '');
  };

  // Fragen eines Themas in einem Meilenstein, mit automatischer Nummer M10A1 …
  // Der Buchstabe ist der Themen-Buchstabe (siehe themeLetter), damit die
  // Nummer über alle Themen hinweg eindeutig bleibt. Die Nummern werden über
  // den vollen Katalog vergeben und bleiben damit stabil, auch wenn die
  // Klassifikation einzelne Fragen ausblendet oder Fragen archiviert sind
  // (Lücken). Archivierte Fragen erscheinen nur noch dort, wo bereits eine
  // Antwort existiert — schreibgeschützt (siehe questionBlock).
  const questionsAt = (themeId: string, ms: string, p: Project | null = proj): { q: Question; number: string }[] => {
    const letter = themeLetterOf(themeId);
    return allQuestions
      .filter(q => q.themeId === themeId && q.milestone === ms)
      .map((q, i) => ({ q, number: `${ms}${letter}${i + 1}` }))
      .filter(({ q }) => q.enabled !== false && (!p || classOk(p, q)))
      .filter(({ q }) => !q.archived || (!!p && hasAnswer(p, themeId, q)));
  };

  // Thema relevant, abgeleitet aus den M10-Fragen:
  // eine Frage offen → Offen; eine mit Ja → Ja; sonst Nein.
  // undefined = keine M10-Fragen vorhanden.
  const deriveTheme = (p: Project, themeId: string, ms: string): boolean | null | undefined => {
    const qs = questionsAt(themeId, ms, p).filter(({ q }) => (q.kind ?? 'yesNo') === 'yesNo');
    if (!qs.length) return undefined;
    const answers = getThemeReview(p, themeId).answers ?? {};
    const vals = qs.map(({ q }) => answers[q.id]?.value ?? null);
    if (vals.some(v => v === null)) return null;
    return vals.some(v => v === true);
  };

  const derivedRelevant = (p: Project, themeId: string) => deriveTheme(p, themeId, FOUNDATION_MS);

  // Abgeleitete Werte in den Projektzustand übernehmen (Thema-Relevanz und
  // «Architekturrelevant»); so bleiben Datei und Statusableitung konsistent.
  const syncDerived = (p: Project): Project => {
    const reviews = { ...p.reviews };
    const rels: (boolean | null)[] = [];
    for (const theme of themes) {
      const rel = deriveTheme(p, theme.id, FOUNDATION_MS);
      if (rel === undefined) continue;
      reviews[theme.id] = { ...emptyReview(), ...(reviews[theme.id] ?? {}), relevant: rel };
      rels.push(rel);
    }
    const arch = rels.length === 0
      ? p.architectureRelevant
      : rels.some(v => v === null) ? null : rels.some(v => v === true);
    // Klassifikation: «alles Nein» setzt automatisch die erste Stufe
    // (nicht relevant); sonst bleibt die Wahl des Architekten bestehen,
    // der Auto-Wert wird aber zurückgenommen.
    const firstClass = model?.classifications[0]?.id ?? null;
    let classification = p.classification ?? null;
    if (arch === false) classification = firstClass;
    else if (classification !== null && classification === firstClass) classification = null;
    return { ...p, reviews, architectureRelevant: arch, classification };
  };
  syncRef.current = syncDerived;

  // ── Änderungen ────────────────────────────────────────────────────────────
  const updateAnswer = (themeId: string, questionId: string, patch: Partial<QuestionAnswer>) =>
    setProj(p => {
      if (!p) return p;
      const review = getThemeReview(p, themeId);
      const answers = { ...(review.answers ?? {}) };
      const existing: QuestionAnswer = answers[questionId] ?? { value: null, remarks: '' };
      answers[questionId] = { ...existing, ...patch };
      return syncDerived({ ...p, reviews: { ...p.reviews, [themeId]: { ...review, answers } } });
    });

  const updateMilestoneReview = (ms: string, patch: Partial<Review>) =>
    setProj(p => {
      if (!p) return p;
      const merged = { ...getMilestoneReview(p, ms), ...patch };
      return { ...p, reviews: { ...p.reviews, [ms.toLowerCase()]: merged } };
    });

  const toggleRemarks = (key: string, open: boolean) =>
    setOpenRemarks(prev => {
      const next = new Set(prev);
      if (open) next.add(key); else next.delete(key);
      return next;
    });

  // ── Speichern (Autosave) ──────────────────────────────────────────────────
  const save = async (force = false): Promise<'saved' | 'conflict' | 'error' | 'skipped'> => {
    if (ro) return 'skipped';
    if (!proj || savingRef.current) return 'skipped';
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const data: Project = { ...proj, updatedAt: nowIsoWithTimezone() };
      // Nichts mehr synchron passiert seit dem Timer-Feuern/Aufruf oben —
      // dieser Check ist daher race-frei gegenueber einem Unmount.
      if (!mountedRef.current) return 'skipped';
      const res = await saveProject(data, force ? null : version);
      if (res.status === 'saved') {
        setProj(data);
        setBaseline(JSON.stringify(data));
        setVersion(res.version);
        setConflict(false);
        const d = new Date();
        setLastSavedAt(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        return 'saved';
      }
      if (res.status === 'conflict') { setConflict(true); return 'conflict'; }
      setSaveError(res.message);
      return 'error';
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!dirty || ro || conflict || saveError || saving) return;
    const t = setTimeout(() => { saveRef.current(); }, 1200);
    return () => clearTimeout(t);
  }, [proj, dirty, conflict, saveError, saving]);

  // ── MS10-Import ───────────────────────────────────────────────────────────
  const pickMs10 = async (file: File) => {
    try {
      const data = parseMs10Text(await extractPdfText(await file.arrayBuffer()));
      if (!hasMs10Data(data)) { showToast('Im PDF wurden keine MS10-Felder gefunden.'); return; }
      setImportData(data);
    } catch (e) {
      console.error('[arch-review] pickMs10:', e);
      showToast('PDF konnte nicht gelesen werden.');
    }
  };

  const applyImport = () => {
    if (!importData || !proj || !model) return;
    setProj(applyMs10(proj, importData));
    setImportData(null);
    showToast('MS10-Felder übernommen.');
  };

  if (notFound) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button onClick={onBack} className={`flex items-center gap-1.5 text-xs mb-4 ${textMuted} hover:opacity-70`}>
          <ArrowLeft size={12} /> Zurück zur Projektliste
        </button>
        <p className={`text-sm ${textMuted}`}>Projekt «{slug}» wurde nicht gefunden.</p>
      </div>
    );
  }
  if (!proj || !model) {
    return <div className={`p-6 text-xs ${textMuted}`}>Lade Projekt …</div>;
  }

  const status = deriveStatus(proj);

  // ── Bausteine ─────────────────────────────────────────────────────────────
  const derivedChip = (value: boolean | null) => {
    const label = value === true ? 'Ja' : value === false ? 'Nein' : 'Offen';
    const cls = value === true
      ? isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-300'
      : value === false
        ? isDark ? 'bg-white/8 text-white/50 border-white/15' : 'bg-black/5 text-black/50 border-black/15'
        : isDark ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-300';
    return <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>{label}</span>;
  };

  // Eine Prüffrage mit automatischer Nummer, Ja/Nein-Checkboxen und Bemerkungen
  const questionBlock = (themeId: string, question: Question, number: string, disabledIn: boolean) => {
    // archiviert: nur noch lesbar — die bestehende Antwort bleibt als Nachweis stehen
    const disabled = disabledIn || ro || question.archived === true;
    const r = getThemeReview(proj, themeId);
    const answer: QuestionAnswer = { value: null, remarks: '', ...r.answers?.[question.id] };
    const remarksKey = `${themeId}:${question.id}`;
    const remarksOpen = answer.remarks.trim() !== '' || openRemarks.has(remarksKey) || question.remarksAlwaysOpen === true;
    const commentKey = `q:${themeId}:${question.id}`;
    return (
      <div key={question.id} data-comment-target={commentKey} className={`transition-colors ${question.archived ? 'opacity-70' : ''} ${anchorCls(commentKey)}`}>
        <p className={`text-[11px] font-semibold flex items-start gap-1 ${isDark ? 'text-white/80' : 'text-black/80'}`}>
          <span>{number} {question.text}</span>
          {bubble(commentKey)}
          {question.archived && (
            <span title="Diese Frage wurde archiviert — sie wird in neuen Reviews nicht mehr gestellt; die erfasste Antwort bleibt als Nachweis erhalten."
              className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full border whitespace-nowrap font-normal flex-shrink-0 ${isDark ? 'bg-white/8 text-white/50 border-white/15' : 'bg-black/5 text-black/50 border-black/15'}`}>
              archiviert
            </span>
          )}
          {question.hint && (
            <button type="button" onClick={() => setInfoQuestion(question)} title="Erläuterung anzeigen"
              className={`p-0.5 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
              <Info size={11} />
            </button>
          )}
        </p>
        <div className={`text-[11px] mt-1 flex items-start gap-5 flex-wrap ${textMuted}`}>
          {(question.kind ?? 'yesNo') === 'yesNo' && (
            <>
              <label className={`flex items-center gap-1.5 ${disabled ? '' : 'cursor-pointer'}`}>
                <input type="checkbox" disabled={disabled} checked={answer.value === true}
                  onChange={() => updateAnswer(themeId, question.id, { value: answer.value === true ? null : true })}
                  className="accent-blue-500" />
                Ja
              </label>
              <label className={`flex items-center gap-1.5 ${disabled ? '' : 'cursor-pointer'}`}>
                <input type="checkbox" disabled={disabled} checked={answer.value === false}
                  onChange={() => updateAnswer(themeId, question.id, { value: answer.value === false ? null : false })}
                  className="accent-blue-500" />
                Nein
              </label>
            </>
          )}
          {question.kind === 'choice' && (
            <select value={answer.choice ?? ''} disabled={disabled}
              onChange={e => updateAnswer(themeId, question.id, { choice: e.target.value || undefined })}
              className={`text-[11px] px-2 py-1.5 rounded border outline-none transition-colors disabled:opacity-50 ${inputCls}`}>
              <option value="">– wählen –</option>
              {(question.options ?? []).filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {!remarksOpen ? (
            <button type="button" disabled={disabled}
              onClick={() => toggleRemarks(remarksKey, true)}
              className="hover:underline underline-offset-2 disabled:no-underline">
              {question.kind === 'text' ? 'Antwort / Bemerkungen …' : 'Bemerkungen …'}
            </button>
          ) : (
            <div className="flex-1 min-w-[220px]">
              <textarea value={answer.remarks} rows={2} autoFocus={!answer.remarks && !question.remarksAlwaysOpen} disabled={disabled}
                onChange={e => updateAnswer(themeId, question.id, { remarks: e.target.value })}
                onFocus={autoGrow} onInput={autoGrow}
                onBlur={() => { if (!answer.remarks.trim() && !question.remarksAlwaysOpen) toggleRemarks(remarksKey, false); }}
                placeholder={question.kind === 'text' ? 'Antwort / Bemerkungen' : 'Bemerkungen'}
                className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y transition-colors disabled:opacity-50 ${inputCls}`} />
            </div>
          )}
        </div>
        {(() => {
          // Quellen der Antwort: Tags aus den projektweiten Quellen (Quellen-Abschnitt
          // am Fusse der Seite) — unabhängig von der statischen «Quelle:»-Zeile unten,
          // die den Ursprung der Frage selbst angibt (Katalog/Prüfformular).
          const allSources = proj.sources ?? [];
          const selectedIds = answer.sources ?? [];
          if (allSources.length === 0 && selectedIds.length === 0) return null;
          const available = allSources.filter(s => !selectedIds.includes(s.id));
          return (
            <div className={`mt-1 flex items-center gap-1.5 flex-wrap text-[10px] ${textMuted}`}>
              <span className="flex-shrink-0">Quellen:</span>
              {selectedIds.length === 0 && disabled && <span>—</span>}
              {selectedIds.map(id => {
                const s = allSources.find(x => x.id === id);
                return (
                  <span key={id} title={s?.description}
                    className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border whitespace-nowrap ${isDark ? 'bg-white/8 border-white/15 text-white/70' : 'bg-black/5 border-black/15 text-black/70'}`}>
                    {s?.label ?? '(entfernte Quelle)'}
                    {!disabled && (
                      <button type="button" title="Quelle entfernen"
                        onClick={() => updateAnswer(themeId, question.id, { sources: selectedIds.filter(x => x !== id) })}
                        className={`rounded-full p-0.5 transition-colors ${isDark ? 'hover:text-rose-400' : 'hover:text-rose-500'}`}>
                        <X size={9} />
                      </button>
                    )}
                  </span>
                );
              })}
              {!disabled && available.length > 0 && (
                <details className="relative">
                  <summary title="Quellen auswählen"
                    className={`list-none [&::-webkit-details-marker]:hidden cursor-pointer text-[10px] px-1.5 py-0.5 rounded border outline-none transition-colors ${inputCls}`}>
                    + Quelle
                  </summary>
                  <div className={`absolute z-10 left-0 mt-1 min-w-[200px] max-h-48 overflow-y-auto rounded border shadow-lg p-1 ${isDark ? 'bg-neutral-900 border-white/15' : 'bg-white border-black/15'}`}>
                    {available.map(s => (
                      <label key={s.id}
                        className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] cursor-pointer ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
                        <input type="checkbox"
                          onChange={() => updateAnswer(themeId, question.id, { sources: [...selectedIds, s.id] })} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })()}
        <p className={`text-[10px] mt-0.5 ${textMuted}`}>
          Quelle Frage: {question.source ?? (model?.company ?? DEFAULT_MODEL.company ?? 'Eigene Firma')}
          {question.milestone !== FOUNDATION_MS && (
            <>
              {' · Klassifikation: '}
              {question.minClassification
                ? ((model?.classifications ?? DEFAULT_MODEL.classifications).find(c => c.id === question.minClassification)?.label ?? question.minClassification)
                : 'relevant'}
            </>
          )}
        </p>
      </div>
    );
  };

  // Fragenliste eines Meilensteins, je Thema aufklappbar. Ab M20 sind Themen,
  // die laut Foundation keinen Review brauchen (relevant = Nein), readonly.
  const questionSection = (ms: string) => (
    <div className="space-y-1">
      {themes.map((theme, ti) => {
        const qs = questionsAt(theme.id, ms);
        if (qs.length === 0) return null;
        const isFoundation = ms === FOUNDATION_MS;
        const notRelevant = !isFoundation && derivedRelevant(proj, theme.id) === false;
        const key = `${ms}:${theme.id}`;
        const isOpen = expanded.has(key);
        const answers = getThemeReview(proj, theme.id).answers ?? {};
        const yesNoQs = qs.filter(({ q }) => (q.kind ?? 'yesNo') === 'yesNo');
        const answered = yesNoQs.filter(({ q }) => (answers[q.id]?.value ?? null) !== null).length;
        const chip = notRelevant ? false : (deriveTheme(proj, theme.id, ms) ?? null);
        return (
          <div key={theme.id} className={notRelevant ? 'opacity-40' : ''}>
            <div className={`flex items-center gap-2 py-1 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
              {notRelevant ? (
                <span className="w-[19px] flex-shrink-0" />
              ) : (
                <button type="button"
                  onClick={() => setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  })}
                  title={isOpen ? 'Fragen zuklappen' : 'Fragen anzeigen'}
                  className={`p-0.5 rounded border flex-shrink-0 transition-colors ${isDark ? 'border-white/15 text-white/40 hover:text-white/80 hover:border-white/30' : 'border-black/15 text-black/40 hover:text-black/80 hover:border-black/30'}`}>
                  {isOpen ? <Minus size={10} /> : <Plus size={10} />}
                </button>
              )}
              <span className="text-xs font-semibold truncate">
                <span className={textMuted}>{themeLetter(ti)}</span> · {theme.title}
              </span>
              <button onClick={() => setInfoTheme(theme)} title={`Info zu «${theme.title}»`}
                className={`p-0.5 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <Info size={11} />
              </button>
              <span className={`text-[10px] ml-auto flex-shrink-0 ${textMuted}`}>
                {notRelevant ? 'kein Review nötig' : `${answered}/${yesNoQs.length} beantwortet`}
              </span>
              {derivedChip(chip)}
            </div>
            {isOpen && !notRelevant && (
              <div className={`ml-6 mb-3 rounded-lg border px-4 py-3 space-y-3 ${isDark ? 'border-white/10 bg-white/3' : 'border-black/10 bg-white'}`}>
                {qs.map(({ q, number }) => questionBlock(theme.id, q, number, false))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Gesamtstand eines Meilensteins über die relevanten Themen
  const milestoneOutcome = (ms: string): boolean | null => {
    const vals = themes
      .filter(t => questionsAt(t.id, ms).length > 0 && derivedRelevant(proj, t.id) !== false)
      .map(t => deriveTheme(proj, t.id, ms) ?? null);
    if (!vals.length || vals.some(v => v === null)) return null;
    return vals.some(v => v === true);
  };

  // Offene Fragen eines Meilensteins als E-Mail-Text (mit Ankreuzformat)
  const isQuestionOpen = (themeId: string, q: Question): boolean => {
    const a = getThemeReview(proj, themeId).answers?.[q.id];
    if ((q.kind ?? 'yesNo') === 'yesNo') return (a?.value ?? null) === null;
    if (q.kind === 'choice') return !(a?.choice);
    return !(a?.remarks ?? '').trim();
  };

  // In die Zwischenablage kopieren; writeText kann in restriktiven Umgebungen
  // hängen → Timeout, dann Fallback über ein verstecktes Textfeld.
  const copyToClipboard = async (value: string, key: string) => {
    let ok = false;
    try {
      await Promise.race([
        navigator.clipboard.writeText(value),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800)),
      ]);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 2000);
    } else {
      showToast('Kopieren fehlgeschlagen — Text markieren und mit Ctrl/Cmd+C kopieren.');
    }
  };

  // Markdown-Marker entfernen — Klartext-Fassung für Mailprogramme ohne HTML
  const stripMd = (md: string) => md.replace(/\*\*/g, '').replace(/ {2,}\n/g, '\n');

  // Als HTML kopieren, damit Fettschrift beim Einfügen in Outlook/Gmail bleibt;
  // Klartext fährt als Rückfallebene mit.
  const copyRich = async (md: string, key: string) => {
    const plain = stripMd(md);
    try {
      const html = marked.parse(md, { async: false }) as string;
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 2000);
    } catch {
      await copyToClipboard(plain, key);
    }
  };

  const buildExport = (ms: string): { text: string; count: number } => {
    const title = `${ms} · ${MILESTONE_TITLES[ms] ?? 'Prüfung'}`;
    const lines: string[] = [];
    let count = 0;
    lines.push(`Architekturprüfung «${proj.name || proj.slug}» — offene Fragen ${title}`);
    lines.push('');
    lines.push('Guten Tag');
    lines.push('');
    lines.push(`Für die Architekturprüfung sind im Meilenstein ${title} die folgenden Fragen noch offen.`);
    lines.push('Bitte direkt unter der jeweiligen Frage antworten ([X] ankreuzen bzw. Antwort ergänzen).');
    themes.forEach((theme, ti) => {
      const isFoundation = ms === FOUNDATION_MS;
      if (!isFoundation && derivedRelevant(proj, theme.id) === false) return;
      const qs = questionsAt(theme.id, ms).filter(({ q }) => isQuestionOpen(theme.id, q));
      if (!qs.length) return;
      lines.push('');
      lines.push(`${themeLetter(ti)} · ${theme.title}`);
      lines.push('-'.repeat(46));
      for (const { q, number } of qs) {
        lines.push('');
        lines.push(`${number} ${q.text}`);
        if (q.hint) lines.push(`(${q.hint})`);
        if ((q.kind ?? 'yesNo') === 'yesNo') {
          lines.push('[ ] Ja    [ ] Nein');
          lines.push('Bemerkung:');
        } else if (q.kind === 'choice') {
          lines.push(`Antwort (${(q.options ?? []).filter(Boolean).join(' / ')}):`);
          lines.push('Bemerkung:');
        } else {
          lines.push('Antwort / Bemerkung:');
        }
        count++;
      }
    });
    lines.push('');
    lines.push('Vielen Dank!');
    return { text: lines.join('\n'), count };
  };

  // Übergabe an eine Fachstelle (z. B. Security & Compliance): kurze
  // Übergabe an die Fachstelle: Auftrag für die erforderlichen Abnahme-
  // Kontrollpunkte des Meilensteins (z. B. FINMA-Prüfung) samt Einschätzung
  // Architektur und Bitte um Rückmeldung bis zu einem Termin. Empfänger je
  // Kontrollpunkt (handoverTo), Betreff/Text als Vorlage (model.handover,
  // Admin). Das Ergebnis trägt die Architektur manuell ein — deshalb kein
  // Ankreuzformat, kein Import.
  const buildHandoverExport = (ms: string, deadline: string): { to: string; subject: string; text: string } => {
    const required = requiredChecks(ms);
    // Bemerkungen ungekürzt; Absätze werden zu Zeilenumbrüchen («  \n» ist im
    // Markdown ein Umbruch, im Klartext schlicht eine neue Zeile).
    const full = (s: string) => s.trim().replace(/\s*\n\s*/g, '  \n');
    // Frage/Antwort über zwei Zeilen: «M10E2 Frage?» / «→ Ja — Bemerkung»
    const answerMd = (tid: string, q: Question): string => {
      const a = getThemeReview(proj, tid).answers?.[q.id];
      const kind = q.kind ?? 'yesNo';
      const head = kind === 'yesNo'
        ? (a?.value === true ? 'Ja' : a?.value === false ? 'Nein' : 'offen')
        : kind === 'choice' ? (a?.choice ?? 'offen') : (String(a?.remarks ?? '').trim() ? 'beantwortet' : 'offen');
      const rem = full(String(a?.remarks ?? '')).replace(/^(Ja|Nein)\s*[.:,—–-]\s*/i, (s, w) => (w.toLowerCase() === head.toLowerCase() ? '' : s));
      return `→ ${[`**${head}**`, rem].filter(Boolean).join(' — ')}`;
    };
    const ctxLine = (tid: string, q: Question) =>
      `**${numberOfQuestion(q)}** ${q.text}  \n${answerMd(tid, q)}`;
    const classLabel = model.classifications.find(c => c.id === proj.classification)?.label ?? 'noch nicht klassifiziert';
    const name = proj.name || proj.slug;

    const projektblock = [
      '**Projekt**',
      `- Klassifikation: ${classLabel}`,
      proj.description?.trim() ? `- Kurzbeschrieb: ${full(proj.description)}` : '',
      proj.responsibleProject?.trim() ? `- Verantwortlich Projekt: ${proj.responsibleProject.trim()}` : '',
      proj.responsibleArchitecture?.trim() ? `- Verantwortlich Architektur: ${proj.responsibleArchitecture.trim()}` : '',
    ].filter(Boolean).join('\n');
    // Auslöser: die im M10 mit Ja beantworteten Gate-Fragen — sie sagen der
    // Fachstelle, warum das Vorhaben überhaupt geprüft wird.
    const gates = themes.flatMap(t => questionsAt(t.id, FOUNDATION_MS)
      .filter(({ q }) => getThemeReview(proj, t.id).answers?.[q.id]?.value === true)
      .map(({ q }) => ctxLine(t.id, q)));
    const ausloeser = gates.length
      ? [`**Auslöser** (${FOUNDATION_MS} · ${MILESTONE_TITLES[FOUNDATION_MS] ?? ''})`, '', ...gates].join('\n\n')
      : '';
    const ctxQs = (model.handover?.context ?? []).map(id => allQuestions.find(q => q.id === id)).filter((q): q is Question => !!q);
    const ausgangslage = ctxQs.length
      ? ['**Ausgangslage aus der Architekturprüfung** (Kurzfassung — Details im Review-Bericht)', '', ...ctxQs.map(q => ctxLine(q.themeId, q))].join('\n\n')
      : '';
    // Der eigentliche Auftrag: die erforderlichen Prüfungen mit der
    // Einschätzung der Architektur.
    const einschaetzung = required.length
      ? ['**Prüfungen — Einschätzung Architektur**', ...required.map(({ check, state }) => {
          const a = String(state.assessment ?? '').trim();
          return `**${check.label}**  \n${a || '(noch keine Einschätzung erfasst)'}`;
        })].join('\n\n')
      : '';
    const pruefungen = required.map(({ check }) => check.label).join(' und ') || 'die Prüfung';
    // Anrede aus der Ansprechperson der Fachstelle: «Hallo Dominik»
    const firstName = (model.handover?.name ?? '').trim().split(/\s+/)[0];
    const anrede = firstName ? `Hallo ${firstName}` : 'Guten Tag';

    const vars: Record<string, string> = {
      projekt: name,
      slug: proj.slug,
      pruefungen,
      anrede,
      ms,
      meilenstein: `${ms} · ${MILESTONE_TITLES[ms] ?? 'Prüfung'}`,
      klassifikation: classLabel,
      termin: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline.split('-').reverse().join('.') : (deadline.trim() || '[Datum]'),
      projektblock, ausloeser, ausgangslage, einschaetzung,
    };
    const fill = (tpl: string) => tpl
      .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m))
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return {
      to: (model.handover?.to ?? '').trim(),
      subject: fill(model.handover?.subject?.trim() || DEFAULT_HANDOVER_SUBJECT),
      text: fill(model.handover?.body?.trim() || DEFAULT_HANDOVER_BODY),
    };
  };

  // Gleiche offenen Fragen als ausfüllbares PDF-Formular (pdf-lib, lazy)
  const downloadPdf = async (ms: string) => {
    const title = `${ms} · ${MILESTONE_TITLES[ms] ?? 'Prüfung'}`;
    const sections: { heading: string; questions: { fieldKey: string; number: string; text: string; hint?: string; kind: 'yesNo' | 'text' | 'choice'; options?: string[] }[] }[] = [];
    themes.forEach((theme, ti) => {
      if (ms !== FOUNDATION_MS && derivedRelevant(proj, theme.id) === false) return;
      const qs = questionsAt(theme.id, ms).filter(({ q }) => isQuestionOpen(theme.id, q));
      if (!qs.length) return;
      sections.push({
        heading: `${themeLetter(ti)} · ${theme.title}`,
        questions: qs.map(({ q, number }) => ({
          fieldKey: `${theme.id}::${q.id}`,
          number,
          text: q.text,
          hint: q.hint,
          kind: (q.kind ?? 'yesNo') as 'yesNo' | 'text' | 'choice',
          options: q.options,
        })),
      });
    });
    setPdfBusy(true);
    try {
      const { buildOpenQuestionsPdf } = await import('../pdfExport');
      const bytes = await buildOpenQuestionsPdf({
        projectName: proj.name || proj.slug,
        milestoneTitle: title,
        intro: [
          `Für die Architekturprüfung sind im Meilenstein ${title} die folgenden Fragen noch offen.`,
          'Bitte die Felder direkt im PDF ausfüllen und die Datei zurücksenden.',
        ],
        sections,
      });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `offene-fragen-${proj.slug}-${ms.toLowerCase()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      showToast('PDF konnte nicht erzeugt werden.');
    } finally {
      setPdfBusy(false);
    }
  };

  // Architektur-Review als Bericht-PDF: Status zuoberst, Details je
  // erreichtem Meilenstein; nicht erreichte Meilensteine mit Grund
  const downloadReviewPdf = async () => {
    const classRank = model.classifications.findIndex(c => c.id === proj.classification);
    const classLabel = model.classifications.find(c => c.id === proj.classification)?.label ?? null;
    const sourceLabelOf = (id: string) => (proj.sources ?? []).find(s => s.id === id)?.label ?? '(entfernte Quelle)';
    const answerOf = (themeId: string, q: Question): { answer: string; open: boolean; remarks?: string; sources?: string[] } => {
      const a = getThemeReview(proj, themeId).answers?.[q.id];
      const open = isQuestionOpen(themeId, q);
      const kind = q.kind ?? 'yesNo';
      const answer = kind === 'yesNo'
        ? (a?.value === true ? 'Ja' : a?.value === false ? 'Nein' : 'offen')
        : kind === 'choice'
          ? (a?.choice ?? 'offen')
          : (String(a?.remarks ?? '').trim() ? 'beantwortet' : 'offen');
      const remarks = String(a?.remarks ?? '').trim();
      const sources = (a?.sources ?? []).map(sourceLabelOf);
      return { answer, open, ...(remarks ? { remarks } : {}), ...(sources.length ? { sources } : {}) };
    };

    type Report = import('../pdfExport').ReviewReport;
    const milestones: Report['milestones'] = [];
    const skippedMs: string[] = [];
    let prevApproved = true;
    for (const ms of MILESTONES) {
      const title = `${ms} · ${MILESTONE_TITLES[ms] ?? 'Prüfung'}`;
      const isFoundation = ms === FOUNDATION_MS;
      if (!isFoundation && classRank < 1) {
        skippedMs.push(`${title} — entfällt: ${proj.architectureRelevant === false ? 'nicht architekturrelevant' : 'Klassifikation noch offen'}`);
        continue;
      }
      if (!prevApproved) {
        skippedMs.push(`${title} — folgt nach Freigabe des vorherigen Meilensteins`);
        continue;
      }
      const review = getMilestoneReview(proj, ms);
      const approved = review.approved === true;
      const themeRows: Report['milestones'][number]['themes'] = [];
      const skippedThemes: string[] = [];
      let openCount = 0;
      themes.forEach((theme, ti) => {
        const heading = `${themeLetter(ti)} · ${theme.title}`;
        if (!isFoundation && derivedRelevant(proj, theme.id) === false) {
          skippedThemes.push(heading);
          return;
        }
        const qs = questionsAt(theme.id, ms);
        if (!qs.length) return;
        const questions = qs.map(({ q, number }) => {
          const a = answerOf(theme.id, q);
          if (a.open) openCount++;
          return { number, text: q.text, ...a };
        });
        themeRows.push({ heading, questions });
      });
      const openLine = openCount === 0 ? 'keine offenen Fragen' : `${openCount} offene ${openCount === 1 ? 'Frage' : 'Fragen'}`;
      const result = isFoundation
        ? (proj.architectureRelevant === true ? `architekturrelevant${classLabel ? ` (${classLabel})` : ''}`
          : proj.architectureRelevant === false ? 'nicht architekturrelevant'
          : 'Architekturrelevanz offen')
        : null;
      milestones.push({
        title,
        ...(MILESTONE_INFO[ms] ? { info: MILESTONE_INFO[ms] } : {}),
        approved,
        statusLine: [openLine, result].filter(Boolean).join(' · '),
        openLine,
        ...(result ? { result } : {}),
        ...(String(review.approvedBy ?? '').trim() ? { approvedBy: String(review.approvedBy).trim() } : {}),
        ...(checksFor(ms).length
          ? { checks: checksFor(ms).map(c => {
              const s = checkState(review, c.id);
              if (!s.required) return {
                line: `**${c.label}** — nicht erforderlich`,
                ...(String(s.assessment ?? '').trim() ? { assessment: String(s.assessment).trim() } : {}),
              };
              const by = String(s.approvedBy ?? '').trim();
              return {
                line: `**${c.label}** — erforderlich · ${s.approved ? `abgenommen${by ? ` durch ${by}` : ''}` : 'noch nicht abgenommen'}`,
                ...(String(s.assessment ?? '').trim() ? { assessment: String(s.assessment).trim() } : {}),
                ...(String(s.remarks ?? '').trim() ? { remarks: String(s.remarks).trim() } : {}),
              };
            }) }
          : {}),
        ...(String(review.notes ?? '').trim() ? { notes: String(review.notes).trim() } : {}),
        themes: themeRows,
        ...(skippedThemes.length ? { skippedThemesNote: `Kein Review nötig: ${skippedThemes.join(', ')}` } : {}),
      });
      prevApproved = approved;
    }

    const metaLines: string[] = [];
    if (proj.responsibleProject || proj.responsibleArchitecture) {
      metaLines.push([
        proj.responsibleProject && `Verantwortlich Projekt: ${proj.responsibleProject}`,
        proj.responsibleArchitecture && `Verantwortlich Architektur: ${proj.responsibleArchitecture}`,
      ].filter(Boolean).join(' · '));
    }
    metaLines.push(`Klassifikation: ${classLabel ?? (proj.architectureRelevant === null ? 'offen' : '—')} · Projektstatus: ${STATUS_META[status].label}`);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setPdfBusy(true);
    try {
      const { buildReviewReportPdf } = await import('../pdfExport');
      const meta: { label: string; value: string }[] = [];
      if (proj.responsibleProject) meta.push({ label: 'Verantwortlich Projekt', value: proj.responsibleProject });
      if (proj.responsibleArchitecture) meta.push({ label: 'Verantwortlich Architektur', value: proj.responsibleArchitecture });
      meta.push({ label: 'Klassifikation', value: classLabel ?? (proj.architectureRelevant === null ? 'offen' : '—') });
      meta.push({ label: 'Projektstatus', value: STATUS_META[status].label });
      const bytes = await buildReviewReportPdf({
        meta,
        projectName: proj.name || proj.slug,
        ...(typeof proj.projectNumber === 'string' && proj.projectNumber ? { projectNumber: proj.projectNumber } : {}),
        generated: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
        ...(proj.description?.trim() ? { description: proj.description.trim() } : {}),
        metaLines,
        milestones,
        skipped: skippedMs,
        ...((proj.sources ?? []).length ? {
          sources: (proj.sources ?? []).map(s => ({
            label: s.label,
            ...(s.description?.trim() ? { description: s.description.trim() } : {}),
            detail: [
              s.url ? s.url : `${s.filename}${typeof s.size === 'number' ? ` · ${formatBytes(s.size)}` : ''}`,
              fmtTimestamp(s.uploadedAt),
              s.uploadedBy,
            ].filter(Boolean).join(' · '),
          })),
        } : {}),
      }, model.reportTemplate);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `architektur-review-${proj.slug}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      showToast('PDF konnte nicht erzeugt werden.');
    } finally {
      setPdfBusy(false);
    }
  };

  // Ausgefülltes Formular-PDF einlesen → ImportItems (gleicher Weg wie Text)
  const importPdfAnswers = async (ms: string, file: File) => {
    try {
      const { readAnswersPdf } = await import('../pdfExport');
      const raw = await readAnswersPdf(await file.arrayBuffer());
      const items: ImportItem[] = [];
      for (const r of raw) {
        const q = allQuestions.find(x => x.id === r.questionId && x.themeId === r.themeId && x.milestone === ms);
        if (!q) continue;
        const idx = allQuestions.filter(x => x.themeId === q.themeId && x.milestone === ms).findIndex(x => x.id === q.id);
        const patch: Partial<QuestionAnswer> = {};
        if ((r.ja ?? false) !== (r.nein ?? false)) patch.value = r.ja === true;
        if (r.choice) patch.choice = r.choice;
        if (r.remarks) patch.remarks = r.remarks;
        if (!Object.keys(patch).length) continue;
        const parts: string[] = [];
        if (patch.value !== undefined) parts.push(patch.value ? 'Ja' : 'Nein');
        if (patch.choice) parts.push(patch.choice);
        if (patch.remarks) parts.push(`«${patch.remarks.length > 40 ? patch.remarks.slice(0, 40) + '…' : patch.remarks}»`);
        items.push({ themeId: q.themeId, q, number: `${ms}${themeLetterOf(q.themeId)}${idx + 1}`, patch, summary: parts.join(' · ') });
      }
      setAnswersPdfItems(items);
    } catch {
      showToast('PDF konnte nicht gelesen werden — ist es das exportierte Formular?');
    }
  };

  // Ausgefüllten Export-Text wieder einlesen: erkennt Themen-Header,
  // Fragenummern (M20B3 …), angekreuzte [X] Ja/[X] Nein, Auswahl-Antworten
  // und Bemerkungen (auch mehrzeilig).
  type ImportItem = { themeId: string; q: Question; number: string; patch: Partial<QuestionAnswer>; summary: string };

  const parseAnswersImport = (ms: string, text: string): ImportItem[] => {
    const themeByTitle = new Map<string, string>();
    themes.forEach(t => themeByTitle.set(t.title.trim().toLowerCase(), t.id));
    const numberMap = new Map<string, Map<string, Question>>();
    for (const t of themes) {
      const m = new Map<string, Question>();
      const letter = themeLetterOf(t.id);
      allQuestions
        .filter(q => q.themeId === t.id && q.milestone === ms)
        .forEach((q, i) => m.set(`${ms}${letter}${i + 1}`, q));
      numberMap.set(t.id, m);
    }

    const items: ImportItem[] = [];
    let currentTheme: string | null = null;
    let cur: { themeId: string; q: Question; number: string } | null = null;
    let curValue: boolean | undefined;
    let curChoice: string | undefined;
    let curRemarks: string[] = [];
    // Erst nach einer Marker-Zeile (Checkboxen, «Bemerkung:», «Antwort …»)
    // zählt freier Text als Bemerkung — schützt vor umbrochenen Fragetexten.
    let seenMarker = false;

    const flush = () => {
      if (cur) {
        const patch: Partial<QuestionAnswer> = {};
        if (curValue !== undefined) patch.value = curValue;
        if (curChoice) patch.choice = curChoice;
        const rem = curRemarks.join('\n').trim();
        if (rem) patch.remarks = rem;
        if (Object.keys(patch).length) {
          const parts: string[] = [];
          if (curValue !== undefined) parts.push(curValue ? 'Ja' : 'Nein');
          if (curChoice) parts.push(curChoice);
          if (rem) parts.push(`«${rem.length > 40 ? rem.slice(0, 40) + '…' : rem}»`);
          items.push({ ...cur, patch, summary: parts.join(' · ') });
        }
      }
      cur = null;
      curValue = undefined;
      curChoice = undefined;
      curRemarks = [];
      seenMarker = false;
    };

    for (const raw of text.split(/\r?\n/)) {
      // Zitatzeichen aus E-Mail-Antworten («> ») entfernen
      const line = raw.replace(/^[ \t>]+/, '').trim();
      const themeId = themeByTitle.get(line.replace(/^[A-Z]\s*·\s*/, '').trim().toLowerCase());
      if (themeId) { flush(); currentTheme = themeId; continue; }
      if (/^-{5,}$/.test(line) || /^(Guten Tag|Vielen Dank|Freundliche Grüsse)/i.test(line)) continue;
      const qm = line.match(/^(M\d+[A-Z]\d+)\b\s*(.*)/);
      if (qm) {
        flush();
        const q = currentTheme ? numberMap.get(currentTheme)?.get(qm[1]) : undefined;
        if (q && currentTheme) cur = { themeId: currentTheme, q, number: qm[1] };
        continue;
      }
      if (!cur) continue;
      // Ja/Nein: tolerant gegenüber [], [x], [X], Zusatztext hinter Nein
      const jn = line.match(/\[([^\]]{0,3})\]\s*Ja\b[^\[]*\[([^\]]{0,3})\]\s*Nein\b(.*)$/i);
      if (jn) {
        const ja = /\S/.test(jn[1]);
        const nein = /\S/.test(jn[2]);
        if (ja !== nein) curValue = ja;
        const rest = jn[3].replace(/^[\s:,-]+/, '').trim();
        if (rest) curRemarks.push(rest);
        seenMarker = true;
        continue;
      }
      // Alleinstehendes Ja/Nein (wenn die Checkboxen entfernt wurden)
      const solo = line.match(/^(ja|nein)[.!]?$/i);
      if (solo) {
        curValue = solo[1].toLowerCase() === 'ja';
        seenMarker = true;
        continue;
      }
      const bm = line.match(/^(?:Antwort \/ )?Bemerkung(?:en)?:\s*(.*)$/i);
      if (bm) {
        seenMarker = true;
        if (bm[1].trim()) curRemarks.push(bm[1].trim());
        continue;
      }
      const am = line.match(/^Antwort\s*\([^)]*\):\s*(.*)$/i);
      if (am) {
        seenMarker = true;
        const val = am[1].trim();
        if (val) {
          const opt = (cur.q.options ?? []).find(o => o.toLowerCase() === val.toLowerCase());
          if (opt) curChoice = opt;
          else curRemarks.push(val);
        }
        continue;
      }
      // Hinweiszeile in Klammern nur vor dem ersten Marker überspringen
      if (!seenMarker && /^\(.*\)$/.test(line)) continue;
      // Alles Übrige nach einem Marker gehört zur Bemerkung — bis zur nächsten Frage
      if (seenMarker && line) curRemarks.push(line);
    }
    flush();
    return items;
  };

  const applyAnswersImport = (items: ImportItem[]) => {
    setProj(p => {
      if (!p) return p;
      const reviews = { ...p.reviews };
      for (const it of items) {
        const review = { ...emptyReview(), ...(reviews[it.themeId] ?? {}) };
        const answers = { ...(review.answers ?? {}) };
        const existing: QuestionAnswer = answers[it.q.id] ?? { value: null, remarks: '' };
        answers[it.q.id] = { ...existing, ...it.patch };
        reviews[it.themeId] = { ...review, answers };
      }
      return syncDerived({ ...p, reviews });
    });
    showToast(`${items.length} ${items.length === 1 ? 'Antwort' : 'Antworten'} übernommen.`);
    setAnswersMs(null);
    setAnswersText('');
    setAnswersPdfItems(null);
  };

  // Abnahme-Kontrollpunkte eines Meilensteins (aus model.json)
  const checksFor = (ms: string) => (model.milestoneChecks ?? []).filter(c => c.milestone === ms);

  // Die Übergabe an die Fachstelle hängt an den Abnahme-Kontrollpunkten:
  // Erst wenn einer davon «erforderlich» angekreuzt ist, gibt es den
  // Übergabetext — und die Einschätzung Architektur darin ist der Auftrag.
  const requiredChecks = (ms: string) => {
    const review = getMilestoneReview(proj, ms);
    return checksFor(ms)
      .map(check => ({ check, state: checkState(review, check.id) }))
      .filter(({ state }) => state.required === true);
  };

  // Kopfbereich eines Meilenstein-Blocks
  const milestoneHeader = (opts: {
    ms: string;
    chipLabel: string;
    chipValue: boolean | null;
    review: Review;
    update: (patch: Partial<Review>) => void;
    extra?: React.ReactNode;
  }) => {
    const notesEmpty = String(opts.review.notes ?? '').trim() === '';
    const checks = checksFor(opts.ms);
    const blocking = blockingChecks(opts.review, checks);
    // Änderung an einem Kontrollpunkt; hebt eine bestehende Freigabe auf, wenn
    // danach eine erforderliche Prüfung nicht mehr vollständig ist
    const updateCheck = (id: string, patch: Partial<import('../types').MilestoneCheckState>) => {
      const next = { ...(opts.review.checks ?? {}), [id]: { ...checkState(opts.review, id), ...patch } };
      const stillBlocked = blockingChecks({ ...opts.review, checks: next }, checks).length > 0;
      opts.update({ checks: next, ...(stillBlocked && opts.review.approved ? { approved: false, reviewed: false } : {}) });
    };
    return (
      <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(280px,auto)_1fr] gap-x-6 gap-y-3 items-stretch">
        <div className="space-y-3">
          <div className={`flex items-center gap-2 text-xs flex-wrap ${isDark ? 'text-white/70' : 'text-black/70'}`}>
            {opts.chipLabel} {derivedChip(opts.chipValue)}
            {opts.extra}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${isDark ? 'text-white/70' : 'text-black/70'}`}>
              <input disabled={ro || (blocking.length > 0 && opts.review.approved !== true)} type="checkbox" checked={opts.review.approved === true}
                title={blocking.length ? `Erst möglich, wenn abgenommen bzw. begründet: ${blocking.map(c => c.label).join(', ')}` : undefined}
                onChange={e => opts.update({
                  reviewed: e.target.checked,
                  approved: e.target.checked,
                  // Prüfer/in mit der angemeldeten Person vorbelegen
                  ...(e.target.checked && !String(opts.review.approvedBy ?? '').trim() && authUser?.name
                    ? { approvedBy: authUser.name } : {}),
                })}
                className="accent-blue-500 cursor-pointer" />
              Geprüft und freigegeben
            </label>
            <input disabled={ro} value={String(opts.review.approvedBy ?? '')} placeholder="Prüfer/in"
              onChange={e => opts.update({ approvedBy: e.target.value })}
              className={`text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
          </div>
          {blocking.length > 0 && opts.review.approved !== true && (
            <div className={`text-[11px] ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
              {[
                blocking.filter(c => checkState(opts.review, c.id).required === true),
                blocking.filter(c => checkState(opts.review, c.id).required !== true),
              ].map((group, i) => group.length === 0 ? null : (
                <p key={i}>
                  Freigabe erst möglich, wenn {i === 0 ? 'abgenommen' : 'begründet'}: {group.map(c => c.label).join(', ')}
                </p>
              ))}
            </div>
          )}
          {checks.map(c => {
            const s = checkState(opts.review, c.id);
            const byEmpty = String(s.approvedBy ?? '').trim() === '';
            const remEmpty = String(s.remarks ?? '').trim() === '';
            const assEmpty = String(s.assessment ?? '').trim() === '';
            const sub = `text-[10px] uppercase tracking-wider ${isDark ? 'text-white/40' : 'text-black/40'}`;
            const checkKey = `check:${opts.ms}:${c.id}`;
            return (
              <div key={c.id} data-comment-target={checkKey} className={`space-y-2 transition-colors ${anchorCls(checkKey)}`}>
                <div className="flex items-center gap-1.5">
                  <label title={c.hint}
                    className={`flex items-center gap-1.5 text-xs cursor-pointer ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                    <input disabled={ro} type="checkbox" checked={s.required}
                      onChange={e => updateCheck(c.id, { required: e.target.checked })}
                      className="accent-blue-500 cursor-pointer" />
                    {c.label} erforderlich
                    {c.hint && <Info size={11} className="opacity-50" />}
                  </label>
                  {bubble(checkKey)}
                </div>
                {/* Einschätzung immer: begründet, warum die Prüfung nötig ist — oder warum nicht */}
                <div className={`ml-5 pl-3 border-l space-y-2 ${border}`}>
                  <p className={sub}>Einschätzung Architektur</p>
                  <textarea disabled={ro} value={String(s.assessment ?? '')} required rows={2}
                    onChange={e => updateCheck(c.id, { assessment: e.target.value })}
                    onFocus={autoGrow} onInput={autoGrow}
                    placeholder={s.required
                      ? 'Warum ist die Prüfung nötig, was ist zu prüfen, was erwartet die Architektur (erforderlich)'
                      : 'Warum ist die Prüfung nicht nötig (erforderlich)'}
                    className={`w-full min-h-[52px] text-[11px] px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors ${inputCls} ${
                      assEmpty ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''
                    }`} />
                  {s.required && (
                    <>
                    <p className={sub}>Resultat Abnahme</p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                        <input disabled={ro} type="checkbox" checked={s.approved === true}
                          onChange={e => updateCheck(c.id, {
                            approved: e.target.checked,
                            ...(e.target.checked && byEmpty && authUser?.name ? { approvedBy: authUser.name } : {}),
                          })}
                          className="accent-blue-500 cursor-pointer" />
                        abgenommen
                      </label>
                      <input disabled={ro} value={String(s.approvedBy ?? '')} placeholder="durch wen (erforderlich)"
                        onChange={e => updateCheck(c.id, { approvedBy: e.target.value })}
                        className={`text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls} ${
                          byEmpty ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''
                        }`} />
                    </div>
                    <textarea disabled={ro} value={String(s.remarks ?? '')} required rows={2}
                      onChange={e => updateCheck(c.id, { remarks: e.target.value })}
                      onFocus={autoGrow} onInput={autoGrow}
                      placeholder={`Bemerkungen ${c.label} (erforderlich)`}
                      className={`w-full min-h-[52px] text-[11px] px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors ${inputCls} ${
                        remEmpty ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''
                      }`} />
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {/* Übergabe an die Fachstelle — ein Mail für alle erforderlichen Prüfungen */}
          {requiredChecks(opts.ms).length > 0 && (
            <button onClick={() => { setExportHandover(true); setExportMs(opts.ms); setCopiedKey(null); }}
              title="Übergabetext (E-Mail) an die Fachstelle — mit der Einschätzung Architektur und der Bitte um Rückmeldung"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/60 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/60 hover:border-black/30 hover:text-black'}`}>
              <Mail size={12} /> Übergabe an Fachstelle
            </button>
          )}
        </div>
        {(() => {
          const notesKey = `ms:${opts.ms}:notes`;
          return (
            <div data-comment-target={notesKey} className={`flex flex-col transition-colors ${anchorCls(notesKey)}`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wider ${labelCls}`}>Bemerkungen</span>
                {bubble(notesKey)}
              </div>
              <textarea disabled={ro} value={opts.review.notes} required rows={3}
                onChange={e => opts.update({ notes: e.target.value })}
                onFocus={autoGrow} onInput={autoGrow}
                placeholder="Bemerkungen (erforderlich)"
                className={`w-full flex-1 min-h-[76px] text-[11px] px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors ${inputCls} ${
                  notesEmpty ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''
                }`} />
            </div>
          );
        })()}
      </div>
    );
  };

  // Kommentierbare Stellen in Dokumentreihenfolge (= Schrittfolge im Panel).
  // Stellen, die gerade nicht sichtbar sind (z. B. M20 nach zurückgenommener
  // Freigabe, per Klassifikation ausgeblendete Frage), aber Kommentare haben,
  // kommen am Schluss dazu, damit die Übersicht vollständig bleibt.
  const commentTargets = (): CommentTargetInfo[] => {
    const out: CommentTargetInfo[] = [{ key: 'project:description', label: 'Beschrieb', group: 'Projekt' }];
    const visibleMs: string[] = [FOUNDATION_MS];
    if (model.classifications.findIndex(c => c.id === proj.classification) >= 1) {
      let prevApproved = getMilestoneReview(proj, FOUNDATION_MS).approved === true;
      for (const ms of MILESTONES.slice(1)) {
        if (!prevApproved) break;
        visibleMs.push(ms);
        prevApproved = getMilestoneReview(proj, ms).approved === true;
      }
    }
    for (const ms of visibleMs) {
      const group = `${ms} · ${MILESTONE_TITLES[ms] ?? 'Prüfung'}`;
      out.push({ key: `ms:${ms}:notes`, label: 'Bemerkungen', group });
      for (const c of checksFor(ms)) out.push({ key: `check:${ms}:${c.id}`, label: `${c.label} erforderlich`, group });
      for (const theme of themes) {
        if (ms !== FOUNDATION_MS && derivedRelevant(proj, theme.id) === false) continue;
        for (const { q, number } of questionsAt(theme.id, ms)) {
          out.push({ key: `q:${theme.id}:${q.id}`, label: `${number} ${q.text}`, group });
        }
      }
    }
    const known = new Set(out.map(t => t.key));
    for (const c of comments) {
      if (c.parentId || known.has(c.target)) continue;
      known.add(c.target);
      const parts = c.target.split(':');
      let label = c.target;
      if (parts[0] === 'q') {
        const q = allQuestions.find(x => x.themeId === parts[1] && x.id === parts[2]);
        label = q ? `${numberOfQuestion(q)} ${q.text}` : c.target;
      } else if (parts[0] === 'ms') label = `${parts[1]} · Bemerkungen`;
      else if (parts[0] === 'check') label = `${parts[1]} · ${(model.milestoneChecks ?? []).find(x => x.id === parts[2])?.label ?? parts[2]}`;
      out.push({ key: c.target, label, group: 'Zurzeit nicht sichtbar' });
    }
    return out;
  };
  const openCommentCount = comments.filter(c => !c.parentId && c.resolved !== true).length;

  return (
    <div className={`p-6 pb-24 mx-auto flex items-start gap-4 ${commentsOpen ? 'max-w-[1424px]' : 'max-w-5xl'}`}>
    <div className="flex-1 min-w-0 max-w-5xl mx-auto">
      {/* Kopfzeile */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={back} className={`flex items-center gap-1.5 text-xs ${textMuted} hover:opacity-70`}>
          <ArrowLeft size={12} /> Projekte
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => { if (commentsOpen && commentTarget === null) setCommentsOpen(false); else openCommentTarget(null); }}
            title="Alle Kommentare — Übersicht und Schritt für Schritt durchgehen"
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${
              commentsOpen
                ? (isDark ? 'border-blue-500/40 text-blue-300 bg-blue-500/10' : 'border-blue-300 text-blue-700 bg-blue-50')
                : openCommentCount > 0
                  ? (isDark ? 'border-blue-500/30 text-blue-300 hover:bg-blue-500/10' : 'border-blue-300 text-blue-700 hover:bg-blue-50')
                  : (isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black')}`}>
            <MessageSquare size={11} /> Kommentare{openCommentCount > 0 ? ` (${openCommentCount})` : ''}
          </button>
          <div className={`text-[11px] ${textMuted}`}>Stand: {fmtTimestamp(proj.updatedAt)}</div>
        </div>
      </div>

      {/* Bearbeitungssperre */}
      {lockState?.kind === 'held' && (
        <div className={`mb-4 px-4 py-3 rounded-xl border flex items-center gap-3 flex-wrap text-xs ${isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
          <Lock size={14} className="flex-shrink-0" />
          <span>
            <span className="font-semibold">In Bearbeitung durch {lockState.lock.user}</span>
            {' '}· letzte Änderung {fmtTimestamp(lockState.lock.lastActivity)} · Sperre läuft bis {fmtTimestamp(lockState.lock.until)} — du siehst den aktuellen Stand nur lesend.
          </span>
          {canEdit && (
            <button onClick={() => {
              if (window.confirm(`Sperre von ${lockState.lock.user} übernehmen?\nDeren noch nicht gespeicherte Eingaben (max. wenige Sekunden) können verloren gehen.`)) void tryAcquire(true);
            }}
              className={`ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-amber-400/40 hover:border-amber-300' : 'border-amber-400 hover:border-amber-600'}`}>
              <Unlock size={11} /> Übernehmen
            </button>
          )}
        </div>
      )}
      {lockState?.kind === 'free' && (
        <div className={`mb-4 px-4 py-3 rounded-xl border flex items-center gap-3 flex-wrap text-xs ${isDark ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
          <Unlock size={14} className="flex-shrink-0" />
          <span>Das Projekt ist jetzt frei — du siehst den neuesten Stand.</span>
          {canEdit && (
            <button onClick={() => void tryAcquire(false)}
              className={`ml-auto text-[11px] px-2.5 py-1 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
              Bearbeiten
            </button>
          )}
        </div>
      )}

      {/* Kopf: Projektangaben */}
      <div className={`${cardCls} p-4 mb-4`}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <input value={proj.name} disabled={ro}
              onChange={e => setField('name', e.target.value)}
              placeholder={proj.slug}
              title="Projektname"
              className={`text-sm font-semibold bg-transparent border border-transparent rounded px-1 -mx-1 outline-none min-w-0 transition-colors disabled:cursor-default ${isDark ? 'text-white placeholder-white/30 hover:border-white/15 focus:border-white/30 focus:bg-white/5' : 'text-black placeholder-black/30 hover:border-black/15 focus:border-black/30 focus:bg-black/5'}`}
              style={{ width: `${Math.max(8, (proj.name || proj.slug).length + 1)}ch` }} />
            {typeof proj.projectNumber === 'string' && proj.projectNumber && (
              <span className={`text-[11px] font-normal flex-shrink-0 ${textMuted}`}>{proj.projectNumber}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadReviewPdf} disabled={pdfBusy}
              title="Architektur-Review als PDF-Bericht exportieren — Status und alle Antworten"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
              <FileDown size={11} /> Review-PDF
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={ro}
              title="Felder aus einem MS10-Antrags-PDF übernehmen"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
              <FileUp size={11} /> MS10-Import
            </button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) pickMs10(f);
              }} />
            <StatusBadge status={status} isDark={isDark} />
          </div>
        </div>
        {/* Beschrieb über die gesamte Breite */}
        <div className={`mb-3 transition-colors ${anchorCls('project:description')}`} data-comment-target="project:description">
          <div className="flex items-center gap-2 mb-1">
            <label className={`block text-[10px] uppercase tracking-wider ${labelCls}`}>Beschrieb</label>
            {bubble('project:description')}
          </div>
          <textarea disabled={ro} value={proj.description ?? ''} rows={3}
            onChange={e => setField('description', e.target.value)}
            onFocus={autoGrow} onInput={autoGrow}
            placeholder="Ausgangslage / Motivation — z. B. per MS10-Import übernehmen"
            className={`w-full text-xs px-3 py-2 rounded border outline-none resize-y transition-colors ${inputCls}`} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Verantwortlich Projekt</label>
            <input disabled={ro} value={proj.responsibleProject} onChange={e => setField('responsibleProject', e.target.value)}
              className={`w-full text-xs px-3 py-2 rounded border outline-none transition-colors ${inputCls}`} />
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Verantwortlich Architektur</label>
            <input disabled={ro} value={proj.responsibleArchitecture} onChange={e => setField('responsibleArchitecture', e.target.value)}
              className={`w-full text-xs px-3 py-2 rounded border outline-none transition-colors ${inputCls}`} />
          </div>
        </div>
      </div>

      {/* M10 · Foundation-Prüfung */}
      <div className={`${cardCls} mb-4`}>
        <div className="px-4 pt-3 flex items-center justify-between gap-3">
          <h3 className={`text-[11px] font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>
            {FOUNDATION_MS} · {MILESTONE_TITLES[FOUNDATION_MS] ?? 'Prüfung'}
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={() => { setExportMs(FOUNDATION_MS); setCopiedKey(null); }}
              title="Offene Fragen als E-Mail-Text exportieren"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
              <Mail size={11} /> Offene Fragen
            </button>
            <button onClick={() => { setAnswersMs(FOUNDATION_MS); setAnswersText(''); setAnswersPdfItems(null); }} disabled={ro}
              title="Ausgefüllten E-Mail-Text einlesen und Antworten übernehmen"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
              <ClipboardPaste size={11} /> Antworten importieren
            </button>
          </div>
        </div>
        {MILESTONE_INFO[FOUNDATION_MS] && (
          <p className={`px-4 pt-1 text-[11px] ${textMuted}`}>{MILESTONE_INFO[FOUNDATION_MS]}</p>
        )}
        {milestoneHeader({
          ms: FOUNDATION_MS,
          chipLabel: 'Architekturrelevant',
          chipValue: proj.architectureRelevant,
          review: getMilestoneReview(proj, FOUNDATION_MS),
          update: patch => updateMilestoneReview(FOUNDATION_MS, patch),
          extra: (
            <span className="flex items-center gap-1.5 ml-3">
              <span className={`text-[10px] uppercase tracking-wider ${labelCls}`}>Klassifikation</span>
              <button onClick={() => setShowClassInfo(true)} title="Was bedeutet die Klassifikation?"
                className={`p-0.5 rounded transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <Info size={11} />
              </button>
              {proj.architectureRelevant === false ? (
                // «alles Nein» → automatisch die erste Stufe (nicht relevant)
                <span className={`text-[11px] px-2 py-1 rounded border ${isDark ? 'border-white/10 text-white/40' : 'border-black/10 text-black/40'}`}>
                  {model.classifications[0]?.label ?? 'nicht relevant'}
                </span>
              ) : (
                <select value={proj.classification ?? ''}
                  disabled={ro || proj.architectureRelevant !== true}
                  onChange={e => {
                    const id = e.target.value || null;
                    setProj(p => (p ? syncDerived({ ...p, classification: id }) : p));
                  }}
                  className={`text-[11px] px-2 py-1 rounded border outline-none transition-colors disabled:opacity-50 ${inputCls} ${
                    proj.architectureRelevant === true && !proj.classification
                      ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''
                  }`}>
                  <option value="">{proj.architectureRelevant === null ? '– offen –' : '– wählen –'}</option>
                  {model.classifications.slice(1).map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              )}
            </span>
          ),
        })}
        <div className={`px-4 py-3 border-t ${border}`}>
          <p className={`text-[10px] uppercase tracking-wider mb-2 ${labelCls}`}>
            Fragen zur Relevanz ({FOUNDATION_MS}) — je Thema
          </p>
          {questionSection(FOUNDATION_MS)}
        </div>
      </div>

      {/* Meilensteine nach der Foundation: jeder Block erscheint, sobald der
          vorherige freigegeben ist — und nur wenn die Klassifikation auf
          relevant oder höher steht (nicht relevant → kein M20/M40). */}
      {model.classifications.findIndex(c => c.id === proj.classification) >= 1 && (() => {
        const panels: React.ReactNode[] = [];
        let prevApproved = getMilestoneReview(proj, FOUNDATION_MS).approved === true;
        for (const ms of MILESTONES.slice(1)) {
          if (!prevApproved) break;
          panels.push(
            <div key={ms} className={`${cardCls} mb-4`}>
              <div className="px-4 pt-3 flex items-center justify-between gap-3">
                <h3 className={`text-[11px] font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                  {ms} · {MILESTONE_TITLES[ms] ?? 'Prüfung'}
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setExportMs(ms); setCopiedKey(null); }}
                    title="Offene Fragen als E-Mail-Text exportieren"
                    className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    <Mail size={11} /> Offene Fragen
                  </button>
                  <button onClick={() => { setAnswersMs(ms); setAnswersText(''); setAnswersPdfItems(null); }} disabled={ro}
                    title="Ausgefüllten E-Mail-Text einlesen und Antworten übernehmen"
                    className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    <ClipboardPaste size={11} /> Antworten importieren
                  </button>
                </div>
              </div>
              {MILESTONE_INFO[ms] && (
                <p className={`px-4 pt-1 text-[11px] ${textMuted}`}>{MILESTONE_INFO[ms]}</p>
              )}
              {milestoneHeader({
                ms,
                chipLabel: 'Ergebnis',
                chipValue: milestoneOutcome(ms),
                review: getMilestoneReview(proj, ms),
                update: patch => updateMilestoneReview(ms, patch),
              })}
              <div className={`px-4 py-3 border-t ${border}`}>
                <p className={`text-[10px] uppercase tracking-wider mb-2 ${labelCls}`}>
                  Fragen ({ms}) — je Thema
                </p>
                {questionSection(ms)}
              </div>
            </div>
          );
          prevApproved = getMilestoneReview(proj, ms).approved === true;
        }
        return panels;
      })()}

      {/* Quellen: Belege/Referenzdokumente zum Herunterladen */}
      <div className={`${cardCls} mb-4`}>
        <div className="px-4 pt-3 pb-1">
          <h3 className={`text-[11px] font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>
            Quellen
          </h3>
        </div>
        <div className="px-4 pb-3">
          {(proj.sources ?? []).length === 0 ? (
            <p className={`text-[11px] ${textMuted}`}>Noch keine Quellen hinterlegt.</p>
          ) : (
            <div className="space-y-2">
              {(proj.sources ?? []).map(s => editingSourceId === s.id ? (
                <div key={s.id} className={`py-2 border-t ${border} first:border-t-0 first:pt-0 space-y-1.5`}>
                  <input value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus
                    placeholder="Label"
                    className={`block w-full text-xs px-2 py-1.5 rounded border outline-none transition-colors ${inputCls} ${!editLabel.trim() ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
                  <textarea value={editDescription} rows={1}
                    onChange={e => setEditDescription(e.target.value)}
                    onFocus={autoGrow} onInput={autoGrow}
                    placeholder="Beschrieb (optional)"
                    className={`block w-full text-xs px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors ${inputCls}`} />
                  {s.url !== undefined && (
                    <input value={editUrl} onChange={e => setEditUrl(e.target.value)}
                      placeholder="https://…"
                      className={`block w-full text-xs px-2 py-1.5 rounded border outline-none transition-colors ${inputCls} ${!editUrl.trim() ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
                  )}
                  <div className="flex gap-2">
                    <button onClick={saveEditSource} disabled={!editLabel.trim() || (s.url !== undefined && !editUrl.trim())}
                      className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                      <Check size={11} /> Speichern
                    </button>
                    <button onClick={() => setEditingSourceId(null)}
                      className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div key={s.id} className={`flex items-start gap-3 py-2 border-t ${border} first:border-t-0 first:pt-0`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isDark ? 'text-white/80' : 'text-black/80'}`}>{s.label}</p>
                    {s.description && <p className={`text-[11px] mt-0.5 ${textMuted}`}>{s.description}</p>}
                    <p className={`text-[10px] mt-0.5 truncate ${textMuted}`}>
                      {s.url ? s.url : `${s.filename} · ${formatBytes(s.size ?? 0)}`} · {fmtTimestamp(s.uploadedAt)}{s.uploadedBy ? ` · ${s.uploadedBy}` : ''}
                    </p>
                  </div>
                  <button onClick={() => downloadSource(s)} title={s.url ? 'Link öffnen' : 'Herunterladen'}
                    className={`p-1.5 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/40 hover:text-white' : 'text-black/40 hover:text-black'}`}>
                    {s.url ? <ExternalLink size={13} /> : <Download size={13} />}
                  </button>
                  {!ro && (
                    <>
                      <button onClick={() => startEditSource(s)} title="Label/Beschrieb bearbeiten"
                        className={`p-1.5 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/40 hover:text-white' : 'text-black/40 hover:text-black'}`}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => removeSource(s)} title="Entfernen"
                        className={`p-1.5 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-red-400' : 'text-black/25 hover:text-red-500'}`}>
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {!ro && (
          <div className={`px-4 py-3 border-t ${border} flex items-end gap-2 flex-wrap`}>
            <div className="flex-1 min-w-[160px]">
              <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Label</label>
              <input value={sourceLabel} onChange={e => setSourceLabel(e.target.value)}
                placeholder="z. B. Prüfformular Datenhaltung"
                title="Bei mehreren Dateien auf einmal wird stattdessen je Datei ihr Dateiname als Label verwendet"
                className={`block w-full text-xs px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Beschrieb (optional)</label>
              <textarea value={sourceDescription} rows={1}
                onChange={e => setSourceDescription(e.target.value)}
                onFocus={autoGrow} onInput={autoGrow}
                placeholder="Kurzer Hinweis, worum es geht"
                className={`block w-full text-xs px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors ${inputCls}`} />
            </div>
            <div className="flex-shrink-0">
              <label className="block text-[10px] uppercase tracking-wider mb-1 opacity-0 select-none" aria-hidden="true">.</label>
              <button onClick={() => sourceFileRef.current?.click()} disabled={sourceBusy}
                title="Mehrfachauswahl möglich"
                className={`block flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                <FileUp size={12} /> {sourceBusy ? 'Lädt hoch …' : 'Dateien wählen'}
              </button>
            </div>
            <input ref={sourceFileRef} type="file" multiple className="hidden"
              onChange={e => { const files = e.target.files; e.target.value = ''; if (files && files.length) void addSources(files); }} />
            <div className="w-full flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Web-Referenz statt Datei (optional)</label>
                <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
                  placeholder="https://…"
                  className={`block w-full text-xs px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
              </div>
              <div className="flex-shrink-0">
                <button onClick={addWebSource} disabled={sourceBusy || !sourceLabel.trim() || !sourceUrl.trim()}
                  title="Label ausfüllen und Link hinzufügen"
                  className={`block flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                  <Link2 size={12} /> Link hinzufügen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Speicherleiste */}
      <div className={`fixed bottom-0 left-0 right-0 border-t ${border} ${isDark ? 'bg-[#0c0d0f]/95' : 'bg-[#eae9e5]/95'} backdrop-blur px-6 py-3`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className={`text-[11px] ${textMuted}`}>
            {lockedByOther ? 'Nur lesen — Projekt ist durch eine andere Person gesperrt' : ro ? 'Nur lesen (Viewer) — Änderungen werden nicht gespeichert' : saveError
              ? <span className={isDark ? 'text-rose-400' : 'text-rose-600'}>{saveError}</span>
              : saving
                ? 'Speichert …'
                : dirty
                  ? 'Ungespeicherte Änderungen'
                  : lastSavedAt
                    ? <span className={isDark ? 'text-emerald-400' : 'text-emerald-600'}>Automatisch gespeichert ✓ {lastSavedAt}</span>
                    : 'Keine Änderungen'}
          </div>
          <div className={`flex items-center gap-1.5 text-[11px] ${textMuted}`}>
            {ro ? <><Eye size={11} /> projects/{proj.slug}.json (nur lesen)</> : <><Save size={11} /> schreibt projects/{proj.slug}.json</>}
          </div>
        </div>
      </div>

      {/* Import: ausgefüllte Antworten aus E-Mail-Text übernehmen */}
      {answersMs && (() => {
        const items = answersPdfItems ?? parseAnswersImport(answersMs, answersText);
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setAnswersMs(null)}>
            <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>
                  Antworten importieren {answersMs}
                </h3>
                <button onClick={() => setAnswersMs(null)}
                  className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                  <X size={14} />
                </button>
              </div>
              <p className={`text-[11px] mb-2 ${textMuted}`}>
                Ausgefüllten E-Mail-Text hier einfügen — erkannt werden angekreuzte [X] Ja/Nein,
                Auswahl-Antworten und Bemerkungen. Oder das ausgefüllte PDF-Formular wählen.
              </p>
              <label className={`mb-2 inline-flex w-fit items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border cursor-pointer transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                <FileUp size={12} /> Ausgefülltes PDF wählen
                <input type="file" accept="application/pdf,.pdf" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f && answersMs) importPdfAnswers(answersMs, f);
                  }} />
              </label>
              <textarea disabled={ro} value={answersText} autoFocus rows={10}
                onChange={e => { setAnswersText(e.target.value); setAnswersPdfItems(null); }}
                placeholder={'M20F2 Bleiben die Daten dort liegen (nicht nur Anzeige)?\n[X] Ja    [ ] Nein\nBemerkung: bleibt in der neuen Core-DB'}
                className={`w-full text-[11px] leading-relaxed px-3 py-2 rounded border outline-none resize-y font-mono ${inputCls}`} />
              <div className={`mt-3 text-[11px] ${textMuted}`}>
                {answersPdfItems
                  ? (items.length === 0
                    ? 'Keine ausgefüllten Felder im PDF gefunden — stimmt der Meilenstein?'
                    : `${items.length} ${items.length === 1 ? 'Antwort' : 'Antworten'} aus dem PDF erkannt:`)
                  : answersText.trim() === ''
                    ? 'Noch kein Text eingefügt.'
                    : items.length === 0
                      ? 'Keine Antworten erkannt — stimmt der Meilenstein? Themen-Titel und Fragenummern müssen erhalten bleiben.'
                      : `${items.length} ${items.length === 1 ? 'Antwort' : 'Antworten'} erkannt:`}
              </div>
              {items.length > 0 && (
                <div className={`mt-2 max-h-40 overflow-y-auto rounded border px-3 py-2 space-y-1 ${isDark ? 'border-white/10' : 'border-black/10'}`}>
                  {items.map(it => (
                    <div key={`${it.themeId}:${it.q.id}`} className={`text-[11px] ${isDark ? 'text-white/75' : 'text-black/75'}`}>
                      <span className={textMuted}>{it.number}</span> {it.summary}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <button onClick={() => setAnswersMs(null)}
                  className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                  Abbrechen
                </button>
                <button onClick={() => applyAnswersImport(items)} disabled={items.length === 0}
                  className={`flex-1 text-xs py-2 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                  Übernehmen
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Export: offene Fragen als E-Mail-Text */}
      {exportMs && (() => {
        const handover = exportHandover ? buildHandoverExport(exportMs, handoverDeadline) : null;
        const { text, count } = handover ? { text: handover.text, count: 0 } : buildExport(exportMs);
        const closeExport = () => { setExportMs(null); setExportHandover(false); setHandoverDeadline(''); };
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={closeExport}>
            <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>
                  {handover ? `Übergabe an Fachstelle (${exportMs})` : `Offene Fragen ${exportMs}`}
                  <span className={`ml-2 text-[11px] font-normal ${textMuted}`}>
                    {handover ? 'Review-Bericht (PDF) beilegen' : `${count} ${count === 1 ? 'Frage' : 'Fragen'}`}
                  </span>
                </h3>
                <button onClick={closeExport}
                  className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                  <X size={14} />
                </button>
              </div>
              {count === 0 && !handover ? (
                <p className={`text-xs ${textMuted}`}>Alle Fragen dieses Meilensteins sind beantwortet — nichts zu verschicken.</p>
              ) : (
                <>
                  {handover && (
                    <div className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center text-[11px] mb-3 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                      <span className={textMuted}>An</span>
                      <span className="truncate" title={handover.to}>{handover.to || <em className={textMuted}>kein Empfänger konfiguriert (Admin → Abnahme-Kontrollpunkte)</em>}</span>
                      <span className={textMuted}>Betreff</span>
                      <span className="truncate" title={handover.subject}>{handover.subject}</span>
                      <span className={textMuted}>Termin</span>
                      <input type="date" value={handoverDeadline} onChange={e => setHandoverDeadline(e.target.value)}
                        className={`w-40 text-[11px] px-2 py-1 rounded border outline-none transition-colors ${inputCls}`} />
                    </div>
                  )}
                  {handover ? (
                    // Vorschau wie im Mail (Fettschrift), nicht als Rohtext
                    <div className={`docx-content w-full flex-1 min-h-[280px] overflow-auto px-3 py-2 rounded border ${inputCls}`}
                      dangerouslySetInnerHTML={{ __html: marked.parse(text, { async: false }) as string }} />
                  ) : (
                    <textarea readOnly value={text}
                      onFocus={e => e.currentTarget.select()}
                      className={`w-full flex-1 min-h-[280px] text-[11px] leading-relaxed px-3 py-2 rounded border outline-none resize-none font-mono ${inputCls}`} />
                  )}
                  <div className="flex gap-2 pt-4 flex-wrap">
                    {handover ? (
                      <>
                        <button onClick={() => copyToClipboard(handover.to, 'to')} disabled={!handover.to}
                          title={handover.to || 'Kein Empfänger konfiguriert'}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                          <Copy size={12} /> {copiedKey === 'to' ? '✓ Kopiert' : 'Empfänger kopieren'}
                        </button>
                        <button onClick={() => copyToClipboard(handover.subject, 'subject')}
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                          <Copy size={12} /> {copiedKey === 'subject' ? '✓ Kopiert' : 'Betreff kopieren'}
                        </button>
                        <button onClick={() => copyRich(text, 'text')}
                          title="Kopiert den Text mit Formatierung (Fettschrift) — in Outlook/Gmail einfügen"
                          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                          <Copy size={12} /> {copiedKey === 'text' ? '✓ Kopiert' : 'Inhalt kopieren'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => copyToClipboard(text, 'text')}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                        <Copy size={12} /> {copiedKey === 'text' ? '✓ Kopiert' : 'Kopieren'}
                      </button>
                    )}
                    {!handover && (
                      <button onClick={() => downloadPdf(exportMs)} disabled={pdfBusy}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                        <FileDown size={12} /> {pdfBusy ? 'Erzeuge PDF …' : 'PDF-Formular'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Info: Klassifikation (Markdown) */}
      {showClassInfo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setShowClassInfo(false)}>
          <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>Klassifikation</h3>
              <button onClick={() => setShowClassInfo(false)}
                className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto min-h-0">
              {(() => {
                const md = model.classificationInfoMd ?? DEFAULT_MODEL.classificationInfoMd;
                if (md) {
                  return (
                    <div className={`docx-content ${isDark ? 'text-white/75' : 'text-black/75'}`}
                      dangerouslySetInnerHTML={{ __html: marked.parse(md, { async: false }) }} />
                  );
                }
                return <p className={`text-[11px] ${textMuted}`}>Keine Info hinterlegt — im Admin-Modus ergänzen.</p>;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Themen-Info (Markdown) */}
      {infoQuestion && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setInfoQuestion(null)}>
          <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>{infoQuestion.text}</h3>
              <button onClick={() => setInfoQuestion(null)}
                className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto min-h-0">
              <div className={`docx-content ${isDark ? 'text-white/75' : 'text-black/75'}`}
                dangerouslySetInnerHTML={{ __html: marked.parse(infoQuestion.hint ?? '', { async: false }) }} />
            </div>
          </div>
        </div>
      )}

      {infoTheme && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setInfoTheme(null)}>
          <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>{infoTheme.title}</h3>
              <button onClick={() => setInfoTheme(null)}
                className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto min-h-0">
              {(() => {
                const md = infoTheme.infoMd
                  ?? DEFAULT_MODEL.themes.find(t => t.id === infoTheme.id)?.infoMd;
                if (md) {
                  return (
                    <div className={`docx-content ${isDark ? 'text-white/75' : 'text-black/75'}`}
                      dangerouslySetInnerHTML={{ __html: marked.parse(md, { async: false }) }} />
                  );
                }
                return <p className={`text-[11px] ${textMuted}`}>Keine Info hinterlegt — im Admin-Modus ergänzen.</p>;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MS10-Import-Vorschau */}
      {importData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
          <div className={`max-w-md w-full rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}>
            <p className={`text-[10px] uppercase tracking-wider mb-3 ${labelCls}`}>MS10-Import — gefundene Felder</p>
            <div className="space-y-1.5 mb-5 max-h-64 overflow-y-auto">
              {MS10_FIELD_LABELS.map(([key, label]) => {
                const v = importData[key];
                if (v === undefined) return null;
                const text = typeof v === 'boolean'
                  ? (v ? 'architekturrelevant: Ja' : 'architekturrelevant: Nein')
                  : (v.length > 220 ? `${v.slice(0, 220)}…` : v);
                return (
                  <div key={key} className="flex gap-3 text-[11px]">
                    <span className={`w-40 flex-shrink-0 ${textMuted}`}>{label}</span>
                    <span className={isDark ? 'text-white/80' : 'text-black/80'}>{text}</span>
                  </div>
                );
              })}
            </div>
            <p className={`text-[10px] leading-relaxed mb-4 ${textMuted}`}>
              Übernimmt Titel, Beschrieb (Ausgangslage), Projektleiter/in, Prüftiefe (aus Projektklasse),
              Architektur-Relevanz (falls angekreuzt) und eine Zusammenfassung in die M10-Bemerkungen.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setImportData(null)}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                Abbrechen
              </button>
              <button onClick={applyImport}
                className={`flex-1 text-xs py-2 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                Übernehmen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entra-Suche für @-Erwähnungen nicht möglich */}
      {directoryWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setDirectoryWarning(null)}>
          <div className={`max-w-md w-full rounded-xl border p-6 ${isDark ? 'border-amber-500/30 bg-[#16171a]' : 'border-amber-300 bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <h3 className={`flex items-center gap-2 text-sm font-semibold mb-2 ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
              <AlertTriangle size={14} /> Entra-Benutzersuche nicht verfügbar
            </h3>
            <p className={`text-xs leading-relaxed mb-2 ${isDark ? 'text-white/80' : 'text-black/80'}`}>{directoryWarning.message}</p>
            <p className={`text-[11px] leading-relaxed mb-5 ${textMuted}`}>
              Bis dahin schlägt «@» nur Personen vor, die in diesem Ordner schon gearbeitet oder kommentiert haben.
              {directoryWarning.reason === 'consent' && ' Beim Erteilen lädt die Seite neu — ein angefangener Kommentar geht verloren.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDirectoryWarning(null)}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                Verstanden
              </button>
              {directoryWarning.reason === 'consent' && (
                <button onClick={() => void requestDirectoryConsent()}
                  className={`flex-1 text-xs py-2 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                  Berechtigung erteilen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Konfliktdialog */}
      {conflict && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
          <div className={`max-w-md w-full rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}>
            <p className={`text-xs leading-relaxed mb-5 ${isDark ? 'text-white/80' : 'text-black/80'}`}>
              Die Projektdatei wurde inzwischen geändert (z. B. in einem anderen Fenster oder von einem Teammitglied).
              Überschreiben — oder neu laden und die eigenen Änderungen verwerfen?
            </p>
            <div className="flex gap-2">
              <button onClick={() => reload()}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                Neu laden
              </button>
              <button onClick={() => save(true)}
                className={`flex-1 text-xs py-2 rounded font-semibold transition-colors ${isDark ? 'bg-rose-500/80 text-white hover:bg-rose-500' : 'bg-rose-600 text-white hover:bg-rose-700'}`}>
                Überschreiben
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-50 text-[11px] px-3 py-2 rounded border shadow-lg ${isDark ? 'bg-[#16171a] border-white/15 text-white/80' : 'bg-white border-black/15 text-black/80'}`}>
          {toast}
        </div>
      )}
    </div>

    {/* Kommentar-Panel: Faden der aktiven Stelle bzw. Übersicht; bleibt beim Scrollen stehen */}
    {commentsOpen && (
      <CommentsPanel isDark={isDark} comments={comments} targets={commentTargets()}
        users={mentionUsers} searchUsers={searchDirectory} onDirectoryProblem={onDirectoryProblem} initialsFor={initialsFor}
        active={commentTarget} showResolved={showResolved} onToggleResolved={setShowResolved}
        onSelect={openCommentTarget} onClose={() => setCommentsOpen(false)}
        canComment={canView} author={commentAuthor}
        canDelete={c => canEdit || (!!commentAuthor && (commentAuthor.email
          ? (c.author.email ?? '').toLowerCase() === commentAuthor.email.toLowerCase()
          : c.author.name === commentAuthor.name))}
        {...(authUser ? {} : { askName: { value: commentName, onChange: setCommentNameStored } })}
        onAdd={addComment} onResolve={resolveComment} onDelete={deleteComment} />
    )}
    </div>
  );
}
