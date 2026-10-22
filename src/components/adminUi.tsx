// Bausteine der Admin-Ansicht (wie in orch-spec): Bereichskarte mit
// Kopfzeile und Zustand, Zustands-Chip, Kachel der Statusleiste, Schalter.
//
// Jede Karte sagt oben, was sie ist und wie es steht («aktiv», «aus»,
// «nicht eingerichtet»); die Erklärung ist ein Satz, der Rest klappt über
// «mehr» auf.
import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cls } from '../ui';

export type AdminTone = 'ok' | 'off' | 'warn' | 'error';

export interface AdminState { tone: AdminTone; label: string; detail?: string }

/** Zustand eines Bereichs — in der Statusleiste und im Kartenkopf. */
export function StateChip({ tone, label, isDark, title }: { tone: AdminTone; label: string; isDark: boolean; title?: string }) {
  const toneCls = tone === 'ok'
    ? (isDark ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-800')
    : tone === 'warn'
      ? (isDark ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-800')
      : tone === 'error'
        ? (isDark ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-rose-300 bg-rose-50 text-rose-700')
        : (isDark ? 'border-white/15 text-white/50' : 'border-black/15 text-black/50');
  return (
    <span title={title} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap max-w-full ${toneCls}`}>
      {tone === 'ok' && <Check size={9} className="flex-shrink-0" />}
      {(tone === 'warn' || tone === 'error') && <AlertTriangle size={9} className="flex-shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Kachel der Statusleiste: Titel, Zustand, eine Zeile Detail — Klick springt zum Bereich. */
export function StateTile({ icon, title, state, isDark, onClick }: {
  icon: React.ReactNode; title: string; state: AdminState; isDark: boolean; onClick: () => void;
}) {
  const c = cls(isDark);
  return (
    <button onClick={onClick} title={state.detail || undefined}
      className={`text-left rounded-lg border px-3 py-2 space-y-1 min-w-0 transition-colors ${c.border2} ${c.hover}`}>
      <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${c.text}`}>
        <span className={c.muted2}>{icon}</span>{title}
      </span>
      <span className="block"><StateChip tone={state.tone} label={state.label} isDark={isDark} /></span>
      {state.detail && <span className={`block text-[10px] truncate ${c.muted}`}>{state.detail}</span>}
    </button>
  );
}

/**
 * Bereichskarte: Kopfzeile mit Zeichen, Titel und Zustand; eine Zeile
 * Erklärung, mehr auf Klick; darunter der Inhalt.
 */
export function AdminSection({ id, icon, title, state, hint, more, isDark, action, children }: {
  id: string;
  icon: React.ReactNode;
  title: string;
  state?: AdminState;
  /** ein Satz, immer sichtbar */
  hint?: React.ReactNode;
  /** der Rest — klappt über «mehr» auf */
  more?: React.ReactNode;
  isDark: boolean;
  /** rechts in der Kopfzeile, z. B. ein Schalter */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const c = cls(isDark);
  const [open, setOpen] = useState(false);
  return (
    <section id={id} className={`rounded-lg border scroll-mt-4 ${c.border2} ${c.panel}`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${c.border}`}>
        <span className={c.muted2}>{icon}</span>
        <h2 className={`text-xs font-semibold ${c.text}`}>{title}</h2>
        {state && <StateChip tone={state.tone} label={state.label} isDark={isDark} title={state.detail} />}
        {action && <span className="ml-auto flex items-center gap-2">{action}</span>}
      </div>
      <div className="px-4 py-3 space-y-3">
        {hint && (
          <p className={`text-[11px] leading-relaxed ${c.muted}`}>
            {hint}
            {more && (
              <button onClick={() => setOpen(!open)} className={`ml-1.5 inline-flex items-center gap-0.5 hover:underline ${c.muted2}`}>
                {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}{open ? 'weniger' : 'mehr'}
              </button>
            )}
          </p>
        )}
        {more && open && <div className={`text-[11px] leading-relaxed space-y-1.5 ${c.muted}`}>{more}</div>}
        {children}
      </div>
    </section>
  );
}

/** Schalter «an/aus» — für die Kopfzeile eines Bereichs. */
export function Switch({ on, onChange, isDark, label, disabled, title }: {
  on: boolean; onChange: (v: boolean) => void; isDark: boolean; label?: string; disabled?: boolean; title?: string;
}) {
  const c = cls(isDark);
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      title={title ?? (on ? 'Ausschalten' : 'Einschalten')}
      className={`flex items-center gap-2 text-[11px] disabled:opacity-40 ${c.muted2}`}>
      {label && <span>{label}</span>}
      <span className={`relative inline-block w-8 h-[18px] rounded-full transition-colors ${
        on ? (isDark ? 'bg-emerald-500' : 'bg-emerald-600') : (isDark ? 'bg-white/20' : 'bg-black/20')}`}>
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all ${on ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
      <span className={`w-6 ${on ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : c.muted}`}>{on ? 'an' : 'aus'}</span>
    </button>
  );
}

/** Feldbeschriftung — in Textfarbe, mit optionalem Hinweis daneben. */
export function FieldLabel({ children, isDark, hint }: { children: React.ReactNode; isDark: boolean; hint?: React.ReactNode }) {
  const c = cls(isDark);
  return (
    <label className={`block text-[10px] uppercase tracking-wider mb-1 ${c.text}`}>
      {children}{hint && <span className={`ml-1.5 normal-case tracking-normal ${c.muted}`}>{hint}</span>}
    </label>
  );
}
