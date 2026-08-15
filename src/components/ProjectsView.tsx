import { useRef, useState } from 'react';
import { Plus, RefreshCw, ChevronRight, FileUp } from 'lucide-react';
import { useStore } from '../store';
import { deriveStatus, STATUS_META } from '../status';
import { extractPdfText, hasMs10Data, Ms10Data, parseMs10Text } from '../ms10';
import { fmtTimestamp, slugify, SLUG_RE } from '../util';

function StatusBadge({ status, isDark }: { status: keyof typeof STATUS_META; isDark: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${isDark ? meta.dark : meta.light}`}>
      {meta.label}
    </span>
  );
}

export default function ProjectsView({ onOpen }: { onOpen: (slug: string) => void }) {
  const { isDark, model, projects, refreshProjects, createProject } = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ms10, setMs10] = useState<Ms10Data | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const border = isDark ? 'border-white/8' : 'border-black/8';
  const textMuted = isDark ? 'text-white/30' : 'text-black/30';
  const labelCls = isDark ? 'text-white/40' : 'text-black/40';
  const inputCls = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30'
    : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30';

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const resetForm = () => {
    setAdding(false); setName(''); setSlug(''); setSlugTouched(false); setErr(''); setMs10(null);
  };

  const create = async () => {
    const s = effectiveSlug;
    if (!name.trim()) { setErr('Name fehlt.'); return; }
    if (!SLUG_RE.test(s)) { setErr('Slug ungültig — nur Kleinbuchstaben, Ziffern und Bindestriche.'); return; }
    setBusy(true);
    const res = await createProject(name.trim(), s, ms10 ?? undefined);
    setBusy(false);
    if (res.ok) { resetForm(); onOpen(s); }
    else setErr(res.message);
  };

  // MS10-PDF wählen → Felder parsen und das Formular vorbefüllen
  const importMs10 = async (file: File) => {
    setErr('');
    try {
      const data = parseMs10Text(await extractPdfText(await file.arrayBuffer()));
      if (!hasMs10Data(data)) {
        setAdding(true);
        setErr('Im PDF wurden keine MS10-Felder gefunden.');
        return;
      }
      setMs10(data);
      if (data.name) { setName(data.name); setSlugTouched(false); setSlug(''); }
      setAdding(true);
    } catch (e) {
      console.error('[arch-review] importMs10:', e);
      setAdding(true);
      setErr('PDF konnte nicht gelesen werden.');
    }
  };

  const ms10SummaryLine = (d: Ms10Data) =>
    [
      d.projectNumber,
      d.projectLead && `PL ${d.projectLead}`,
      d.projectClass && `Klasse ${d.projectClass} → Prüftiefe`,
      d.architectureRelevant !== undefined && `architekturrelevant: ${d.architectureRelevant ? 'ja' : 'nein'}`,
      d.requestDate && `Antrag ${d.requestDate}`,
    ].filter(Boolean).join(' · ');

  const classificationLabel = (id: string | null) =>
    id == null ? '–' : (model?.classifications.find(c => c.id === id)?.label ?? id);
  const depthLabel = (id: string | null) => {
    if (id == null) return '–';
    const d = model?.reviewDepths.find(x => x.id === id);
    return d ? `${d.label} · ${d.personDays} PT` : id;
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-sm font-semibold uppercase tracking-widest ${isDark ? 'text-white/50' : 'text-black/50'}`}>Projekte</h2>
        <div className="flex items-center gap-2">
          <button onClick={refreshProjects} title="Liste neu laden"
            className={`p-1.5 rounded transition-colors ${isDark ? 'text-white/25 hover:text-white/70' : 'text-black/25 hover:text-black/70'}`}>
            <RefreshCw size={12} />
          </button>
          {!adding && (
            <>
              <button onClick={() => fileRef.current?.click()}
                title="Neues Projekt aus einem MS10-Antrags-PDF vorbefüllen"
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                <FileUp size={12} /> Import MS10-PDF
              </button>
              <button onClick={() => setAdding(true)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors ${isDark ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white' : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black'}`}>
                <Plus size={12} /> Neues Projekt
              </button>
            </>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importMs10(f);
            }} />
        </div>
      </div>

      {adding && (
        <div className={`p-4 rounded-xl border mb-4 ${isDark ? 'border-white/8 bg-white/3' : 'border-black/8 bg-black/3'}`}>
          <p className={`text-[10px] uppercase tracking-wider mb-3 ${textMuted}`}>Neues Projekt</p>
          {ms10 && (
            <p className={`text-[11px] mb-3 flex items-center gap-1.5 ${isDark ? 'text-emerald-400/80' : 'text-emerald-700'}`}>
              <FileUp size={11} className="flex-shrink-0" />
              MS10-Import: {ms10SummaryLine(ms10)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Core Datenbank Migration" autoFocus
                className={`w-full text-xs px-3 py-2 rounded border outline-none transition-colors ${inputCls}`} />
            </div>
            <div>
              <label className={`block text-[10px] uppercase tracking-wider mb-1 ${labelCls}`}>Slug (Dateiname)</label>
              <input value={effectiveSlug} onChange={e => { setSlug(e.target.value); setSlugTouched(true); }} placeholder="core-datenbank-migration"
                className={`w-full text-xs px-3 py-2 rounded border outline-none transition-colors ${inputCls}`} />
            </div>
          </div>
          {err && <p className={`text-[11px] mt-2 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{err}</p>}
          <div className="flex gap-2 pt-3">
            <button onClick={resetForm}
              className={`flex-1 text-xs py-2 rounded border transition-colors ${isDark ? 'border-white/15 text-white/40 hover:border-white/30 hover:text-white/70' : 'border-black/15 text-black/40 hover:border-black/30 hover:text-black/70'}`}>
              Abbrechen
            </button>
            <button onClick={create} disabled={busy}
              className={`flex-1 text-xs py-2 rounded font-semibold transition-colors disabled:opacity-50 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80'}`}>
              Anlegen
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 && !adding && (
        <p className={`text-sm ${textMuted}`}>Noch keine Projekte im Ordner projects/.</p>
      )}

      <div className="space-y-3">
        {projects.map(p => {
          const status = deriveStatus(p.data);
          return (
            <button key={p.slug} onClick={() => onOpen(p.slug)}
              className={`w-full text-left rounded-xl border transition-colors ${border} ${isDark ? 'bg-white/2 hover:bg-white/5' : 'bg-black/2 hover:bg-black/5'}`}>
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-black'}`}>{p.data.name || p.slug}</span>
                    <StatusBadge status={status} isDark={isDark} />
                  </div>
                  <div className={`text-[11px] mt-1 ${textMuted}`}>
                    <span className="mr-3">{p.slug}</span>
                    <span className="mr-3">Klassifikation: {classificationLabel(p.data.classification)}</span>
                    <span className="mr-3">Prüftiefe: {depthLabel(p.data.reviewDepth)}</span>
                    {p.data.updatedAt && <span>Stand: {fmtTimestamp(p.data.updatedAt)}</span>}
                  </div>
                </div>
                <ChevronRight size={14} className={`flex-shrink-0 ${textMuted}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
