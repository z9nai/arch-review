// Zeilen-Diff für die Vorschau beim Antworten-Import: alt (gespeichert) gegen
// neu (aus PDF/Mail). Längste gemeinsame Teilfolge über Zeilen; geänderte
// Zeilenpaare zusätzlich wortweise, damit bei Tabellen die geänderte Zelle
// auffällt. Bemerkungen sind kurz (selten > 100 Zeilen), O(n·m) genügt.

export type DiffOp = ' ' | '-' | '+';
export interface DiffPart { text: string; changed: boolean }
export interface DiffLine { op: DiffOp; text: string; parts?: DiffPart[] }
/** Zusammengeklappte unveränderte Zeilen */
export interface DiffGap { op: '…'; count: number }

/** Vergleichsschlüssel einer Zeile: nur der Inhalt zählt — Leerraum, Zeilenende-
 *  Zeichen, Unicode-Form (NFC/NFD) und weiche Trennstriche nicht. */
export const lineKey = (s: string): string =>
  s.normalize('NFC').replace(/\u00ad/g, '').replace(/[\s\u00a0\u2007\u202f]+/g, ' ').trim();

function lcs<T>(a: T[], b: T[]): DiffOp[] {
  const n = a.length, m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push(' '); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) { ops.push('-'); i++; }
    else { ops.push('+'); j++; }
  }
  while (i++ < n) ops.push('-');
  while (j++ < m) ops.push('+');
  return ops;
}

// Wörter, Leerraum, Tabellen-Trenner und Satzzeichen als eigene Stücke —
// «(Gesundheit,» und «Gesundheit» teilen so das Wort
const tokens = (s: string) => s.normalize('NFC').split(/(\s+|[|()[\]{},;:?!«»"])/).filter(Boolean);

function wordParts(oldLine: string, newLine: string): [DiffPart[], DiffPart[]] {
  const a = tokens(oldLine), b = tokens(newLine);
  const ops = lcs(a, b);
  const pa: DiffPart[] = [], pb: DiffPart[] = [];
  const push = (arr: DiffPart[], text: string, changed: boolean) => {
    const last = arr[arr.length - 1];
    if (last && last.changed === changed) last.text += text;
    else arr.push({ text, changed });
  };
  let i = 0, j = 0;
  for (const op of ops) {
    if (op === ' ') { push(pa, a[i++], false); push(pb, b[j++], false); }
    else if (op === '-') push(pa, a[i++], true);
    else push(pb, b[j++], true);
  }
  return [glue(pa), glue(pb)];
}

// Leerraum zwischen zwei markierten Stücken mitmarkieren («Leitung Kundendienst» am Stück)
function glue(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  parts.forEach((p, k) => {
    const changed = p.changed || (/^\s+$/.test(p.text) && !!parts[k - 1]?.changed && !!parts[k + 1]?.changed);
    const last = out[out.length - 1];
    if (last && last.changed === changed) last.text += p.text;
    else out.push({ text: p.text, changed });
  });
  return out;
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText === '' ? [] : oldText.split('\n');
  const b = newText === '' ? [] : newText.split('\n');
  // nur inhaltliche Änderungen: über die Schlüssel vergleichen, angezeigt wird der neue Text
  const ops = lcs(a.map(lineKey), b.map(lineKey));
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  for (const op of ops) {
    if (op === ' ') out.push({ op, text: b[j++] }), i++;
    else if (op === '-') out.push({ op, text: a[i++] });
    else out.push({ op, text: b[j++] });
  }
  // Blöcke «gelöscht, dann eingefügt»: ähnliche Zeilen einander zuordnen (auch bei
  // ungleicher Anzahl, Reihenfolge bleibt) und wortweise markieren; zugeordnete
  // Paare stehen direkt untereinander (− alt, + neu)
  const res: DiffLine[] = [];
  for (let k = 0; k < out.length;) {
    if (out[k].op !== '-') { res.push(out[k++]); continue; }
    let d = k; while (d < out.length && out[d].op === '-') d++;
    let e = d; while (e < out.length && out[e].op === '+') e++;
    res.push(...pairBlock(out.slice(k, d), out.slice(d, e)));
    k = e;
  }
  return res;
}

type Pair = { pa: DiffPart[]; pb: DiffPart[]; score: number };

// Ähnlichkeit zweier Zeilen: gemeinsamer Text (ohne Leerraum) im Verhältnis zur kürzeren
function similar(oldLine: string, newLine: string): Pair | null {
  const [pa, pb] = wordParts(oldLine, newLine);
  const same = pb.filter(p => !p.changed).reduce((s, p) => s + p.text.replace(/\s+/g, '').length, 0);
  const len = Math.min(oldLine.replace(/\s+/g, '').length, newLine.replace(/\s+/g, '').length);
  // kaum Gemeinsames: nicht zuordnen, ganze Zeile markieren reicht
  return len > 0 && same >= len / 3 ? { pa, pb, score: same / len } : null;
}

function pairBlock(dels: DiffLine[], ins: DiffLine[]): DiffLine[] {
  const n = dels.length, m = ins.length;
  if (!n || !m || n * m > 900) return [...dels, ...ins];
  const pair: (Pair | null)[][] = dels.map(a => ins.map(b => similar(a.text, b.text)));
  // beste Zuordnung in Reihenfolge (wie LCS, gewichtet mit der Ähnlichkeit)
  const best: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const p = pair[i][j];
      best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], p ? p.score + best[i + 1][j + 1] : 0);
    }
  }
  const res: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    const p = pair[i][j];
    if (p && best[i][j] === p.score + best[i + 1][j + 1]) {
      res.push({ ...dels[i++], parts: p.pa }, { ...ins[j++], parts: p.pb });
    } else if (best[i][j] === best[i + 1][j]) res.push(dels[i++]);
    else res.push(ins[j++]);
  }
  while (i < n) res.push(dels[i++]);
  while (j < m) res.push(ins[j++]);
  return res;
}

/** Unveränderte Strecken bis auf `context` Zeilen um jede Änderung zuklappen */
export function collapse(lines: DiffLine[], context = 1): (DiffLine | DiffGap)[] {
  const keep = lines.map(l => l.op !== ' ');
  lines.forEach((l, k) => {
    if (l.op === ' ') return;
    for (let c = 1; c <= context; c++) {
      if (k - c >= 0) keep[k - c] = true;
      if (k + c < lines.length) keep[k + c] = true;
    }
  });
  const out: (DiffLine | DiffGap)[] = [];
  let gap = 0;
  lines.forEach((l, k) => {
    if (keep[k]) {
      if (gap) out.push({ op: '…', count: gap });
      gap = 0;
      out.push(l);
    } else gap++;
  });
  if (gap) out.push({ op: '…', count: gap });
  return out;
}
