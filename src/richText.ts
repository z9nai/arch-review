// Formatierter Text in Bemerkungen und Antworten: gespeichert als einfaches
// Markdown (**fett**, *kursiv*, Aufzählungen «- », Links) plus Textfarbe als
// `[Text]{rot}` — so bleibt der Inhalt im JSON, im Verlauf und für eine KI
// lesbar, und das PDF (pdfRich) versteht dasselbe. Angezeigt wird über eine
// eigene marked-Instanz, die eingegebenes HTML nie ausführt (escaped) und nur
// http(s)/mailto-Links zulässt.
import { Marked, type Tokens } from 'marked';
import type { DirectoryUser } from './types';

/** Textfarben — Namen wie in der Syntax `[Text]{rot}`; Töne lesbar auf hell und dunkel */
export const TEXT_COLORS: Record<string, string> = {
  rot: '#dc2626',
  orange: '#ea580c',
  grün: '#16a34a',
  blau: '#2563eb',
  grau: '#6b7280',
};
const COLOR_NAMES = Object.keys(TEXT_COLORS).join('|');
export const COLOR_SPAN_RE = new RegExp(`\\[([^\\]]+)\\]\\{(${COLOR_NAMES})\\}`, 'g');

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const md = new Marked({ gfm: true, breaks: true });
md.use({
  renderer: {
    // eingegebenes HTML nur als Text
    html(token: Tokens.HTML | Tokens.Tag) { return escapeHtml(token.text); },
    link(token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      return /^(https?:|mailto:)/i.test(token.href)
        ? `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
        : text;
    },
    image(token: Tokens.Image) { return escapeHtml(token.text); },
  },
  extensions: [{
    name: 'colorSpan',
    level: 'inline',
    start(src: string) { return src.indexOf('['); },
    tokenizer(src: string) {
      const m = new RegExp(`^\\[([^\\]]+)\\]\\{(${COLOR_NAMES})\\}`).exec(src);
      if (!m) return undefined;
      return { type: 'colorSpan', raw: m[0], color: m[2], tokens: this.lexer.inlineTokens(m[1]) };
    },
    renderer(token) {
      const color = TEXT_COLORS[(token as unknown as { color: string }).color] ?? 'inherit';
      return `<span style="color:${color}">${this.parser.parseInline(token.tokens ?? [])}</span>`;
    },
  }],
});

/** Markdown → HTML für die Anzeige; erwähnte Personen («@Name») hervorgehoben */
export function renderRich(text: string, mentions?: DirectoryUser[]): string {
  let html = md.parse(text ?? '', { async: false }) as string;
  for (const m of [...(mentions ?? [])].sort((a, b) => b.name.length - a.name.length)) {
    const at = escapeHtml(`@${m.name}`);
    html = html.split(at).join(`<a href="mailto:${escapeHtml(m.email)}" class="mention" title="${escapeHtml(m.email)}">${at}</a>`);
  }
  return html;
}

/** Text ohne Formatierungszeichen — z. B. für Suchtreffer */
export const stripRich = (s: string) => s
  .replace(COLOR_SPAN_RE, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/(?<![\w*])\*([^*]+)\*(?![\w*])/g, '$1')
  .replace(/(?<![\w_])_([^_]+)_(?![\w_])/g, '$1');

// ── Formatieren einer Markierung (Textarea) ──────────────────────────────────

export type Edit = { value: string; start: number; end: number };

/** Markierung mit before/after umschliessen — ist sie schon umschlossen, wird ausgepackt. */
export function toggleWrap(v: string, s: number, e: number, before: string, after: string): Edit {
  if (s >= before.length && v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
    return { value: v.slice(0, s - before.length) + v.slice(s, e) + v.slice(e + after.length), start: s - before.length, end: e - before.length };
  }
  const sel = v.slice(s, e);
  if (sel.startsWith(before) && sel.endsWith(after) && sel.length >= before.length + after.length) {
    const inner = sel.slice(before.length, sel.length - after.length);
    return { value: v.slice(0, s) + inner + v.slice(e), start: s, end: s + inner.length };
  }
  return { value: v.slice(0, s) + before + sel + after + v.slice(e), start: s + before.length, end: e + before.length };
}

/** Textfarbe setzen; liegt die Markierung schon in einer Farbe, wird sie ersetzt bzw. (gleiche Farbe) entfernt. */
export function setColor(v: string, s: number, e: number, color: string): Edit {
  const sel = v.slice(s, e);
  // ganze Farbmarke markiert: «[x]{rot}»
  const whole = new RegExp(`^\\[([^\\]]+)\\]\\{(${COLOR_NAMES})\\}$`).exec(sel);
  if (whole) {
    const inner = whole[1];
    const rep = whole[2] === color ? inner : `[${inner}]{${color}}`;
    const off = whole[2] === color ? 0 : 1;
    return { value: v.slice(0, s) + rep + v.slice(e), start: s + off, end: s + off + inner.length };
  }
  // nur der Text in einer Farbmarke markiert: «[» davor, «]{farbe}» danach
  const tail = new RegExp(`^\\]\\{(${COLOR_NAMES})\\}`).exec(v.slice(e));
  if (s > 0 && v[s - 1] === '[' && tail) {
    const keep = tail[1] === color;
    const value = keep
      ? v.slice(0, s - 1) + sel + v.slice(e + tail[0].length)
      : v.slice(0, e) + `]{${color}}` + v.slice(e + tail[0].length);
    return keep ? { value, start: s - 1, end: e - 1 } : { value, start: s, end: e };
  }
  return { value: v.slice(0, s) + `[${sel}]{${color}}` + v.slice(e), start: s + 1, end: e + 1 };
}

/** Markierte Zeilen als Aufzählung «- » — sind alle schon eine, wird es zurückgenommen. */
export function toggleList(v: string, s: number, e: number): Edit {
  const from = v.lastIndexOf('\n', s - 1) + 1;
  const toIdx = v.indexOf('\n', e);
  const to = toIdx === -1 ? v.length : toIdx;
  const lines = v.slice(from, to).split('\n');
  const all = lines.every(l => /^\s*[-*•]\s+/.test(l) || !l.trim());
  const next = lines.map(l => (!l.trim() ? l : all ? l.replace(/^(\s*)[-*•]\s+/, '$1') : `- ${l}`)).join('\n');
  return { value: v.slice(0, from) + next + v.slice(to), start: from, end: from + next.length };
}

/** Fett, kursiv und Farbe in der Markierung entfernen. */
export function clearFormat(v: string, s: number, e: number): Edit {
  const plain = stripRich(v.slice(s, e));
  return { value: v.slice(0, s) + plain + v.slice(e), start: s, end: s + plain.length };
}
