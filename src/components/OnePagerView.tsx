import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ClipboardPaste, Copy, FileUp, Info, Mail, Minus, Plus, Save, X } from 'lucide-react';
import { marked } from 'marked';
import { useStore } from '../store';
import { MILESTONES, MILESTONE_TITLES, Project, Question, QuestionAnswer, Review, Theme } from '../types';
import { deriveStatus, emptyReview, getMilestoneReview, getThemeReview, STATUS_META } from '../status';
import { applyMs10, extractPdfText, hasMs10Data, Ms10Data, MS10_FIELD_LABELS, parseMs10Text } from '../ms10';
import { DEFAULT_MODEL } from '../defaultModel';
import { fmtTimestamp, nowIsoWithTimezone } from '../util';

const FOUNDATION_MS = MILESTONES[0]; // M10

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
  const { isDark, model, loadProject, saveProject } = useStore();
  const [proj, setProj] = useState<Project | null>(null);
  const [baseline, setBaseline] = useState('');
  const [lastModified, setLastModified] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [toast, setToast] = useState('');
  const [importData, setImportData] = useState<Ms10Data | null>(null);
  const [infoTheme, setInfoTheme] = useState<Theme | null>(null);
  const [showClassInfo, setShowClassInfo] = useState(false);
  const [exportMs, setExportMs] = useState<string | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const [answersMs, setAnswersMs] = useState<string | null>(null);
  const [answersText, setAnswersText] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // "M10:themeId"
  const [openRemarks, setOpenRemarks] = useState<Set<string>>(new Set()); // "themeId:frageId"
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const syncRef = useRef<(p: Project) => Project>(p => p);

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
    setLastModified(res.lastModified);
    setNotFound(false);
    setConflict(false);
  }, [loadProject, slug]);

  useEffect(() => { reload(); }, [reload]);

  const dirty = proj != null && JSON.stringify(proj) !== baseline;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const back = async () => {
    if (dirty) {
      const res = await saveRef.current();
      if (res !== 'saved') return;
    }
    onBack();
  };

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

  const setField = <K extends keyof Project>(k: K, v: Project[K]) =>
    setProj(p => (p ? { ...p, [k]: v } : p));

  // ── Stammdaten-Zugriffe ───────────────────────────────────────────────────
  const themes = model?.themes?.length ? model.themes : DEFAULT_MODEL.themes;
  const allQuestions = model?.questions?.length ? model.questions : DEFAULT_MODEL.questions;

  // Gilt die Frage für die Prüftiefe des Projekts? (kumulativ: «ab M» usw.;
  // ohne minDepth oder solange die Prüftiefe offen ist, gilt sie immer)
  const depthOk = (p: Project, q: Question): boolean => {
    if (!q.minDepth || !p.reviewDepth || !model) return true;
    const order = model.reviewDepths.map(d => d.id);
    return order.indexOf(p.reviewDepth) >= order.indexOf(q.minDepth);
  };

  // Fragen eines Themas in einem Meilenstein, mit automatischer Nummer M10F1 …
  // Die Nummern werden über den vollen Katalog vergeben und bleiben damit
  // stabil, auch wenn die Prüftiefe einzelne Fragen ausblendet (Lücken).
  const questionsAt = (themeId: string, ms: string, p: Project | null = proj): { q: Question; number: string }[] =>
    allQuestions
      .filter(q => q.themeId === themeId && q.milestone === ms)
      .map((q, i) => ({ q, number: `${ms}F${i + 1}` }))
      .filter(({ q }) => q.enabled !== false && (!p || depthOk(p, q)));

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
    return { ...p, reviews, architectureRelevant: arch };
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
    if (!proj || savingRef.current) return 'skipped';
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const data: Project = { ...proj, updatedAt: nowIsoWithTimezone() };
      const res = await saveProject(data, force ? null : lastModified);
      if (res.status === 'saved') {
        setProj(data);
        setBaseline(JSON.stringify(data));
        setLastModified(res.lastModified);
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
    if (!dirty || conflict || saveError || saving) return;
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
    setProj(applyMs10(proj, importData, model));
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
  const questionBlock = (themeId: string, question: Question, number: string, disabled: boolean) => {
    const r = getThemeReview(proj, themeId);
    const answer: QuestionAnswer = { value: null, remarks: '', ...r.answers?.[question.id] };
    const remarksKey = `${themeId}:${question.id}`;
    const remarksOpen = answer.remarks.trim() !== '' || openRemarks.has(remarksKey);
    return (
      <div key={question.id}>
        <p className={`text-[11px] font-semibold ${isDark ? 'text-white/80' : 'text-black/80'}`}>
          {number} {question.text}
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
              <textarea value={answer.remarks} rows={2} autoFocus={!answer.remarks} disabled={disabled}
                onChange={e => updateAnswer(themeId, question.id, { remarks: e.target.value })}
                onBlur={() => { if (!answer.remarks.trim()) toggleRemarks(remarksKey, false); }}
                placeholder={question.kind === 'text' ? 'Antwort / Bemerkungen' : 'Bemerkungen'}
                className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y transition-colors disabled:opacity-50 ${inputCls}`} />
            </div>
          )}
        </div>
        {question.hint && (
          <p className={`text-[10px] italic mt-0.5 ${textMuted}`}>{question.hint}</p>
        )}
        <p className={`text-[10px] mt-0.5 ${textMuted}`}>
          Quelle: {question.source ?? (model?.company ?? DEFAULT_MODEL.company ?? 'Eigene Firma')}
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

  // Ausgefüllten Export-Text wieder einlesen: erkennt Themen-Header,
  // Fragenummern (M20F3 …), angekreuzte [X] Ja/[X] Nein, Auswahl-Antworten
  // und Bemerkungen (auch mehrzeilig).
  type ImportItem = { themeId: string; q: Question; number: string; patch: Partial<QuestionAnswer>; summary: string };

  const parseAnswersImport = (ms: string, text: string): ImportItem[] => {
    const themeByTitle = new Map<string, string>();
    themes.forEach(t => themeByTitle.set(t.title.trim().toLowerCase(), t.id));
    const numberMap = new Map<string, Map<string, Question>>();
    for (const t of themes) {
      const m = new Map<string, Question>();
      allQuestions
        .filter(q => q.themeId === t.id && q.milestone === ms)
        .forEach((q, i) => m.set(`${ms}F${i + 1}`, q));
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
      const qm = line.match(/^(M\d+F\d+)\b\s*(.*)/);
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
  };

  // Kopfbereich eines Meilenstein-Blocks
  const milestoneHeader = (opts: {
    chipLabel: string;
    chipValue: boolean | null;
    review: Review;
    update: (patch: Partial<Review>) => void;
  }) => {
    const notesEmpty = String(opts.review.notes ?? '').trim() === '';
    return (
      <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(280px,auto)_1fr] gap-x-6 gap-y-3 items-stretch">
        <div className="space-y-3">
          <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-white/70' : 'text-black/70'}`}>
            {opts.chipLabel} {derivedChip(opts.chipValue)}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${isDark ? 'text-white/70' : 'text-black/70'}`}>
              <input type="checkbox" checked={opts.review.approved === true}
                onChange={e => opts.update({ reviewed: e.target.checked, approved: e.target.checked })}
                className="accent-blue-500 cursor-pointer" />
              Geprüft und freigegeben
            </label>
            <input value={String(opts.review.approvedBy ?? '')} placeholder="Prüfer/in"
              onChange={e => opts.update({ approvedBy: e.target.value })}
              className={`text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
          </div>
        </div>
        <textarea value={opts.review.notes} required rows={3}
          onChange={e => opts.update({ notes: e.target.value })}
          onInput={e => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = `${t.scrollHeight}px`;
          }}
          placeholder="Bemerkungen (erforderlich)"
          className={`w-full h-full min-h-[76px] text-[11px] px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors ${inputCls} ${
            notesEmpty ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''
          }`} />
      </div>
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto pb-24">
      {/* Kopfzeile */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={back} className={`flex items-center gap-1.5 text-xs ${textMuted} hover:opacity-70`}>
          <ArrowLeft size={12} /> Projekte
        </button>
        <div className={`text-[11px] ${textMuted}`}>Stand: {fmtTimestamp(proj.updatedAt)}</div>
      </div>

      {/* Kopf: Projektangaben */}
      <div className={`${cardCls} p-4 mb-4`}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>
            {proj.name || proj.slug}
            {typeof proj.projectNumber === 'string' && proj.projectNumber && (
              <span className={`ml-2 text-[11px] font-normal ${textMuted}`}>{proj.projectNumber}</span>
            )}
          </h2>
          <div className="flex items-center gap-3">
            <button onClick={() => fileRef.current?.click()}
              title="Felder aus einem MS10-Antrags-PDF übernehmen"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
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
        <div className="mb-3">
          <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Beschrieb</label>
          <textarea value={proj.description ?? ''} rows={3}
            onChange={e => setField('description', e.target.value)}
            placeholder="Ausgangslage / Motivation — z. B. per MS10-Import übernehmen"
            className={`w-full text-xs px-3 py-2 rounded border outline-none resize-y transition-colors ${inputCls}`} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Verantwortlich Projekt</label>
            <input value={proj.responsibleProject} onChange={e => setField('responsibleProject', e.target.value)}
              className={`w-full text-xs px-3 py-2 rounded border outline-none transition-colors ${inputCls}`} />
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Verantwortlich Architektur</label>
            <input value={proj.responsibleArchitecture} onChange={e => setField('responsibleArchitecture', e.target.value)}
              className={`w-full text-xs px-3 py-2 rounded border outline-none transition-colors ${inputCls}`} />
          </div>
          <div>
            <label className={`flex items-center gap-1 text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>
              Klassifikation & Prüftiefe
              <button onClick={() => setShowClassInfo(true)} title="Was bedeutet die Klassifikation?"
                className={`p-0.5 rounded transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <Info size={11} />
              </button>
            </label>
            <select value={proj.classification ?? ''}
              onChange={e => {
                // Klassifikation setzt die zugeordnete Prüftiefe gleich mit;
                // die Prüftiefe filtert den Fragenkatalog → Ableitungen nachziehen
                const id = e.target.value || null;
                const cls = model.classifications.find(c => c.id === id);
                setProj(p => (p ? syncDerived({
                  ...p,
                  classification: id,
                  reviewDepth: id ? (cls?.reviewDepth ?? p.reviewDepth) : null,
                }) : p));
              }}
              className={`w-full text-xs px-2 py-2 rounded border outline-none transition-colors ${inputCls}`}>
              <option value="">– noch offen –</option>
              {model.classifications.map(c => {
                const d = model.reviewDepths.find(x => x.id === c.reviewDepth);
                return (
                  <option key={c.id} value={c.id}>
                    {c.label}{d ? ` → Prüftiefe ${d.label} · ${d.personDays} PT` : ''}
                  </option>
                );
              })}
            </select>
            {proj.reviewDepth && (
              <p className={`text-[10px] mt-1 ${textMuted}`}>
                Prüftiefe: {(() => {
                  const d = model.reviewDepths.find(x => x.id === proj.reviewDepth);
                  return d ? `${d.label} · ${d.personDays} PT` : proj.reviewDepth;
                })()} — Fragen mit höherer Mindest-Prüftiefe sind ausgeblendet
              </p>
            )}
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
            <button onClick={() => { setExportMs(FOUNDATION_MS); setExportCopied(false); }}
              title="Offene Fragen als E-Mail-Text exportieren"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
              <Mail size={11} /> Offene Fragen
            </button>
            <button onClick={() => { setAnswersMs(FOUNDATION_MS); setAnswersText(''); }}
              title="Ausgefüllten E-Mail-Text einlesen und Antworten übernehmen"
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
              <ClipboardPaste size={11} /> Antworten importieren
            </button>
          </div>
        </div>
        {milestoneHeader({
          chipLabel: 'Architekturrelevant',
          chipValue: proj.architectureRelevant,
          review: getMilestoneReview(proj, FOUNDATION_MS),
          update: patch => updateMilestoneReview(FOUNDATION_MS, patch),
        })}
        <div className={`px-4 py-3 border-t ${border}`}>
          <p className={`text-[10px] uppercase tracking-wider mb-2 ${labelCls}`}>
            Fragen zur Relevanz ({FOUNDATION_MS}) — je Thema
          </p>
          {questionSection(FOUNDATION_MS)}
        </div>
      </div>

      {/* Meilensteine nach der Foundation: jeder Block erscheint, sobald der
          vorherige freigegeben ist — und nur solange die Architekturrelevanz
          nicht Nein ist. */}
      {proj.architectureRelevant !== false && (() => {
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
                  <button onClick={() => { setExportMs(ms); setExportCopied(false); }}
                    title="Offene Fragen als E-Mail-Text exportieren"
                    className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    <Mail size={11} /> Offene Fragen
                  </button>
                  <button onClick={() => { setAnswersMs(ms); setAnswersText(''); }}
                    title="Ausgefüllten E-Mail-Text einlesen und Antworten übernehmen"
                    className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                    <ClipboardPaste size={11} /> Antworten importieren
                  </button>
                </div>
              </div>
              {milestoneHeader({
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

      {/* Speicherleiste */}
      <div className={`fixed bottom-0 left-0 right-0 border-t ${border} ${isDark ? 'bg-[#0c0d0f]/95' : 'bg-[#eae9e5]/95'} backdrop-blur px-6 py-3`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className={`text-[11px] ${textMuted}`}>
            {saveError
              ? <span className={isDark ? 'text-rose-400' : 'text-rose-600'}>{saveError}</span>
              : saving
                ? 'Speichert …'
                : dirty
                  ? 'Ungespeicherte Änderungen'
                  : lastSavedAt
                    ? <span className={isDark ? 'text-emerald-400' : 'text-emerald-600'}>Automatisch gespeichert ✓ {lastSavedAt}</span>
                    : 'Keine Änderungen'}
          </div>
          <button onClick={() => save()} disabled={!dirty || saving}
            className={`flex items-center gap-1.5 text-xs px-4 py-2 rounded font-semibold transition-colors disabled:opacity-40 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
            <Save size={12} /> Speichern
          </button>
        </div>
      </div>

      {/* Import: ausgefüllte Antworten aus E-Mail-Text übernehmen */}
      {answersMs && (() => {
        const items = parseAnswersImport(answersMs, answersText);
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
                Auswahl-Antworten und Bemerkungen.
              </p>
              <textarea value={answersText} autoFocus rows={10}
                onChange={e => setAnswersText(e.target.value)}
                placeholder={'M20F2 Bleiben die Daten dort liegen (nicht nur Anzeige)?\n[X] Ja    [ ] Nein\nBemerkung: bleibt in der neuen Core-DB'}
                className={`w-full text-[11px] leading-relaxed px-3 py-2 rounded border outline-none resize-y font-mono ${inputCls}`} />
              <div className={`mt-3 text-[11px] ${textMuted}`}>
                {answersText.trim() === ''
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
        const { text, count } = buildExport(exportMs);
        const subject = `Architekturprüfung «${proj.name || proj.slug}» — offene Fragen ${exportMs}`;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setExportMs(null)}>
            <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>
                  Offene Fragen {exportMs}
                  <span className={`ml-2 text-[11px] font-normal ${textMuted}`}>
                    {count} {count === 1 ? 'Frage' : 'Fragen'}
                  </span>
                </h3>
                <button onClick={() => setExportMs(null)}
                  className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                  <X size={14} />
                </button>
              </div>
              {count === 0 ? (
                <p className={`text-xs ${textMuted}`}>Alle Fragen dieses Meilensteins sind beantwortet — nichts zu verschicken.</p>
              ) : (
                <>
                  <textarea readOnly value={text}
                    onFocus={e => e.currentTarget.select()}
                    className={`w-full flex-1 min-h-[280px] text-[11px] leading-relaxed px-3 py-2 rounded border outline-none resize-none font-mono ${inputCls}`} />
                  <div className="flex gap-2 pt-4">
                    <button
                      onClick={async () => {
                        let ok = false;
                        try {
                          // writeText kann in restriktiven Umgebungen hängen → Timeout
                          await Promise.race([
                            navigator.clipboard.writeText(text),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800)),
                          ]);
                          ok = true;
                        } catch {
                          // Fallback für Umgebungen ohne Clipboard-Berechtigung
                          const ta = document.createElement('textarea');
                          ta.value = text;
                          ta.style.position = 'fixed';
                          ta.style.opacity = '0';
                          document.body.appendChild(ta);
                          ta.select();
                          ok = document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                        if (ok) {
                          setExportCopied(true);
                          setTimeout(() => setExportCopied(false), 2000);
                        } else {
                          showToast('Kopieren fehlgeschlagen — Text im Feld markieren und mit Ctrl/Cmd+C kopieren.');
                        }
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
                      <Copy size={12} /> {exportCopied ? '✓ Kopiert' : 'Kopieren'}
                    </button>
                    <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                      <Mail size={12} /> E-Mail-Entwurf öffnen
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Info: Klassifikation & Prüftiefe (Markdown) */}
      {showClassInfo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setShowClassInfo(false)}>
          <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>Klassifikation & Prüftiefe</h3>
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
  );
}
