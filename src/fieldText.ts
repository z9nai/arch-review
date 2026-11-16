// Text in PDF-Formularfeldern und Fingerabdrücke von Bemerkungen — ohne pdf-lib,
// damit auch der Mail-Import (Hauptbundle) dieselben Vergleiche nutzen kann.
import { normRemarks } from './richText';

// Text für ein Formularfeld: Das Feld rendert der Viewer mit Helvetica — Symbole
// ausserhalb WinAnsi lesbar ersetzen statt «?». Gleiche Umwandlung beim Einlesen,
// damit eine unverändert zurückgeschickte Bemerkung als unverändert erkannt wird.
const FIELD_SUBST: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇐': '<=', '≥': '>=', '≤': '<=', '≠': '!=',
  '✓': 'OK', '✔': 'OK', '✗': 'x', '✘': 'x', '⚠': '(!)', '☐': '[ ]', '☑': '[x]', '☒': '[x]',
};
export const toFieldText = (s: string): string =>
  s.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/[︎️‍]/g, '').replace(/./gu, c => FIELD_SUBST[c] ?? c)
    .replace(/[^\n\x20-\xFFŒœŠšŸŽžƒ–—‘’‚“”„†‡•…‰‹›€™]/g, '?');

// Feldinhalt so bereinigen, wie ihn der Viewer gespeichert hat: Acrobat/Vorschau
// trennen Zeilen mit \r bzw. \r\n, macOS liefert Umlaute teils zerlegt (NFD),
// dazu geschützte Leerzeichen, weiche Trennstriche und Leerraum am Zeilenende.
// Ohne das gilt jede Zeile als geändert, obwohl der Text gleich aussieht.
export const cleanFieldText = (s: string): string =>
  s.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\u00ad/g, '')
    .replace(/[ \t]+$/gm, '');

// FNV-1a (32 bit) — kurz, ASCII, genügt zum Wiedererkennen eines Texts
const fnv1a = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** Fingerabdruck einer Bemerkung, so wie sie im PDF-Feld steht (gleich für
 *  gespeicherten Text und zurückgelesenes Feld, Format zählt nicht) */
export const remarksFingerprint = (s: string): string => fnv1a(normRemarks(toFieldText(cleanFieldText(s.trim()))));
