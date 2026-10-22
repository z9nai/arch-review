// Auftritt: Firma und Logo in der Kopfzeile.
//
// Beides liegt in der `model.json` — das Logo als Data-URI. Eine zweite
// Datei im geteilten Ordner wäre umständlicher (SharePoint, Rechte,
// Verweise), und eine Adresse von aussen gäbe es in der Bankenzone nicht.
// Dafür muss die Datei klein bleiben; grosse werden abgewiesen.
// Gespeichert wird über das Autosave des Admins.
import { useRef, useState } from 'react';
import { Image, Trash2, Upload } from 'lucide-react';
import type { Model } from '../types';
import { cls } from '../ui';
import { FieldLabel } from './adminUi';

/** Grenze für das Logo. Ein PNG dieser Grösse ist für eine Kopfzeile üppig. */
export const LOGO_MAX = 200 * 1024;
const TYPES = /^image\/(png|jpeg|svg\+xml|webp|gif)$/;

export default function BrandingForm({ draft, isDark, onChange }: {
  draft: Model;
  isDark: boolean;
  onChange: (patch: Partial<Pick<Model, 'company' | 'logo'>>) => void;
}) {
  const c = cls(isDark);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const logoWaehlen = async (file: File) => {
    setErr('');
    if (!TYPES.test(file.type)) {
      setErr(`«${file.name}» ist kein Bild (PNG, JPEG, SVG, WebP oder GIF).`);
      return;
    }
    if (file.size > LOGO_MAX) {
      setErr(`Das Bild ist ${Math.round(file.size / 1024)} KB gross — mehr als ${LOGO_MAX / 1024} KB passen nicht in die model.json.`);
      return;
    }
    const dataUri = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    onChange({ logo: dataUri });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <FieldLabel isDark={isDark}>Firma</FieldLabel>
          <input value={draft.company ?? ''} onChange={e => onChange({ company: e.target.value || undefined })}
            placeholder="z. B. Globex Bank AG"
            className={`w-full text-[11px] px-2 py-1.5 rounded border outline-none ${c.input}`} />
        </div>
        <div className="flex-shrink-0">
          <FieldLabel isDark={isDark} hint={`bis ${LOGO_MAX / 1024} KB`}>Logo</FieldLabel>
          <div className={`flex items-center gap-2 px-2 py-1 rounded border ${c.border2}`}>
            {draft.logo
              ? <img src={draft.logo} alt="" className="h-6 max-w-[8rem] object-contain" />
              : <Image size={14} className={c.muted} />}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void logoWaehlen(f); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${c.btn}`}>
              <Upload size={11} /> {draft.logo ? 'Ersetzen' : 'Wählen'}
            </button>
            {draft.logo && (
              <button onClick={() => { if (window.confirm('Logo entfernen?')) onChange({ logo: undefined }); }} title="Logo entfernen"
                className={`p-1 ${c.muted} hover:text-rose-500`}><Trash2 size={11} /></button>
            )}
          </div>
        </div>
      </div>
      {err && <p className={`text-[10px] ${isDark ? 'text-rose-300' : 'text-rose-700'}`}>{err}</p>}
    </div>
  );
}
