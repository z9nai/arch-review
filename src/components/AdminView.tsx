import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, ChevronDown, ChevronUp, Copy, ExternalLink, Minus, Plus, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { useStore } from '../store';
import { MILESTONES, MILESTONE_TITLES, Model, Question } from '../types';
import { DEFAULT_MODEL } from '../defaultModel';
import { CATALOG_QUESTIONS } from '../catalog';
import { DEFAULT_HANDOVER_BODY, DEFAULT_HANDOVER_SUBJECT } from './OnePagerView';
import { autoGrow, slugify } from '../util';
import { GUID_RE, LEVEL_LABELS, setupLink, useAuth } from '../auth';

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
  const { isDark, model, saveModel, storage } = useStore();
  const [draft, setDraft] = useState<Model | null>(null);
  const [baseline, setBaseline] = useState('');
  const [openInfo, setOpenInfo] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState('');
  const [newClassLabel, setNewClassLabel] = useState('');
  const { user: authUser, status: authStatus, ids: knownIds } = useAuth();
  const [setupCopied, setSetupCopied] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState('');
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
    // Kennt dieser Browser die Anmelde-IDs, die model.json aber nicht (z. B.
    // Datei vor der Vorbefüllung angelegt): übernehmen → Autosave schreibt sie
    if (knownIds && !(GUID_RE.test(mat.auth?.tenantId ?? '') && GUID_RE.test(mat.auth?.clientId ?? ''))) {
      setDraft({
        ...mat,
        auth: {
          enabled: mat.auth?.enabled === true,
          adminRole: 'ArchReview.Admin', reviewerRole: 'ArchReview.Reviewer', viewerRole: 'ArchReview.Viewer',
          ...(mat.auth ?? {}),
          tenantId: knownIds.tenantId, clientId: knownIds.clientId,
        },
      });
    }
  }, [model, draft, knownIds]);

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

  // ── Übergabe an die Fachstelle ────────────────────────────────────────────
  const updateHandover = (patch: Partial<NonNullable<Model['handover']>>) =>
    setDraft(d => d ? { ...d, handover: { ...(d.handover ?? {}), ...patch } } : d);

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

  // Löschen entfernt die Frage endgültig aus dem Katalog: die id wird frei und
  // könnte später für eine andere Frage vergeben werden — dann hängen alte
  // Antworten an der falschen Frage. Deshalb nur während des Aufbaus; für
  // produktiv genutzte Fragen ist Archivieren der richtige Weg.
  const deleteQuestion = (id: string, text: string) => {
    const label = text.trim() ? `«${text.trim().slice(0, 80)}${text.trim().length > 80 ? ' …' : ''}»` : `(${id})`;
    if (!window.confirm(
      `Frage ${label} endgültig löschen?\n\n` +
      `Die id «${id}» wird damit frei. Antworten aus bestehenden Projekten bleiben in den Dateien, ` +
      `verlieren aber ihren Bezug — und würden an einer späteren Frage mit derselben id fälschlich wieder auftauchen.\n\n` +
      `Wurde die Frage schon in Reviews beantwortet, stattdessen archivieren.`)) return;
    setDraft(d => d ? { ...d, questions: d.questions.filter(q => q.id !== id) } : d);
  };

  // Archivieren: id bleibt reserviert, Frage wird in neuen Reviews nicht mehr
  // gestellt, bestehende Antworten bleiben schreibgeschützt sichtbar.
  const archiveQuestion = (id: string) =>
    updateQuestion(id, { archived: true, enabled: undefined });

  const restoreQuestion = (id: string) =>
    updateQuestion(id, { archived: undefined });

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

  // ── Reviewbericht-Vorlage (Briefpapier) ──────────────────────────────────
  // PDF wird als Base64 in model.json abgelegt (siehe ReportTemplate) — damit
  // funktioniert lokaler Ordner und SharePoint gleich, kein zweiter Dateityp.
  const handleTemplateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setTemplateError('');
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setTemplateError('Bitte eine PDF-Datei wählen.');
      return;
    }
    setTemplateBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await PDFDocument.load(buf);
      const pageCount = pdf.getPageCount();
      if (pageCount < 1) throw new Error('PDF ohne Seiten.');
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const pdfBase64 = btoa(binary);
      setDraft(d => d ? {
        ...d,
        reportTemplate: { ...(d.reportTemplate ?? {}), pdfBase64, fileName: file.name, pageCount },
      } : d);
    } catch (err) {
      setTemplateError('PDF konnte nicht gelesen werden: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTemplateBusy(false);
    }
  };

  const removeTemplate = () => {
    if (!window.confirm('Vorlage entfernen? Der Reviewbericht wird danach wieder ohne Briefpapier erstellt.')) return;
    setDraft(d => d ? { ...d, reportTemplate: undefined } : d);
  };

  // Automatische Nummer: n-te Frage des Themas im Meilenstein → z. B. M10F1
  // Gleiche Regel wie im OnePager (questionsAt): Meilenstein + Themen-Buchstabe
  // + Position innerhalb Thema/Meilenstein im vollen Katalog — archivierte und
  // deaktivierte Fragen behalten ihre Nummer, damit Verweise stabil bleiben.
  const numberOf = (q: Question): string => {
    const ti = draft.themes.findIndex(t => t.id === q.themeId);
    const inGroup = draft.questions.filter(x => x.themeId === q.themeId && x.milestone === q.milestone);
    return `${q.milestone}${ti >= 0 ? themeLetter(ti) : 'X'}${inGroup.findIndex(x => x.id === q.id) + 1}`;
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

      {/* Anmeldung über Microsoft Entra ID */}
      {(() => {
        const a = draft.auth ?? { enabled: false, tenantId: '', clientId: '', adminRole: 'ArchReview.Admin', reviewerRole: 'ArchReview.Reviewer', viewerRole: 'ArchReview.Viewer' };
        const setAuth = (patch: Partial<typeof a>) =>
          setDraft(d => d ? { ...d, auth: { ...a, ...patch } } : d);
        const tenantOk = GUID_RE.test(a.tenantId);
        const clientOk = GUID_RE.test(a.clientId);
        const canEnable = tenantOk && clientOk;
        const idCls = (ok: boolean, value: string) =>
          `w-full text-[11px] px-2 py-1.5 rounded border outline-none font-mono transition-colors ${inputCls} ${
            value && !ok ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`;
        const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
        return (
          <>
            <h2 className={`text-sm font-semibold uppercase tracking-widest mb-4 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
              Anmeldung (Microsoft Entra ID)
            </h2>
            <div className={`${cardCls} mb-8 px-4 py-3 space-y-3`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Verzeichnis-ID (Tenant)</label>
                  <input value={a.tenantId} placeholder="00000000-0000-0000-0000-000000000000"
                    onChange={e => setAuth({ tenantId: e.target.value.trim(), ...(a.enabled && !GUID_RE.test(e.target.value.trim()) ? { enabled: false } : {}) })}
                    className={idCls(tenantOk, a.tenantId)} />
                </div>
                <div>
                  <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Anwendungs-ID (Client)</label>
                  <input value={a.clientId} placeholder="00000000-0000-0000-0000-000000000000"
                    onChange={e => setAuth({ clientId: e.target.value.trim(), ...(a.enabled && !GUID_RE.test(e.target.value.trim()) ? { enabled: false } : {}) })}
                    className={idCls(clientOk, a.clientId)} />
                </div>
                {([
                  ['adminRole', 'Admin-Rolle', 'ArchReview.Admin', 'alles inkl. Admin-Modus'],
                  ['reviewerRole', 'Reviewer-Rolle', 'ArchReview.Reviewer', 'Reviews bearbeiten, kein Admin-Modus'],
                  ['viewerRole', 'Viewer-Rolle', 'ArchReview.Viewer', 'nur lesen, PDFs exportieren'],
                ] as const).map(([key, label, ph, hint]) => (
                  <div key={key}>
                    <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>{label} <span className="normal-case tracking-normal">— {hint}</span></label>
                    <input value={a[key] ?? ''} placeholder={ph}
                      onChange={e => setAuth({ [key]: e.target.value.trim() || undefined })}
                      className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none font-mono transition-colors ${inputCls}`} />
                  </div>
                ))}
              </div>
              {/* Status + Schalter — unmissverständlich */}
              <div className={`flex items-center gap-3 flex-wrap rounded-lg border px-3 py-2 ${
                a.enabled
                  ? (isDark ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-emerald-300 bg-emerald-50')
                  : (isDark ? 'border-amber-500/30 bg-amber-500/10' : 'border-amber-300 bg-amber-50')}`}>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  a.enabled ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : (isDark ? 'text-amber-300' : 'text-amber-700')}`}>
                  Anmeldung {a.enabled ? 'aktiv' : 'aus'}
                </span>
                <label className={`flex items-center gap-2 text-xs ${canEnable ? 'cursor-pointer' : 'opacity-60'} ${isDark ? 'text-white/80' : 'text-black/80'}`}>
                  <input type="checkbox" checked={a.enabled} disabled={!canEnable}
                    onChange={e => setAuth({ enabled: e.target.checked })}
                    className="accent-blue-500 w-3.5 h-3.5" />
                  {a.enabled ? 'Login wird für alle Benutzer dieses Ordners verlangt' : 'Anmeldung einschalten'}
                </label>
                {!canEnable && (
                  <span className={`text-[10px] ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                    Einschalten erst möglich, wenn {!tenantOk && !clientOk ? 'beide IDs' : !tenantOk ? 'die Verzeichnis-ID' : 'die Anwendungs-ID'} als
                    gültige GUID erkannt {(!tenantOk && !clientOk) ? 'sind' : 'ist'} (Format 8-4-4-4-12, nur die ID ohne Beschriftung).
                  </span>
                )}
              </div>
              {/* Verteilung an die Benutzer: Einrichtungs-Link / Konfigurationsdatei */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] uppercase tracking-wider ${labelCls}`}>Für Benutzer</span>
                <button disabled={!canEnable}
                  onClick={async () => {
                    const link = setupLink(a.tenantId, a.clientId, storage?.kind === 'sharepoint' ? storage.webUrl : undefined);
                    try { await navigator.clipboard.writeText(link); setSetupCopied(true); setTimeout(() => setSetupCopied(false), 2000); }
                    catch { window.prompt('Einrichtungs-Link kopieren:', link); }
                  }}
                  title="Link, der Anmeldung und SharePoint-Ordner im Browser des Empfängers einmalig einrichtet"
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                  <Copy size={11} /> {setupCopied ? '✓ Kopiert' : 'Einrichtungs-Link kopieren'}
                </button>
                <span className={`text-[10px] ${textMuted}`}>
                  {storage?.kind === 'sharepoint'
                    ? <>Enthält Anmeldung und den SharePoint-Ordner <span className="font-mono">{storage.name}</span> — Empfänger öffnen den Link, melden sich an, fertig.</>
                    : 'Enthält die Anmeldung; mit verbundenem SharePoint-Ordner zusätzlich den Ordner.'}
                </span>
              </div>
              <div className={`text-[10px] leading-relaxed space-y-1 ${textMuted}`}>
                <p>
                  Umleitungs-URIs für die App-Registrierung (Plattform <span className="font-semibold">SPA</span>):
                  {' '}<span className="font-mono">{appUrl}</span>
                  {appUrl !== 'https://z9nai.github.io/arch-review/' && <> und <span className="font-mono">https://z9nai.github.io/arch-review/</span></>}
                </p>
                <p>
                  Rollen sind die <span className="font-semibold">Werte</span> der App-Rollen in Entra; die höchste passende gewinnt.
                  Alle leer = jede angemeldete Person ist Admin. Ist eine Reviewer-Rolle gesetzt, erhalten Personen ohne
                  passende Rolle keinen Zugriff.
                </p>
                <p>
                  Achtung: Mit falschen IDs sperrt man sich aus — dann <span className="font-mono">auth.enabled</span> in der
                  model.json von Hand auf <span className="font-mono">false</span> setzen.
                  {authStatus === 'signedIn' && authUser && (
                    <> Angemeldet als <span className="font-semibold">{authUser.name}</span> · Stufe:
                      {' '}<span className="font-semibold">{LEVEL_LABELS[authUser.level]}</span>
                      {authUser.roles.length ? <> · Token-Rollen: <span className="font-mono">{authUser.roles.join(', ')}</span></> : ' · keine App-Rollen im Token'}
                      {authUser.isAdmin && a.adminRole && <ShieldCheck size={10} className="inline ml-1" />}
                    </>
                  )}
                </p>
                <a href="https://github.com/z9nai/arch-review/blob/main/docs/ENTRA-SETUP.md" target="_blank" rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${isDark ? 'text-white/50' : 'text-black/50'}`}>
                  <ExternalLink size={10} /> Anleitung: App-Registrierung in Entra Schritt für Schritt
                </a>
              </div>
            </div>
          </>
        );
      })()}

      {/* Reviewbericht-Vorlage (Briefpapier) */}
      <h2 className={`text-sm font-semibold uppercase tracking-widest mb-4 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
        Reviewbericht-Vorlage
      </h2>
      <div className={`${cardCls} mb-8 px-4 py-3 space-y-3`}>
        <p className={`text-[10px] leading-relaxed ${textMuted}`}>
          PDF mit Logo und Grafik als Briefpapier für den Reviewbericht-Export — Seite 1 als Deckblatt, Seite 2 (falls vorhanden)
          für alle Folgeseiten. Die Vorlage sollte nur Grafik enthalten, keinen Text: Titel, Projektangaben, Kopf- und
          Fusszeile zeichnet der Export selbst darüber.
        </p>
        <div className={`flex items-center gap-3 flex-wrap rounded-lg border px-3 py-2 ${
          draft.reportTemplate
            ? (isDark ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-emerald-300 bg-emerald-50')
            : (isDark ? 'border-amber-500/30 bg-amber-500/10' : 'border-amber-300 bg-amber-50')}`}>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${
            draft.reportTemplate ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : (isDark ? 'text-amber-300' : 'text-amber-700')}`}>
            {draft.reportTemplate ? 'Vorlage geladen' : 'Keine Vorlage'}
          </span>
          <span className={`text-xs ${isDark ? 'text-white/80' : 'text-black/80'}`}>
            {draft.reportTemplate
              ? <>{draft.reportTemplate.fileName ?? 'Vorlage.pdf'} · {draft.reportTemplate.pageCount ?? '?'} Seite{draft.reportTemplate.pageCount === 1 ? '' : 'n'}</>
              : 'Bericht wird ohne Briefpapier erstellt (einfacher Text-Export)'}
          </span>
          <label className={`ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border cursor-pointer transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
            <input type="file" accept="application/pdf" className="hidden" disabled={templateBusy} onChange={handleTemplateFile} />
            <Upload size={11} /> {templateBusy ? 'Lädt …' : draft.reportTemplate ? 'PDF ersetzen' : 'PDF laden'}
          </label>
          {draft.reportTemplate && (
            <button onClick={removeTemplate}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-rose-400/50 hover:text-rose-300' : 'border-black/15 text-black/50 hover:border-rose-300 hover:text-rose-600'}`}>
              <Trash2 size={11} /> Entfernen
            </button>
          )}
        </div>
        {templateError && (
          <p className={`text-[11px] ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>{templateError}</p>
        )}
        {draft.reportTemplate && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Kopfzeile rechts</label>
              <input value={draft.reportTemplate.docType ?? ''} placeholder="Architekturprüfung · Reviewbericht"
                onChange={e => setDraft(d => d?.reportTemplate ? { ...d, reportTemplate: { ...d.reportTemplate, docType: e.target.value || undefined } } : d)}
                className={`w-full text-xs px-3 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
            </div>
            <div>
              <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Fusszeile links</label>
              <input value={draft.reportTemplate.footerLeft ?? ''} placeholder="{{projekt}} · {{nummer}} · {{datum}}"
                onChange={e => setDraft(d => d?.reportTemplate ? { ...d, reportTemplate: { ...d.reportTemplate, footerLeft: e.target.value || undefined } } : d)}
                className={`w-full text-xs px-3 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
              <span className={`text-[10px] ${textMuted}`}>Platzhalter: {'{{datum}}'}, {'{{projekt}}'}, {'{{nummer}}'}</span>
            </div>
          </div>
        )}
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
            onFocus={autoGrow} onInput={autoGrow}
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
                    onFocus={autoGrow} onInput={autoGrow}
                    placeholder={'# Titel\n\nBeschreibung …\n\n- Punkt 1\n- Punkt 2'}
                    className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-y transition-colors ${inputCls}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Übergabe an die Fachstelle: ein Empfänger + Vorlage für den Übergabetext */}
      <h2 className={`text-sm font-semibold uppercase tracking-widest mb-4 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
        Übergabe an die Fachstelle
      </h2>
      <div className={`${cardCls} p-4 mb-10 space-y-3`}>
        <p className={`text-[11px] ${textMuted}`}>
          Ist im Projekt einer der Abnahme-Kontrollpunkte als «erforderlich» angekreuzt, bietet der
          Meilenstein einen Übergabetext an die Fachstelle an — mit der Einschätzung Architektur und
          der Bitte um Rückmeldung. Mehrere erforderliche Prüfungen ergeben ein gemeinsames Mail.
          {(draft.milestoneChecks ?? []).length > 0 && (
            <> Ausgelöst durch: {(draft.milestoneChecks ?? []).map(c => `${c.label} (${c.milestone})`).join(', ')}.</>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input value={draft.handover?.to ?? ''}
            onChange={e => updateHandover({ to: e.target.value || undefined })}
            placeholder="Empfänger — z. B. security@firma.ch"
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
          <input value={draft.handover?.name ?? ''}
            onChange={e => updateHandover({ name: e.target.value || undefined })}
            placeholder="Ansprechperson — z. B. Dominik Meister (Anrede: «Hallo Dominik»)"
            title="Der Vorname bildet die Anrede im Übergabetext; ohne Eintrag «Guten Tag»"
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
        </div>
        <div className="pt-2 space-y-2">
          <label className={`block text-[10px] uppercase tracking-wider ${labelCls}`}>Vorlage Übergabetext</label>
          <input value={draft.handover?.subject ?? ''}
            onChange={e => updateHandover({ subject: e.target.value || undefined })}
            placeholder={`Betreff — leer = Standard: ${DEFAULT_HANDOVER_SUBJECT}`}
            title={`Standard: ${DEFAULT_HANDOVER_SUBJECT}`}
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
          <textarea value={draft.handover?.body ?? ''} rows={3}
            onChange={e => updateHandover({ body: e.target.value || undefined })}
            onFocus={autoGrow} onInput={autoGrow}
            placeholder={`Text — leer = Standard:\n${DEFAULT_HANDOVER_BODY}`}
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors font-mono ${inputCls}`} />
          <p className={`text-[10px] ${textMuted}`}>
            Platzhalter: {'{{anrede}} {{projekt}} {{slug}} {{pruefungen}} {{ms}} {{meilenstein}} {{klassifikation}} {{termin}} {{projektblock}} {{einschaetzung}} {{ausloeser}} {{ausgangslage}}'}
            {' '}— Blöcke: Projektangaben, Einschätzung Architektur der erforderlichen Prüfungen,
            {' '}mit Ja beantwortete M10-Fragen, Antworten der Kontext-Fragen unten.
            {' '}Mit **Sternchen** wird fett — das Mail wird formatiert kopiert.
          </p>
          <input value={(draft.handover?.context ?? []).join(', ')}
            onChange={e => {
              const ids = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
              updateHandover({ context: ids.length ? ids : undefined });
            }}
            placeholder="Kontext-Fragen (ids, kommagetrennt) — deren Antworten bilden {{ausgangslage}}, z. B. D0, E1, T1"
            title="Frage-ids, auch aus anderen Themen. ids sind stabil, die angezeigte Nummer nicht."
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none transition-colors ${inputCls}`} />
          {(draft.handover?.context ?? []).length > 0 && (
            <p className={`text-[10px] ${textMuted}`}>
              {(draft.handover?.context ?? []).map(id => {
                const q = draft.questions.find(x => x.id === id);
                return q ? `${numberOf(q)} ${q.text.slice(0, 40)}${q.text.length > 40 ? '…' : ''}` : `${id}: unbekannt`;
              }).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Fragen, gruppiert nach (fixem) Meilenstein */}
      <h2 className={`text-sm font-semibold uppercase tracking-widest mb-4 ${isDark ? 'text-white/50' : 'text-black/50'}`}>
        Fragen
      </h2>
      <div className="space-y-6">
        {MILESTONES.map(ms => {
          // Anzeige nach Themen-Reihenfolge (A–Z) sortieren; die automatische
          // Nummer (numberOf) bleibt unabhängig davon, sie zählt weiterhin die
          // Position innerhalb desselben Themas+Meilensteins in draft.questions.
          const themeOrder = new Map(draft.themes.map((t, i) => [t.id, i]));
          const qs = draft.questions
            .filter(q => q.milestone === ms)
            .slice()
            .sort((a, b) => (themeOrder.get(a.themeId) ?? 999) - (themeOrder.get(b.themeId) ?? 999));
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
                {qs.map(q => q.archived ? (
                  // archiviert: nur lesen; Nummer und id bleiben belegt
                  <div key={q.id} className={`rounded-lg border border-dashed px-3 py-2 flex items-center gap-2 flex-wrap opacity-60 ${isDark ? 'border-white/15' : 'border-black/15'}`}>
                    <span className={`w-14 text-[10px] font-semibold flex-shrink-0 ${textMuted}`} title="Nummer bleibt reserviert">
                      {numberOf(q)}
                    </span>
                    <span className={`flex-1 min-w-[220px] text-[11px] line-through ${isDark ? 'text-white/60' : 'text-black/60'}`}>{q.text || <em>(ohne Text)</em>}</span>
                    <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${isDark ? 'bg-white/8 text-white/50 border-white/15' : 'bg-black/5 text-black/50 border-black/15'}`}>
                      archiviert
                    </span>
                    <span className={`text-[10px] ${textMuted}`}>id: {q.id}</span>
                    <button onClick={() => restoreQuestion(q.id)} title="Frage wiederherstellen — wird wieder in Reviews gestellt"
                      className={`p-1.5 rounded transition-colors ${isDark ? 'text-white/25 hover:text-emerald-400' : 'text-black/25 hover:text-emerald-600'}`}>
                      <ArchiveRestore size={12} />
                    </button>
                  </div>
                ) : (
                  <div key={q.id} className={`rounded-lg border px-3 py-2 space-y-2 ${isDark ? 'border-white/10 bg-white/3' : 'border-black/10 bg-white'} ${q.enabled === false ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="checkbox" checked={q.enabled !== false}
                        onChange={e => updateQuestion(q.id, { enabled: e.target.checked ? undefined : false })}
                        title={q.enabled === false ? 'Frage ist deaktiviert — wird im OnePager nicht gestellt' : 'Frage ist aktiv'}
                        className="accent-blue-500 cursor-pointer flex-shrink-0" />
                      <span className={`w-14 text-[10px] font-semibold flex-shrink-0 ${textMuted}`} title="Nummer wird automatisch vergeben">
                        {numberOf(q)}
                      </span>
                      <textarea value={q.text} placeholder="Fragetext" rows={1}
                        onChange={e => updateQuestion(q.id, { text: e.target.value })}
                        onFocus={autoGrow} onInput={autoGrow}
                        className={`flex-1 min-w-[220px] text-[11px] px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors ${inputCls} ${!q.text.trim() ? (isDark ? 'border-rose-500/40' : 'border-rose-300') : ''}`} />
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
                      <button onClick={() => archiveQuestion(q.id)}
                        title="Frage archivieren — id bleibt reserviert, wird in neuen Reviews nicht mehr gestellt; bestehende Antworten bleiben schreibgeschützt sichtbar"
                        className={`p-1.5 rounded transition-colors ${isDark ? 'text-white/25 hover:text-amber-400' : 'text-black/25 hover:text-amber-600'}`}>
                        <Archive size={12} />
                      </button>
                      <button onClick={() => deleteQuestion(q.id, q.text)}
                        title="Frage endgültig löschen (nur im Aufbau — id wird frei, alte Antworten verwaisen)"
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
                      <textarea value={q.hint ?? ''} placeholder="Erläuterung (optional, Markdown) — wird über ein Info-Icon bei der Frage angezeigt" rows={1}
                        onChange={e => updateQuestion(q.id, { hint: e.target.value || undefined })}
                        onFocus={autoGrow} onInput={autoGrow}
                        className={`flex-1 min-w-[200px] text-[11px] px-2 py-1.5 rounded border outline-none resize-none overflow-hidden transition-colors ${inputCls}`} />
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
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer flex-shrink-0"
                        title="Bemerkungen-Textarea immer sichtbar statt hinter «Bemerkungen …» versteckt">
                        <input type="checkbox" checked={q.remarksAlwaysOpen === true}
                          onChange={e => updateQuestion(q.id, { remarksAlwaysOpen: e.target.checked ? true : undefined })}
                          className="accent-blue-500 cursor-pointer" />
                        Bemerkungen immer offen
                      </label>
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
