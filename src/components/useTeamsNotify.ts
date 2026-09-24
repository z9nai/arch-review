// Versand der Teams-Benachrichtigungen aus dem OnePager: sammelt die eigenen
// Kommentare mit noch offenen Empfängern (notifyPending), wartet nach dem
// letzten Kommentar die eingestellte Zeit, schickt dann je Empfänger/in EINE
// Chat-Nachricht mit allen Kommentaren und markiert sie als benachrichtigt.
// Beim Verlassen des Projekts (Zurück, Tab schliessen) wird sofort gesendet;
// was dabei nicht mehr durchkommt, bleibt offen und geht beim nächsten Öffnen.
import { useCallback, useEffect, useRef } from 'react';
import type { Comment, TeamsNotifySettings } from '../types';
import { buildTeamsHtml, ensureOneOnOneChat, resolveTeamsUser, sendChatMessage, TEAMS_SCOPES, teamsDelayMs, teamsFail, teamsMock, TeamsError } from '../teams';
import { deepLink } from '../util';

export type TeamsProblem = { reason: 'consent' | 'forbidden' | 'error'; message: string };

export function useTeamsNotify(opts: {
  slug: string;
  projectName: string;
  comments: Comment[];
  me: { id?: string; name: string; email?: string } | null;
  settings: TeamsNotifySettings | undefined;
  placeLabel: (target: string) => string;
  updateComments: (fn: (prev: Comment[]) => Comment[]) => Promise<boolean>;
  tryToken: (scopes: string[]) => Promise<{ ok: true; token: string } | { ok: false; reason: 'noAccount' | 'interaction' | 'error'; message: string }>;
  onProblem: (p: TeamsProblem) => void;
  onSent: (recipients: string[]) => void;
  onFailed: (message: string) => void;
}) {
  const { comments, me, settings } = opts;
  const enabled = settings?.enabled === true && !!me?.email;
  const myEmail = (me?.email ?? '').toLowerCase();
  const pending = enabled
    ? comments.filter(c => (c.author.email ?? '').toLowerCase() === myEmail && (c.notifyPending?.length ?? 0) > 0)
    : [];
  const pendingKey = pending.map(c => `${c.id}:${(c.notifyPending ?? []).join(',')}`).join('|');
  const newest = pending.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), '');

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const sendingRef = useRef(false);
  const problemShownRef = useRef(false);

  const send = useCallback(async () => {
    const o = optsRef.current;
    if (sendingRef.current || !o.me?.email) return;
    const mine = o.comments.filter(c => (c.author.email ?? '').toLowerCase() === (o.me?.email ?? '').toLowerCase() && (c.notifyPending?.length ?? 0) > 0);
    if (!mine.length) return;
    sendingRef.current = true;
    try {
      // Token — nie mit Redirect; fehlende Zustimmung wird einmal gemeldet
      let token = 'mock';
      const fail = teamsFail();
      if (fail === 'consent' || fail === 'forbidden') {
        if (!problemShownRef.current) {
          problemShownRef.current = true;
          o.onProblem(fail === 'consent'
            ? { reason: 'consent', message: 'Für Teams-Benachrichtigungen fehlt noch deine Zustimmung zu «Chats erstellen» und «Chatnachrichten senden» (Chat.Create, ChatMessage.Send).' }
            : { reason: 'forbidden', message: 'Microsoft Graph verweigert das Senden: Die Berechtigungen Chat.Create / ChatMessage.Send fehlen in der App-Registrierung (Entra → API-Berechtigungen).' });
        }
        return;
      }
      if (!teamsMock()) {
        const t = await o.tryToken(TEAMS_SCOPES);
        if (!t.ok) {
          if (t.reason === 'noAccount') return; // ohne Anmeldung kein Teams
          if (!problemShownRef.current) {
            problemShownRef.current = true;
            o.onProblem(t.reason === 'interaction'
              ? { reason: 'consent', message: 'Für Teams-Benachrichtigungen fehlt noch deine Zustimmung zu «Chats erstellen» und «Chatnachrichten senden» (Chat.Create, ChatMessage.Send).' }
              : { reason: 'error', message: t.message });
          }
          return;
        }
        token = t.token;
      }
      // je Empfänger/in eine Nachricht mit allen offenen Kommentaren
      const byRecipient = new Map<string, Comment[]>();
      for (const c of mine) for (const r of c.notifyPending ?? []) {
        const key = r.toLowerCase();
        if (key === (o.me?.email ?? '').toLowerCase()) continue;
        byRecipient.set(key, [...(byRecipient.get(key) ?? []), c]);
      }
      const done: { commentId: string; email: string }[] = [];
      const sentTo: string[] = [];
      let firstError: string | null = null;
      for (const [email, cs] of byRecipient) {
        try {
          const user = await resolveTeamsUser(token, email);
          if (!user) { firstError = firstError ?? `${email} wurde im Verzeichnis nicht gefunden.`; continue; }
          const chatId = await ensureOneOnOneChat(token, o.me?.id ?? 'me', user.id);
          const html = buildTeamsHtml({
            template: o.settings?.template,
            recipientName: user.displayName,
            senderName: o.me?.name ?? '',
            projectName: o.projectName,
            projectLink: deepLink(o.slug),
            lines: cs.map(c => {
              const root = c.parentId ? o.comments.find(x => x.id === c.parentId) : null;
              return {
                place: o.placeLabel(c.target),
                text: c.text,
                link: deepLink(o.slug, c.id),
                ...(root && (root.author.email ?? '').toLowerCase() === email ? { reply: true } : {}),
              };
            }),
          });
          await sendChatMessage(token, chatId, html, user);
          cs.forEach(c => done.push({ commentId: c.id, email }));
          sentTo.push(user.displayName);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (e instanceof TeamsError && e.forbidden && !problemShownRef.current) {
            problemShownRef.current = true;
            o.onProblem({ reason: 'forbidden', message: `Microsoft Graph verweigert das Senden: ${msg} Die Berechtigungen Chat.Create / ChatMessage.Send fehlen vermutlich in der App-Registrierung.` });
          }
          firstError = firstError ?? `${email}: ${msg}`;
        }
      }
      if (done.length) {
        await o.updateComments(prev => prev.map(c => {
          const mineDone = done.filter(d => d.commentId === c.id).map(d => d.email);
          if (!mineDone.length) return c;
          const pendingLeft = (c.notifyPending ?? []).filter(r => !mineDone.includes(r.toLowerCase()));
          const notified = [...(c.notified ?? []), ...mineDone.filter(e => !(c.notified ?? []).map(x => x.toLowerCase()).includes(e))];
          const { notifyPending: _drop, ...rest } = c;
          void _drop;
          return { ...rest, ...(pendingLeft.length ? { notifyPending: pendingLeft } : {}), notified };
        }));
        o.onSent(sentTo);
      }
      if (firstError) o.onFailed(`Teams-Benachrichtigung nicht zugestellt — ${firstError}`);
    } finally {
      sendingRef.current = false;
    }
  }, []);

  // Wartezeit nach dem letzten eigenen Kommentar mit Empfängern
  useEffect(() => {
    if (!pending.length) return;
    const due = Date.parse(newest) + teamsDelayMs(settings);
    const t = setTimeout(() => { void send(); }, Math.max(0, due - Date.now()));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, newest, settings?.delayMinutes, send]);

  // Verlassen: sofort senden (Zurück-Navigation wartet den Versand ab; beim
  // Schliessen des Tabs kommt durch, was der Browser noch zulässt)
  const flush = useCallback(() => send(), [send]);
  useEffect(() => {
    const h = () => { void send(); };
    window.addEventListener('pagehide', h);
    return () => { window.removeEventListener('pagehide', h); void send(); };
  }, [send]);

  return { flush, pendingCount: pending.length };
}
