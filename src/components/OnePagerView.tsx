import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileText, FileUp, Info, Minus, Plus, Save, ClipboardCopy, ExternalLink, X } from 'lucide-react';
import { marked } from 'marked';
import { useStore } from '../store';
import { FactsheetDef, Project, QuestionAnswer, Review, ReviewResult } from '../types';
import { defaultReview, deriveStatus, effectiveResult, getReview, RESULT_LABELS, STATUS_META } from '../status';
import { applyMs10, extractPdfText, hasMs10Data, Ms10Data, MS10_FIELD_LABELS, parseMs10Text } from '../ms10';
import { DocxResult, loadDocxHtml } from '../docx';
import { DEFAULT_MODEL } from '../defaultModel';
import { basename, fmtTimestamp, nowIsoWithTimezone } from '../util';

// ── kleine Bausteine ────────────────────────────────────────────────────────

function StatusBadge({ status, isDark }: { status: keyof typeof STATUS_META; isDark: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${isDark ? meta.dark : meta.light}`}>
      {meta.label}
    </span>
  );
}

function relevantText(v: boolean | null): string {
  return v === true ? 'Ja' : v === false ? 'Nein' : 'offen';
}

// ── Hauptansicht ────────────────────────────────────────────────────────────

export default function OnePagerView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { isDark, model, loadProject, saveProject, dirHandle } = useStore();
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
  const [infoDef, setInfoDef] = useState<FactsheetDef | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Record<string, DocxResult | 'loading'>>({});
  const [openRemarks, setOpenRemarks] = useState<Set<string>>(new Set()); // "factsheetId:frageId"
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const syncRef = useRef<(p: Project) => Project>(p => p); // zeigt auf syncDerived

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

  // Warnung beim Verlassen mit ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // Beim Zurücknavigieren ausstehende Änderungen noch wegschreiben;
  // bei Konflikt oder Fehler auf der Seite bleiben (Dialog/Meldung sichtbar).
  const back = async () => {
    if (dirty) {
      const res = await saveRef.current();
      if (res !== 'saved') return;
    }
    onBack();
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setToast('Pfad kopiert – im Finder/Explorer öffnen');
    } catch {
      setToast('Kopieren fehlgeschlagen');
    }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

  const setField = <K extends keyof Project>(k: K, v: Project[K]) =>
    setProj(p => (p ? { ...p, [k]: v } : p));

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

  // MS10-PDF wählen → parsen → Vorschau-Dialog
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

  const foundationMs = model?.factsheets.find(f => f.id === 'foundation')?.milestone
    ?? model?.milestones[0] ?? 'MS10';

  // Prüffragen des Factsheets: aus model.json; fehlen sie dort, aus dem
  // Standard-Katalog (Fallback für ältere model.json-Dateien).
  const effectiveQuestionSrc = (def: FactsheetDef) =>
    def.questions?.length ? def : DEFAULT_MODEL.factsheets.find(f => f.id === def.id);

  // Fragen eines Themas für einen Meilenstein (Default-Meilenstein: der des Factsheets)
  const questionsAt = (def: FactsheetDef, ms: string) => {
    const src = effectiveQuestionSrc(def);
    return (src?.questions ?? []).filter(q => (q.milestone ?? def.milestone) === ms);
  };

  // Fragen fürs Zeilen-Panel: alles ausser den MS10-Relevanzfragen
  const laterQuestions = (def: FactsheetDef) => {
    const src = effectiveQuestionSrc(def);
    return (src?.questions ?? []).filter(q => (q.milestone ?? def.milestone) !== foundationMs);
  };

  const questionsTitleOf = (def: FactsheetDef) => effectiveQuestionSrc(def)?.questionsTitle;

  // Thema relevant, abgeleitet aus den MS10-Fragen:
  // eine Frage offen → Offen; eine mit Ja → Ja; sonst Nein.
  // undefined = keine MS10-Fragen vorhanden → Relevanz bleibt manuell.
  const derivedRelevant = (p: Project, def: FactsheetDef): boolean | null | undefined => {
    const qs = questionsAt(def, foundationMs).filter(q => q.kind !== 'text');
    if (!qs.length) return undefined;
    const answers = getReview(p, def).answers ?? {};
    const vals = qs.map(q => answers[q.id]?.value ?? null);
    if (vals.some(v => v === null)) return null;
    return vals.some(v => v === true);
  };

  // Abgeleitete Werte in den Projektzustand übernehmen (Thema-Relevanz und
  // «Projekt architekturrelevant»); so bleiben Datei und Statusableitung konsistent.
  const syncDerived = (p: Project): Project => {
    if (!model) return p;
    const reviews = { ...p.reviews };
    const rels: (boolean | null)[] = [];
    for (const def of model.factsheets) {
      if (def.id === 'foundation') continue;
      const rel = derivedRelevant(p, def);
      // Themen ohne MS10-Fragen (spätere Meilensteine) zählen nicht für die
      // Architekturrelevanz; ihre Relevanz bleibt manuell.
      if (rel === undefined) continue;
      reviews[def.id] = { ...defaultReview(def), ...(reviews[def.id] ?? {}), relevant: rel };
      rels.push(rel);
    }
    const arch = rels.length === 0
      ? p.architectureRelevant
      : rels.some(v => v === null) ? null : rels.some(v => v === true);
    return { ...p, reviews, architectureRelevant: arch };
  };
  syncRef.current = syncDerived;

  // Factsheet-Panel auf-/zuklappen; ohne Fragen wird das Word-Dokument geladen
  const toggleExpand = (def: FactsheetDef) => {
    const willExpand = !expanded.has(def.id);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(def.id)) next.delete(def.id);
      else next.add(def.id);
      return next;
    });
    if (willExpand && laterQuestions(def).length === 0 && !docs[def.id]) {
      if (!dirHandle) {
        setDocs(d => ({ ...d, [def.id]: { status: 'notFound' } }));
        return;
      }
      setDocs(d => ({ ...d, [def.id]: 'loading' }));
      loadDocxHtml(dirHandle, def.factsheetDoc).then(res =>
        setDocs(d => ({ ...d, [def.id]: res })));
    }
  };

  const updateReview = (def: FactsheetDef, patch: Partial<Review>) =>
    setProj(p => {
      if (!p) return p;
      const merged = { ...defaultReview(def), ...(p.reviews?.[def.id] ?? {}), ...patch };
      return { ...p, reviews: { ...p.reviews, [def.id]: merged } };
    });

  // Antwort auf eine Prüffrage nachführen; abgeleitete Relevanz und
  // Architekturrelevanz gleich mitziehen (wird via Autosave gespeichert)
  const updateAnswer = (def: FactsheetDef, questionId: string, patch: Partial<QuestionAnswer>) =>
    setProj(p => {
      if (!p) return p;
      const review = { ...defaultReview(def), ...(p.reviews?.[def.id] ?? {}) };
      const answers = { ...(review.answers ?? {}) };
      const existing: QuestionAnswer = answers[questionId] ?? { value: null, remarks: '' };
      answers[questionId] = { ...existing, ...patch };
      return syncDerived({ ...p, reviews: { ...p.reviews, [def.id]: { ...review, answers } } });
    });

  const toggleRemarks = (key: string, open: boolean) =>
    setOpenRemarks(prev => {
      const next = new Set(prev);
      if (open) next.add(key); else next.delete(key);
      return next;
    });

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

  // Autosave: kurz nach der letzten Änderung automatisch speichern.
  // Bei Konflikt oder Fehler pausieren, bis der Benutzer entschieden hat.
  useEffect(() => {
    if (!dirty || conflict || saveError || saving) return;
    const t = setTimeout(() => { saveRef.current(); }, 1200);
    return () => clearTimeout(t);
  }, [proj, dirty, conflict, saveError, saving]);

  const factsheets = useMemo(() => model?.factsheets ?? [], [model]);
  const foundationDef = factsheets.find(f => f.id === 'foundation') ?? null;
  const otherDefs = factsheets.filter(f => f.id !== 'foundation');

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

  const status = deriveStatus(proj, factsheets);
  const gateClosed = proj.architectureRelevant === false;
  const evidencePath = (def: FactsheetDef) => def.evidenceDoc.replaceAll('{slug}', proj.slug);

  // Abgeleiteter Wert als schreibgeschützte Anzeige (Ja / Nein / Offen)
  const derivedChip = (value: boolean | null) => {
    const label = value === true ? 'Ja' : value === false ? 'Nein' : 'Offen';
    const cls = value === true
      ? isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-300'
      : value === false
        ? isDark ? 'bg-white/8 text-white/50 border-white/15' : 'bg-black/5 text-black/50 border-black/15'
        : isDark ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-300';
    return <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>{label}</span>;
  };

  // Eine Prüffrage mit Ja/Nein-Checkboxen und aufklappbaren Bemerkungen
  const questionBlock = (def: FactsheetDef, question: NonNullable<FactsheetDef['questions']>[number], disabled: boolean) => {
    const r = getReview(proj, def);
    const answer: QuestionAnswer = { value: null, remarks: '', ...r.answers?.[question.id] };
    const remarksKey = `${def.id}:${question.id}`;
    const remarksOpen = answer.remarks.trim() !== '' || openRemarks.has(remarksKey);
    return (
      <div key={question.id}>
        <p className={`text-[11px] font-semibold ${isDark ? 'text-white/80' : 'text-black/80'}`}>
          {question.id} {question.text}
        </p>
        <div className={`text-[11px] mt-1 flex items-start gap-5 flex-wrap ${textMuted}`}>
          {question.kind !== 'text' && (
            <>
              <label className={`flex items-center gap-1.5 ${disabled ? '' : 'cursor-pointer'}`}>
                <input type="checkbox" disabled={disabled} checked={answer.value === true}
                  onChange={() => updateAnswer(def, question.id, { value: answer.value === true ? null : true })}
                  className="accent-blue-500" />
                Ja
              </label>
              <label className={`flex items-center gap-1.5 ${disabled ? '' : 'cursor-pointer'}`}>
                <input type="checkbox" disabled={disabled} checked={answer.value === false}
                  onChange={() => updateAnswer(def, question.id, { value: answer.value === false ? null : false })}
                  className="accent-blue-500" />
                Nein
              </label>
            </>
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
                onChange={e => updateAnswer(def, question.id, { remarks: e.target.value })}
                onBlur={() => { if (!answer.remarks.trim()) toggleRemarks(remarksKey, false); }}
                placeholder={question.kind === 'text' ? 'Antwort / Bemerkungen' : 'Bemerkungen'}
                className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y transition-colors disabled:opacity-50 ${inputCls}`} />
            </div>
          )}
        </div>
        {question.hint && (
          <p className={`text-[10px] italic mt-0.5 ${textMuted}`}>{question.hint}</p>
        )}
      </div>
    );
  };

  // Zeile einer Prüfungstabelle (auch für Foundation verwendet)
  const reviewRow = (def: FactsheetDef, opts: { fixedRelevant?: boolean } = {}) => {
    const r = getReview(proj, def);
    const disabled = !opts.fixedRelevant && r.relevant === false;
    const rowMuted = disabled ? 'opacity-40' : '';
    const unconfirmed = !r.reviewed && r.result != null;
    const isExpanded = expanded.has(def.id);
    const doc = docs[def.id];
    return (
      <div key={def.id} className={`border-t ${border}`}>
      <div className={`grid grid-cols-[minmax(180px,1.6fr)_64px_60px_150px_92px_minmax(150px,1.4fr)] gap-3 items-start px-4 py-3 ${rowMuted}`}>
        {/* Factsheet (+/− = Panel, Link = Pfad kopieren, Info-Icon = Dialog) */}
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <button onClick={() => toggleExpand(def)} title={isExpanded ? 'Factsheet zuklappen' : 'Factsheet anzeigen'}
              className={`p-0.5 rounded flex-shrink-0 border transition-colors ${isDark ? 'border-white/15 text-white/40 hover:text-white/80 hover:border-white/30' : 'border-black/15 text-black/40 hover:text-black/80 hover:border-black/30'}`}>
              {isExpanded ? <Minus size={10} /> : <Plus size={10} />}
            </button>
            <button onClick={() => copyPath(def.factsheetDoc)} title={`${def.factsheetDoc}\nKlick: Pfad kopieren`}
              className={`flex items-center gap-1.5 text-xs text-left min-w-0 hover:underline underline-offset-2 ${isDark ? 'text-white' : 'text-black'}`}>
              <FileText size={12} className="flex-shrink-0" />
              <span className="truncate">{def.name}</span>
            </button>
            <button onClick={() => setInfoDef(def)} title={`Details zu «${def.name}»`}
              className={`p-0.5 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
              <Info size={11} />
            </button>
          </div>
          <div className={`text-[10px] mt-0.5 flex items-center gap-1.5 flex-wrap ${textMuted}`}>
            {def.external && (
              <span className={`px-1.5 rounded-full border ${isDark ? 'border-white/15' : 'border-black/15'}`} title="Erstellung/Prüfung durch zuständige Stelle">extern</span>
            )}
            {def.hint && <span>{def.hint}</span>}
          </div>
        </div>

        {/* relevant: abgeleitet aus der Foundation-Prüfung (Anzeige);
            Themen ohne MS10-Fragen bleiben manuell schaltbar */}
        <div className={`text-[11px] pt-0.5 ${textMuted}`}>
          {opts.fixedRelevant
            ? 'immer'
            : derivedRelevant(proj, def) !== undefined
              ? relevantText(r.relevant)
              : (
                <select value={r.relevant === null ? '' : String(r.relevant)}
                  onChange={e => updateReview(def, { relevant: e.target.value === '' ? null : e.target.value === 'true' })}
                  title="Relevanz (manuell — keine MS10-Fragen vorhanden)"
                  className={`w-full text-[10px] px-1 py-1 rounded border outline-none transition-colors ${inputCls}`}>
                  <option value="">offen</option>
                  <option value="true">Ja</option>
                  <option value="false">Nein</option>
                </select>
              )}
        </div>

        {/* geprüft */}
        <div className="pt-0.5">
          <input type="checkbox" checked={r.reviewed} disabled={disabled}
            onChange={e => updateReview(def, { reviewed: e.target.checked })}
            className="accent-blue-500 cursor-pointer disabled:cursor-default" />
        </div>

        {/* Ergebnis — nur editierbar, wenn geprüft */}
        <div>
          <select value={r.reviewed ? (r.result ?? '') : ''} disabled={disabled || !r.reviewed}
            onChange={e => updateReview(def, { result: (e.target.value || null) as ReviewResult | null })}
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none transition-colors disabled:opacity-50 ${inputCls}`}>
            <option value="">–</option>
            {(Object.keys(RESULT_LABELS) as ReviewResult[]).map(k => (
              <option key={k} value={k}>{RESULT_LABELS[k]}</option>
            ))}
          </select>
          {unconfirmed && (
            <div className={`text-[10px] mt-1 ${textMuted}`} title="Ergebnis bleibt gespeichert, zählt aber erst wieder mit «geprüft»">
              «{RESULT_LABELS[r.result as ReviewResult]}» noch nicht bestätigt
            </div>
          )}
        </div>

        {/* Nachweis (Link = Pfad kopieren) */}
        <div className="min-w-0">
          <button onClick={() => copyPath(evidencePath(def))} disabled={disabled}
            title={`${evidencePath(def)}\nKlick: Pfad kopieren`}
            className={`flex items-center gap-1 text-[10px] max-w-full hover:underline underline-offset-2 ${textMuted}`}>
            <ClipboardCopy size={10} className="flex-shrink-0" />
            <span className="truncate">{basename(evidencePath(def))}</span>
          </button>
        </div>

        {/* Risiken, Conditions, offene Punkte */}
        <textarea value={r.notes} disabled={disabled} rows={2}
          onChange={e => updateReview(def, { notes: e.target.value })}
          placeholder="Risiken, Conditions, offene Punkte"
          className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y transition-colors disabled:opacity-50 ${inputCls}`} />
      </div>

      {/* Ausklapp-Panel: Prüffragen zur Erklärung; ohne Fragen das Word-Dokument */}
      {isExpanded && (
        <div className="px-4 pb-4">
          <div className={`rounded-lg border px-4 py-3 max-h-96 overflow-y-auto ${isDark ? 'border-white/10 bg-white/3 text-white/75' : 'border-black/10 bg-white text-black/75'}`}>
            {(() => {
              // Fragen der weiteren Meilensteine (MS10-Relevanzfragen stehen im Foundation-Block)
              const qs = laterQuestions(def);
              if (qs.length) {
                return (
                  <div className="space-y-3">
                    {qs.map(question => questionBlock(def, question, disabled))}
                  </div>
                );
              }
              if (!doc || doc === 'loading') return <p className={`text-[11px] ${textMuted}`}>Lade Factsheet …</p>;
              if (doc.status === 'ok') return <div className="docx-content" dangerouslySetInnerHTML={{ __html: doc.html }} />;
              if (doc.status === 'notFound') {
                return <p className={`text-[11px] ${textMuted}`}>Dokument nicht gefunden: {def.factsheetDoc}</p>;
              }
              return (
                <p className={`text-[11px] ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                  Dokument konnte nicht gelesen werden.
                </p>
              );
            })()}
          </div>
        </div>
      )}
      </div>
    );
  };

  const tableHeader = (
    <div className={`grid grid-cols-[minmax(180px,1.6fr)_64px_60px_150px_92px_minmax(150px,1.4fr)] gap-3 px-4 pt-3 pb-2 text-[10px] uppercase tracking-wider ${labelCls}`}>
      <span>Factsheet</span><span>Relevant</span><span>Geprüft</span><span>Ergebnis</span><span>Nachweis</span><span>Risiken / Conditions</span>
    </div>
  );

  const milestoneOf = (def: FactsheetDef) => getReview(proj, def).milestone || def.milestone;

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Klassifikation</label>
            <select value={proj.classification ?? ''} onChange={e => setField('classification', e.target.value || null)}
              className={`w-full text-xs px-2 py-2 rounded border outline-none transition-colors ${inputCls}`}>
              <option value="">– noch offen –</option>
              {model.classifications.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Prüftiefe</label>
            <select value={proj.reviewDepth ?? ''} onChange={e => setField('reviewDepth', e.target.value || null)}
              className={`w-full text-xs px-2 py-2 rounded border outline-none transition-colors ${inputCls}`}>
              <option value="">– noch offen –</option>
              {model.reviewDepths.map(d => <option key={d.id} value={d.id}>{d.label} · {d.personDays} PT</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Foundation-Block (MS10) */}
      <div className={`${cardCls} mb-4`}>
        <div className="px-4 pt-3 flex items-center justify-between">
          <h3 className={`text-[11px] font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>
            {foundationDef?.milestone ?? 'MS10'} · Foundation-Prüfung
          </h3>
        </div>

        {foundationDef && (
          <div className="mt-1">
            {tableHeader}
            {reviewRow(foundationDef, { fixedRelevant: true })}
          </div>
        )}

        {/* Fragen je Thema — editierbar, bestimmen die Relevanz.
            Nur Themen mit Fragen zum Foundation-Meilenstein; Titelzeile zeigt
            den abgeleiteten Relevanz-Chip direkt an. */}
        {otherDefs.length > 0 && (
          <div className={`px-4 py-3 border-t ${border}`}>
            <p className={`text-[10px] uppercase tracking-wider mb-2 ${labelCls}`}>
              Fragen zur Relevanz ({foundationMs}) — je Thema
            </p>
            <div className="space-y-4">
              {otherDefs.map(def => {
                const qs = questionsAt(def, foundationMs);
                if (qs.length === 0) return null;
                const answers = getReview(proj, def).answers ?? {};
                const yesNoQs = qs.filter(q => q.kind !== 'text');
                const answered = yesNoQs.filter(q => (answers[q.id]?.value ?? null) !== null).length;
                return (
                  <div key={def.id}>
                    <div className={`flex items-center gap-2 py-1 ${isDark ? 'text-white/70' : 'text-black/70'}`}>
                      <span className="text-xs font-semibold truncate">{def.name}</span>
                      {def.external && <span className={`text-[10px] flex-shrink-0 ${textMuted}`}>(extern)</span>}
                      <button onClick={() => setInfoDef(def)} title={`Details zu «${def.name}»`}
                        className={`p-0.5 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                        <Info size={11} />
                      </button>
                      <span className={`text-[10px] ml-auto flex-shrink-0 ${textMuted}`}>
                        {answered}/{yesNoQs.length} beantwortet
                      </span>
                      {derivedChip(derivedRelevant(proj, def) ?? null)}
                    </div>
                    <div className={`rounded-lg border px-4 py-3 space-y-3 ${isDark ? 'border-white/10 bg-white/3' : 'border-black/10 bg-white'}`}>
                      {questionsTitleOf(def) && (
                        <p className={`text-[11px] font-bold ${isDark ? 'text-white/80' : 'text-black/80'}`}>{questionsTitleOf(def)}</p>
                      )}
                      {qs.map(question => questionBlock(def, question, false))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 1. Projekt architekturrelevant — abgeleitet, letzte Zeile */}
        <div className={`px-4 py-3 border-t ${border} flex items-center gap-3 flex-wrap`}>
          <span className={`text-xs ${isDark ? 'text-white/70' : 'text-black/70'}`}>Projekt architekturrelevant?</span>
          {derivedChip(proj.architectureRelevant)}
          <span className={`text-[10px] ${textMuted}`}>
            abgeleitet: ein Thema offen → Offen, ein Thema relevant → Ja, sonst Nein
          </span>
          {gateClosed && (
            <span className={`text-[11px] ${textMuted}`}>Prüfung abgeschlossen — MS-Abschnitte ausgeblendet, erfasste Daten bleiben erhalten.</span>
          )}
        </div>
      </div>

      {/* MS-Abschnitte — bei «nicht architekturrelevant» ausgeblendet (MS10-Gate) */}
      {!gateClosed && model.milestones.filter(ms => ms !== (foundationDef?.milestone ?? 'MS10')).map(ms => {
        const defs = otherDefs.filter(def => milestoneOf(def) === ms);
        if (defs.length === 0) return null;
        return (
          <div key={ms} className={`${cardCls} mb-4`}>
            <div className="px-4 pt-3">
              <h3 className={`text-[11px] font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>{ms}</h3>
            </div>
            {tableHeader}
            {defs.map(def => reviewRow(def))}
          </div>
        );
      })}

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

      {/* Factsheet-Info */}
      {infoDef && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={() => setInfoDef(null)}>
          <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-xl border p-6 ${isDark ? 'border-white/15 bg-[#16171a]' : 'border-black/15 bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <h3 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-black'}`}>
                {infoDef.name}
                {infoDef.external && (
                  <span className={`ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full border ${isDark ? 'border-white/15 text-white/50' : 'border-black/15 text-black/50'}`}>
                    extern
                  </span>
                )}
              </h3>
              <button onClick={() => setInfoDef(null)}
                className={`p-1 rounded flex-shrink-0 transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3 text-[11px] overflow-y-auto min-h-0">
              <div className="flex gap-3">
                <span className={`w-28 flex-shrink-0 ${textMuted}`}>Meilenstein</span>
                <span className={isDark ? 'text-white/80' : 'text-black/80'}>
                  {infoDef.milestone}
                  {milestoneOf(infoDef) !== infoDef.milestone && ` — in diesem Projekt: ${milestoneOf(infoDef)}`}
                </span>
              </div>
              {infoDef.external && (
                <div className="flex gap-3">
                  <span className={`w-28 flex-shrink-0 ${textMuted}`}>Zuständigkeit</span>
                  <span className={isDark ? 'text-white/80' : 'text-black/80'}>Erstellung/Prüfung durch die zuständige Stelle</span>
                </div>
              )}
              {(() => {
                // Statische Information als Markdown; Fallback: Standard-Katalog, dann Kurztexte
                const md = infoDef.infoMd ?? DEFAULT_MODEL.factsheets.find(f => f.id === infoDef.id)?.infoMd;
                if (md) {
                  return (
                    <div className={`docx-content pt-1 ${isDark ? 'text-white/75' : 'text-black/75'}`}
                      dangerouslySetInnerHTML={{ __html: marked.parse(md, { async: false }) }} />
                  );
                }
                return (
                  <>
                    {infoDef.hint && (
                      <div className="flex gap-3">
                        <span className={`w-28 flex-shrink-0 ${textMuted}`}>Hinweis</span>
                        <span className={isDark ? 'text-white/80' : 'text-black/80'}>{infoDef.hint}</span>
                      </div>
                    )}
                    {infoDef.description && (
                      <p className={`leading-relaxed pt-1 ${isDark ? 'text-white/70' : 'text-black/70'}`}>{infoDef.description}</p>
                    )}
                  </>
                );
              })()}
              <div className={`pt-2 border-t space-y-2 ${border}`}>
                <div className="flex gap-3 items-start">
                  <span className={`w-28 flex-shrink-0 ${textMuted}`}>Prüfvorgabe</span>
                  <button onClick={() => copyPath(infoDef.factsheetDoc)} title="Klick: Pfad kopieren"
                    className={`flex items-center gap-1.5 min-w-0 text-left hover:underline underline-offset-2 ${isDark ? 'text-white/80' : 'text-black/80'}`}>
                    <ClipboardCopy size={10} className="flex-shrink-0" />
                    <span className="break-all">{infoDef.factsheetDoc}</span>
                  </button>
                </div>
                <div className="flex gap-3 items-start">
                  <span className={`w-28 flex-shrink-0 ${textMuted}`}>Nachweis</span>
                  <button onClick={() => copyPath(evidencePath(infoDef))} title="Klick: Pfad kopieren"
                    className={`flex items-center gap-1.5 min-w-0 text-left hover:underline underline-offset-2 ${isDark ? 'text-white/80' : 'text-black/80'}`}>
                    <ClipboardCopy size={10} className="flex-shrink-0" />
                    <span className="break-all">{evidencePath(infoDef)}</span>
                  </button>
                </div>
              </div>
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
              Architektur-Relevanz (falls angekreuzt) und eine Zusammenfassung in die Foundation-Notizen.
              Gespeichert wird erst mit «Speichern».
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

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-50 text-[11px] px-3 py-2 rounded border shadow-lg ${isDark ? 'bg-[#16171a] border-white/15 text-white/80' : 'bg-white border-black/15 text-black/80'}`}>
          <span className="flex items-center gap-1.5"><ExternalLink size={11} /> {toast}</span>
        </div>
      )}
    </div>
  );
}
