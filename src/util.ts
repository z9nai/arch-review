import type React from 'react';

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Kleinbuchstaben, Bindestriche, keine Umlaute
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const pad = (n: number) => String(n).padStart(2, '0');

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ISO 8601 mit lokaler Zeitzone, z. B. "2026-08-14T09:30:00+02:00"
export function nowIsoWithTimezone(): string {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

// Textarea beim Fokussieren/Tippen auf die volle Höhe des Inhalts wachsen
// lassen, statt nur die feste rows-Höhe mit Scrollbalken zu zeigen.
export function autoGrow(e: React.FocusEvent<HTMLTextAreaElement> | React.FormEvent<HTMLTextAreaElement>): void {
  const t = e.currentTarget;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}
