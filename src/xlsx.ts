// Minimaler XLSX-Leser (ohne Bibliothek): .xlsx ist ein ZIP mit XML-Dateien.
// Gelesen wird nur das erste Tabellenblatt als Textraster — Zahlen bleiben
// als Text der Zelle; Zellen mit Datumsformat werden zu yyyy-mm-dd (sonst
// stünde dort die Excel-Seriennummer, siehe excelDate). Entpackt wird mit der
// DecompressionStream-API des Browsers.

interface ZipEntry { name: string; method: number; compSize: number; offset: number }

function readZipEntries(buf: ArrayBuffer): ZipEntry[] {
  const v = new DataView(buf);
  // End of Central Directory: am Dateiende, vor einem allfälligen Kommentar
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige Excel-Datei (.xlsx).');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Excel-Datei ist beschädigt.');
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out.push({ name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readZipText(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const v = new DataView(buf);
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const data = new Uint8Array(buf, start, e.compSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error(`Excel-Datei: Kompression ${e.method} wird nicht unterstützt.`);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const parseXml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');
const byTag = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS('*', tag));

// «AB12» → Spaltenindex 27
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

// Text einer Zelle/eines Shared Strings: alle <t>, ohne Lautschrift (<rPh>)
const textOf = (node: Element) =>
  byTag(node, 't').filter(t => t.parentElement?.localName !== 'rPh').map(t => t.textContent ?? '').join('');

// Excel-Seriennummer → yyyy-mm-dd (Basis 30.12.1899, deckt den Schaltjahr-Fehler von 1900 ab März ab)
function serialToIso(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Stil-Indizes (Attribut s der Zelle) mit Datumsformat: eingebaute Formate
// 14–22 und 45–47 sowie eigene Formate mit Tag/Monat/Jahr (ohne Text in "…"/[…])
function dateStyles(stylesXml: string | null): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const doc = parseXml(stylesXml);
  const custom = new Map(byTag(doc, 'numFmt').map(f => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '']));
  const isDate = (id: number) => {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const code = custom.get(id);
    return !!code && /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
  };
  const xfs = byTag(doc, 'cellXfs')[0];
  if (xfs) Array.from(xfs.children).forEach((xf, i) => { if (isDate(Number(xf.getAttribute('numFmtId')))) out.add(i); });
  return out;
}

/** Spaltenindex → Buchstabe wie in Excel (0 → A, 26 → AA) */
export function colLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Erstes Tabellenblatt als Zeilen von Zellentexten (leere Zellen = '') */
export async function readXlsxRows(buf: ArrayBuffer): Promise<string[][]> {
  const entries = readZipEntries(buf);
  const entry = (name: string) => entries.find(e => e.name === name);
  const text = async (name: string) => { const e = entry(name); return e ? readZipText(buf, e) : null; };

  // erstes Blatt laut workbook.xml (Reihenfolge der Reiter), Pfad aus den Beziehungen
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await text('xl/workbook.xml');
  const rels = await text('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = byTag(parseXml(wb), 'sheet')[0];
    const rid = first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? first?.getAttribute('r:id');
    const target = byTag(parseXml(rels), 'Relationship').find(r => r.getAttribute('Id') === rid)?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const sheet = await text(sheetPath);
  if (!sheet) throw new Error('Excel-Datei enthält kein Tabellenblatt.');

  const sst = await text('xl/sharedStrings.xml');
  const shared = sst ? byTag(parseXml(sst), 'si').map(textOf) : [];
  const dates = dateStyles(await text('xl/styles.xml'));

  const rows: string[][] = [];
  for (const row of byTag(parseXml(sheet), 'row')) {
    const r = Number(row.getAttribute('r')) - 1;
    const cells: string[] = [];
    let next = 0;
    for (const c of byTag(row, 'c')) {
      const ref = c.getAttribute('r');
      const i = ref ? colIndex(ref) : next;
      next = i + 1;
      const t = c.getAttribute('t');
      const raw = byTag(c, 'v')[0]?.textContent ?? '';
      cells[i] = t === 's' ? (shared[Number(raw)] ?? '')
        : t === 'inlineStr' ? textOf(c)
        : t === 'b' ? (raw === '1' ? 'ja' : 'nein')
        : raw && !t && dates.has(Number(c.getAttribute('s'))) && !isNaN(Number(raw)) ? serialToIso(Number(raw))
        : raw;
    }
    rows[r >= 0 ? r : rows.length] = Array.from(cells, x => (x ?? '').trim());
  }
  return Array.from(rows, r => r ?? []);
}

/** Datumszelle → yyyy-mm-dd: Excel-Seriennummer oder Text wie 29.07.2026 / 2026-07-29 */
export function excelDate(cell: string): string | undefined {
  const s = cell.trim();
  if (!s) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (/^\d+(\.\d+)?$/.test(s)) return serialToIso(Number(s));
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}
