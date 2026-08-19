import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Minus, Plus, Save, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { MILESTONES, MILESTONE_TITLES, Model, Question } from '../types';
import { DEFAULT_MODEL } from '../defaultModel';
import { CATALOG_QUESTIONS } from '../catalog';
import { slugify } from '../util';

function genId(): string {
  return 'q' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function themeLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

// Admin-Modus: Themen (Titel + Info-Markdown, Nummerierung A–Z) und Fragen
// (Text, Meilenstein- und Themen-Zuordnung, Nummer automatisch z. B. M10F1).
// Schreibt in model.json im geteilten Ordner (Autosave).
export default function AdminView({ onBack }: { onBack: () => void }) {
  const { isDark, model, saveModel } = useStore();
  const [draft, setDraft] = useState<Model | null>(null);
  const [baseline, setBaseline] = useState('');
  const [openInfo, setOpenInfo] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState('');
  const [newClassLabel, setNewClassLabel] = useState('');
  const [pickQuery, setPickQuery] = useState<Record<string, string>>({});
  const [pickOpen, setPickOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);

  const border = isDark ? 'border-white/8' : 'border-black/8';
  const textMuted = isDark ? 'text-white/30' : 'text-black/30';
  const labelCls = isDark ? 'text-white/40' : 'text-black/40';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30'
    : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30';
  const cardCls = `rounded-xl border ${border} ${isDark ? 'bg-white/2' : 'bg-black/2'}`;

  // Entwurf aus den Stammdaten; Fehlendes aus dem eingebauten Standard
  // materialisieren, damit sichtbar ist, was die App effektiv anzeigt.
  useEffect(() => {
    if (!model || draft) return;
    const mat: Model = JSON.parse(JSON.stringify(model));
    if (!mat.themes?.length) {
      mat.themes = JSON.parse(JSON.stringify(DEFAULT_MODEL.themes));
    } else {
      for (const t of mat.themes) {
        if (!t.infoMd) {
          const dflt = DEFAULT_MODEL.themes.find(x => x.id === t.id);
          if (dflt?.infoMd) t.infoMd = dflt.infoMd;
        }
      }
    }
    if (!mat.questions?.length) {
      const ids = new Set(mat.themes.map(t => t.id));
      mat.questions = JSON.parse(JSON.stringify(
        DEFAULT_MODEL.questions.filter(q => ids.has(q.themeId))));
    } else {
      // fehlende Felder (Quelle, Hinweis, Typ, Optionen, Prüftiefe) bestehender
      // Fragen aus Standard und Katalog nachziehen
      const known = new Map([...DEFAULT_MODEL.questions, ...CATALOG_QUESTIONS].map(q => [q.id, q]));
      for (const q of mat.questions) {
        const ref = known.get(q.id);
        if (!ref) continue;
        if (!q.source && ref.source) q.source = ref.source;
        if (!q.hint && ref.hint) q.hint = ref.hint;
        if (!q.kind && ref.kind) q.kind = ref.kind;
        if (!q.options && ref.options) q.options = JSON.parse(JSON.stringify(ref.options));
        if (!q.minClassification && ref.minClassification) q.minClassification = ref.minClassification;
      }
    }
    if (!mat.classifications?.length) {
      mat.classifications = JSON.parse(JSON.stringify(DEFAULT_MODEL.classifications));
    }
    if (!mat.classificationInfoMd && DEFAULT_MODEL.classificationInfoMd) {
      mat.classificationInfoMd = DEFAULT_MODEL.classificationInfoMd;
    }
    if (!mat.company && DEFAULT_MODEL.company) {
      mat.company = DEFAULT_MODEL.company;
    }
    setDraft(mat);
    setBaseline(JSON.stringify(mat));
  }, [model, draft]);

  const dirty = draft != null && JSON.stringify(draft) !== baseline;

  useEffect(() => {
    if (!dirty || saving || saveError) return;
    const t = setTimeout(async () => {
      if (!draft || savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      const res = await saveModel(draft);
      savingRef.current = false;
      setSaving(false);
      if (res.ok) {
        setBaseline(JSON.stringify(draft));
        const d = new Date();
        setLastSavedAt(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      } else {
        setSaveError(res.message);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [draft, dirty, saving, saveError, saveModel]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (!draft) return <div className={`p-6 text-xs ${textMuted}`}>Lade Stammdaten …</div>;

  // ── Themen ────────────────────────────────────────────────────────────────
  const updateTheme = (id: string, patch: Partial<Model['themes'][number]>) =>
    setDraft(d => d ? { ...d, themes: d.themes.map(t => t.id === id ? { ...t, ...patch } : t) } : d);

  const deleteTheme = (id: string, title: string) => {
    if (!window.confirm(`Thema «${title}» samt zugeordneten Fragen löschen?\nErfasste Antworten bleiben in den Projektdateien erhalten.`)) return;
    setDraft(d => d ? {
      ...d,
      themes: d.themes.filter(t => t.id !== id),
      questions: d.questions.filter(q => q.themeId !== id),
    } : d);
  };

  const addTheme = () => {
    const title = newTitle.trim();
    if (!title || !draft) return;
    let id = slugify(title) || 'thema';
    while (draft.themes.some(t => t.id === id)) id = `${id}-2`;
    setDraft(d => d ? { ...d, themes: [...d.themes, { id, title }] } : d);
    setNewTitle('');
  };

  // ── Fragen ────────────────────────────────────────────────────────────────
  const updateQuestion = (id: string, patch: Partial<Question>) =>
    setDraft(d => d ? { ...d, questions: d.questions.map(q => q.id === id ? { ...q, ...patch } : q) } : d);

  const deleteQuestion = (id: string) =>
    setDraft(d => d ? { ...d, questions: d.questions.filter(q => q.id !== id) } : d);

  const addQuestion = (ms: string) =>
    setDraft(d => d ? {
      ...d,
      questions: [...d.questions, { id: genId(), text: '', milestone: ms, themeId: d.themes[0]?.id ?? '' }],
    } : d);

  // ── Fragenkatalog: Suche mit Live-Filter, Übernehmen per Klick ───────────
  const catalogCandidates = (ms: string) => {
    if (!draft) return [];
    const query = (pickQuery[ms] ?? '').trim().toLowerCase();
    const present = new Set(draft.questions.map(q => q.id));
    const themeTitle = (id: string) =>
      draft.themes.find(t => t.id === id)?.title
        ?? DEFAULT_MODEL.themes.find(t => t.id === id)?.title ?? id;
    return [...DEFAULT_MODEL.questions, ...CATALOG_QUESTIONS]
      .filter(q => q.milestone === ms && !present.has(q.id))
      .filter(q => {
        if (!query) return true; // Fokus ohne Eingabe → alle verfügbaren Fragen
        const hay = `${q.text} ${q.source ?? ''} ${themeTitle(q.themeId)}`.toLowerCase();
        return query.split(/\s+/).every(term => hay.includes(term));
      })
      .map(q => ({ q, themeTitle: themeTitle(q.themeId) }));
  };

  const addFromCatalog = (q: Question, ms: string) => {
    setDraft(d => {
      if (!d) return d;
      // nur übernehmen, wenn das Thema existiert und die Frage nicht schon da ist
      if (!d.themes.some(t => t.id === q.themeId)) return d;
      if (d.questions.some(x => x.id === q.id)) return d;
      return { ...d, questions: [...d.questions, JSON.parse(JSON.stringify(q))] };
    });
    setPickQuery(prev => ({ ...prev, [ms]: '' }));
  };

  // ── Klassifikationen ─────────────────────────────────────────────────────
  // Reihenfolge = aufsteigend; die erste Stufe gilt als «nicht relevant»
  // (wird bei «alle M10-Fragen Nein» automatisch gesetzt).
  const updateClassification = (id: string, patch: Partial<Model['classifications'][number]>) =>
    setDraft(d => d ? { ...d, classifications: d.classifications.map(c => c.id === id ? { ...c, ...patch } : c) } : d);

  const moveClassification = (id: string, dir: -1 | 1) =>
    setDraft(d => {
      if (!d) return d;
      const arr = [...d.classifications];
      const i = arr.findIndex(x => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, classifications: arr };
    });

  const deleteClassification = (id: string, label: string) => {
    if (!window.confirm(`Klassifikation «${label}» löschen?\nVerweise in Fragen («ab …») werden entfernt.`)) return;
    setDraft(d => d ? {
      ...d,
      classifications: d.classifications.filter(c => c.id !== id),
      questions: d.questions.map(q => q.minClassification === id ? { ...q, minClassification: undefined } : q),
    } : d);
  };

  const addClassification = () => {
    const label = newClassLabel.trim();
    if (!label || !draft) return;
    let id = slugify(label) || 'klasse';
    while (draft.classifications.some(c => c.id === id)) id = `${id}-2`;
    setDraft(d => d ? { ...d, classifications: [...d.classifications, { id, label }] } : d);
    setNewClassLabel('');
  };

  // Automatische Nummer: n-te Frage des Themas im Meilenstein → z. B. M10F1
  const numberOf = (q: Question): string => {
    const inGroup = draft.questions.filter(x => x.themeId === q.themeId && x.milestone === q.milestone);
    return `${q.milestone}F${inGroup.findIndex(x => x.id === q.id) + 1}`;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className={`flex items-center gap-1.5 text-xs ${textMuted} hover:opacity-70`}>
          <ArrowLeft size={12} /> Projekte
        </button>
        <div className={`text-[11px] ${textMuted}`}>
          Admin — Meilensteine sind fix: {MILESTONES.join(' / ')}
        </div>
      </div>

      {/* Firma: erscheint als Quelle bei eigenen Fragen */}
      <div className={`${cardCls} mb-8 px-4 py-3 flex items-center gap-3 flex-wrap`}>
        <label className={`text-[10px] uppercase tracking-wider ${labelCls}`}>Firma</label>
        <input value={draft.company ?? ''} placeholder="Eigene Firma"
          onChange={e => setDraft(d => d ? { ...d, company: e.target.value || undefined } : d)}
          className={`w-64 text-xs px-3 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
        <span className={`text-[10px] ${textMuted}`}>wird als «Quelle» bei eigenen Fragen angezeigt</span>
      </div>

      {/* Klassifikation */}
      <h2 className={`text-sm font-semibold uppercase tracking-widest mb-4 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
        Klassifikation
      </h2>
      <div className={`${cardCls} mb-8`}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-[10px] uppercase tracking-wider ${labelCls}`}>
              Stufen — Reihenfolge aufsteigend; die erste Stufe gilt als «nicht relevant»
            </span>
            <input value={newClassLabel} onChange={e => setNewClassLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addClassification(); }}
              placeholder="Neue Klassifikation"
              className={`text-[11px] px-2 py-1 rounded border outline-none transition-colors ${inputCls}`} />
            <button onClick={addClassification} disabled={!newClassLabel.trim()}
              className={`p-0.5 rounded border disabled:opacity-40 ${isDark ? 'border-white/15 text-white/40 hover:text-white/80' : 'border-black/15 text-black/40 hover:text-black/80'}`}>
              <Plus size={10} />
            </button>
          </div>
          <div className="space-y-2">
            {draft.classifications.map((c, ci) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className={`text-[10px] w-24 flex-shrink-0 ${textMuted}`}>
                  {ci === 0 ? 'automatisch' : 'wählbar'}
                </span>
                <input value={c.label}
                  onChange={e => updateClassification(c.id, { label: e.target.value })}
                  className={`flex-1 min-w-[160px] text-xs px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
                <button onClick={() => moveClassification(c.id, -1)} disabled={ci === 0} title="nach oben"
                  className={`p-1 rounded disabled:opacity-20 ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={() => moveClassification(c.id, 1)} disabled={ci === draft.classifications.length - 1} title="nach unten"
                  className={`p-1 rounded disabled:opacity-20 ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
                  <ChevronDown size={12} />
                </button>
                <button onClick={() => deleteClassification(c.id, c.label)} title="Klassifikation löschen"
                  className={`p-1 rounded transition-colors ${isDark ? 'text-white/25 hover:text-red-400' : 'text-black/25 hover:text-red-500'}`}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <p className={`text-[10px] mt-2 ${textMuted}`}>
            Die erste Stufe wird automatisch gesetzt, wenn alle M10-Fragen mit Nein beantwortet
            sind; die weiteren Stufen wählt der/die Architekt/in im M10. Ab der zweiten Stufe
            werden M20/M40 geprüft.
          </p>
        </div>

        <div className={`px-4 pb-3 border-t ${border}`}>
          <label className={`block text-[10px] uppercase tracking-wider mt-2 mb-1 ${labelCls}`}>
            Erklärung (Markdown) — wird über das Info-Icon bei der Klassifikation im M10 angezeigt
          </label>
          <textarea value={draft.classificationInfoMd ?? ''} rows={8}
            onChange={e => setDraft(d => d ? { ...d, classificationInfoMd: e.target.value || undefined } : d)}
            placeholder={'# Klassifikation\n\nBeschreibung der Stufen …'}
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y transition-colors ${inputCls}`} />
        </div>
      </div>

      {/* Themen */}
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-sm font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>
          Themen (A–Z)
        </h2>
        <div className="flex items-center gap-2">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTheme(); }}
            placeholder="Neues Thema"
            className={`text-xs px-3 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
          <button onClick={addTheme} disabled={!newTitle.trim()}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
            <Plus size={12} /> Anlegen
          </button>
        </div>
      </div>

      <div className="space-y-2 mb-8">
        {draft.themes.map((theme, ti) => {
          const infoOpen = openInfo.has(theme.id);
          return (
            <div key={theme.id} className={cardCls}>
              <div className="px-4 py-2.5 flex items-center gap-3">
                <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${textMuted}`}>{themeLetter(ti)}</span>
                <input value={theme.title} onChange={e => updateTheme(theme.id, { title: e.target.value })}
                  className={`flex-1 min-w-[180px] text-xs font-semibold px-2 py-1.5 rounded border outline-none transition-colors ${inputCls} ${!theme.title.trim() ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
                <button
                  onClick={() => setOpenInfo(prev => {
                    const next = new Set(prev);
                    if (next.has(theme.id)) next.delete(theme.id); else next.add(theme.id);
                    return next;
                  })}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30' : 'border-black/15 text-black/50 hover:border-black/30'}`}>
                  {infoOpen ? <Minus size={10} /> : <Plus size={10} />} Info
                </button>
                <button onClick={() => deleteTheme(theme.id, theme.title)} title="Thema löschen"
                  className={`p-1.5 rounded transition-colors ${isDark ? 'text-white/25 hover:text-red-400' : 'text-black/25 hover:text-red-500'}`}>
                  <Trash2 size={12} />
                </button>
              </div>
              {infoOpen && (
                <div className={`px-4 pb-3 border-t ${border}`}>
                  <label className={`block text-[10px] uppercase tracking-wider mt-2 mb-1 ${labelCls}`}>
                    Info (Markdown) — wird über das Info-Icon angezeigt
                  </label>
                  <textarea value={theme.infoMd ?? ''} rows={10}
                    onChange={e => updateTheme(theme.id, { infoMd: e.target.value || undefined })}
                    placeholder={'# Titel\n\nBeschreibung …\n\n- Punkt 1\n- Punkt 2'}
                    className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y transition-colors ${inputCls}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fragen, gruppiert nach (fixem) Meilenstein */}
      <h2 className={`text-sm font-semibold uppercase tracking-widest mb-4 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
        Fragen
      </h2>
      <div className="space-y-6">
        {MILESTONES.map(ms => {
          const qs = draft.questions.filter(q => q.milestone === ms);
          return (
            <div key={ms} className={cardCls}>
              <div className="px-4 pt-3 pb-1 flex items-center gap-2 flex-wrap">
                <h3 className={`text-[11px] font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                  {ms} · {MILESTONE_TITLES[ms] ?? ''}
                </h3>
                <button onClick={() => addQuestion(ms)} title={`Eigene Frage für ${ms} hinzufügen`}
                  className={`p-0.5 rounded border ${isDark ? 'border-white/15 text-white/40 hover:text-white/80' : 'border-black/15 text-black/40 hover:text-black/80'}`}>
                  <Plus size={10} />
                </button>
                {/* Katalogsuche: tippen filtert live über Text, Thema und Quelle */}
                <div className="relative ml-auto w-72 max-w-full">
                  <input value={pickQuery[ms] ?? ''}
                    onChange={e => setPickQuery(prev => ({ ...prev, [ms]: e.target.value }))}
                    onFocus={() => setPickOpen(ms)}
                    onBlur={() => setTimeout(() => setPickOpen(o => (o === ms ? null : o)), 150)}
                    placeholder="Frage aus Katalog wählen …"
                    className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
                  {pickOpen === ms && catalogCandidates(ms).length > 0 && (
                    <div className={`absolute z-20 mt-1 w-[28rem] max-w-[80vw] right-0 max-h-72 overflow-y-auto rounded-lg border shadow-lg ${isDark ? 'bg-[#16171a] border-white/15' : 'bg-white border-black/15'}`}>
                      {catalogCandidates(ms).map(({ q, themeTitle }) => (
                        <button key={q.id} onMouseDown={e => { e.preventDefault(); addFromCatalog(q, ms); }}
                          className={`block w-full text-left px-3 py-2 border-b last:border-b-0 transition-colors ${isDark ? 'border-white/8 hover:bg-white/5' : 'border-black/8 hover:bg-black/5'}`}>
                          <span className={`block text-[11px] ${isDark ? 'text-white/85' : 'text-black/85'}`}>{q.text}</span>
                          <span className={`block text-[10px] mt-0.5 ${textMuted}`}>
                            {themeTitle}{q.source ? ` · Quelle: ${q.source}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {pickOpen === ms && catalogCandidates(ms).length === 0 && (
                    <div className={`absolute z-20 mt-1 w-72 right-0 rounded-lg border shadow-lg px-3 py-2 text-[11px] ${isDark ? 'bg-[#16171a] border-white/15 text-white/40' : 'bg-white border-black/15 text-black/40'}`}>
                      Keine weiteren Katalogfragen verfügbar — mit + eine eigene Frage anlegen.
                    </div>
                  )}
                </div>
              </div>
              <div className="px-4 pb-4 pt-2 space-y-2">
                {qs.length === 0 && (
                  <p className={`text-[11px] ${textMuted}`}>Keine Fragen — mit + ergänzen.</p>
                )}
                {qs.map(q => (
                  <div key={q.id} className={`rounded-lg border px-3 py-2 space-y-2 ${isDark ? 'border-white/10 bg-white/3' : 'border-black/10 bg-white'} ${q.enabled === false ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="checkbox" checked={q.enabled !== false}
                        onChange={e => updateQuestion(q.id, { enabled: e.target.checked ? undefined : false })}
                        title={q.enabled === false ? 'Frage ist deaktiviert — wird im OnePager nicht gestellt' : 'Frage ist aktiv'}
                        className="accent-blue-500 cursor-pointer flex-shrink-0" />
                      <span className={`w-14 text-[10px] font-semibold flex-shrink-0 ${textMuted}`} title="Nummer wird automatisch vergeben">
                        {numberOf(q)}
                      </span>
                      <input value={q.text} placeholder="Fragetext"
                        onChange={e => updateQuestion(q.id, { text: e.target.value })}
                        className={`flex-1 min-w-[220px] text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls} ${!q.text.trim() ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
                      <select value={q.milestone}
                        onChange={e => updateQuestion(q.id, { milestone: e.target.value })}
                        title="Meilenstein"
                        className={`text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`}>
                        {MILESTONES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select value={q.themeId}
                        onChange={e => updateQuestion(q.id, { themeId: e.target.value })}
                        title="Thema"
                        className={`text-[11px] px-2 py-1.5 rounded border outline-none transition-colors max-w-[180px] ${inputCls}`}>
                        {draft.themes.map((t, i) => <option key={t.id} value={t.id}>{themeLetter(i)} · {t.title}</option>)}
                      </select>
                      <select value={q.kind ?? 'yesNo'}
                        onChange={e => {
                          const v = e.target.value;
                          updateQuestion(q.id, {
                            kind: v === 'yesNo' ? undefined : (v as 'text' | 'choice'),
                            ...(v !== 'choice' ? { options: undefined } : {}),
                          });
                        }}
                        title="Antworttyp"
                        className={`text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`}>
                        <option value="yesNo">Ja / Nein</option>
                        <option value="text">Text</option>
                        <option value="choice">Auswahl</option>
                      </select>
                      <button onClick={() => deleteQuestion(q.id)} title="Frage löschen"
                        className={`p-1.5 rounded transition-colors ${isDark ? 'text-white/25 hover:text-red-400' : 'text-black/25 hover:text-red-500'}`}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                    {q.kind === 'choice' && (
                      <input value={(q.options ?? []).join(', ')}
                        placeholder="Auswahlmöglichkeiten, mit Komma getrennt — z. B. K0, K1, K2"
                        onChange={e => updateQuestion(q.id, { options: e.target.value.split(',').map(s => s.trim()) })}
                        className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls} ${!(q.options ?? []).filter(Boolean).length ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <input value={q.hint ?? ''} placeholder="Erläuterung (optional)"
                        onChange={e => updateQuestion(q.id, { hint: e.target.value || undefined })}
                        className={`flex-1 min-w-[200px] text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
                      <span className={`max-w-[16rem] truncate text-[10px] ${textMuted}`}
                        title={q.source ?? `${draft.company ?? 'Eigene Firma'} (eigene Frage)`}>
                        Quelle: {q.source ?? (draft.company ?? 'Eigene Firma')}
                      </span>
                      {q.milestone !== MILESTONES[0] && (
                        <select value={q.minClassification ?? ''}
                          onChange={e => updateQuestion(q.id, { minClassification: e.target.value || undefined })}
                          title="Ab welcher Klassifikation die Frage gestellt wird (kumulativ); M10-Fragen gelten immer für alle"
                          className={`text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`}>
                          <option value="">alle Klassifikationen</option>
                          {draft.classifications.slice(1).map(c => (
                            <option key={c.id} value={c.id}>ab {c.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Speicherleiste */}
      <div className={`fixed bottom-0 left-0 right-0 border-t ${border} ${isDark ? 'bg-[#0c0d0f]/95' : 'bg-[#eae9e5]/95'} backdrop-blur px-6 py-3`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
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
          <div className={`flex items-center gap-1.5 text-[11px] ${textMuted}`}>
            <Save size={11} /> schreibt model.json
          </div>
        </div>
      </div>
    </div>
  );
}
