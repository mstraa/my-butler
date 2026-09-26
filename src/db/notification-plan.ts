import { addMinutes, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getAgendaDays, getLateItems, occurrencesInRange, type Recurrence } from '@/db/agenda';
import { ageAt, nextOccurrence } from '@/db/birthdays';
import { OLD_DAYS } from '@/db/wishes';
import type { DayPayload } from '../../modules/day-notification';
import { dayKey, dayOf, type DayKey, parseDay, parseStamp, shiftDay, type Stamp, stamp, timeOf } from '@/lib/dates';

/*
 * Plan des notifications locales, calculé depuis la base (sans rien planifier : voir lib/notifications).
 * Il est recalculé à chaque changement de données et au retour dans l'app, puis tout est replanifié.
 */

export type NotifChannel = 'rappels' | 'retards' | 'anniversaires' | 'envies';

export type PlannedNotif = {
  id: string;
  at: Date;
  channel: NotifChannel;
  title: string;
  body: string;
  /** Écran ouvert au toucher. */
  url: string;
};

export type NotifSettings = {
  /** Notification épinglée « Ma journée ». */
  journee: boolean;
  /** Heure de la notification « Ma journée » ('HH:mm'). */
  journeeTime: string;
  /** Rappels de rendez-vous et de tâches, échéances et relances. */
  rappels: boolean;
  anniversaires: boolean;
  /** Envie en attente depuis 30 jours. */
  envies: boolean;
};

export const DEFAULT_SETTINGS: NotifSettings = { journee: true, journeeTime: '07:30', rappels: true, anniversaires: true, envies: true };

const KEYS: Record<keyof NotifSettings, string> = {
  journee: 'notif:journee', journeeTime: 'notif:journee_time', rappels: 'notif:rappels',
  anniversaires: 'notif:anniversaires', envies: 'notif:envies',
};

export async function getNotifSettings(db: SQLiteDatabase): Promise<NotifSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'notif:%'");
  const by = new Map(rows.map((r) => [r.key, r.value]));
  const flag = (k: keyof NotifSettings) => (by.has(KEYS[k]) ? by.get(KEYS[k]) === '1' : (DEFAULT_SETTINGS[k] as boolean));
  return {
    journee: flag('journee'),
    journeeTime: by.get(KEYS.journeeTime) ?? DEFAULT_SETTINGS.journeeTime,
    rappels: flag('rappels'),
    anniversaires: flag('anniversaires'),
    envies: flag('envies'),
  };
}

export async function setNotifSetting<K extends keyof NotifSettings>(db: SQLiteDatabase, key: K, value: NotifSettings[K]) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    KEYS[key], typeof value === 'boolean' ? (value ? '1' : '0') : String(value),
  );
}

/** Horizons : assez loin pour survivre à quelques jours sans ouvrir l'app, sans dépasser la limite d'Android. */
const EVENT_DAYS = 14;
const NAG_DAYS = 7;
const LONG_DAYS = 60;
/** Android garde au plus ~500 alarmes par app : on s'arrête bien avant. */
const MAX_NOTIFS = 250;

const at = (day: DayKey, hhmm: string) => parseStamp(`${day}T${hhmm}`);

/** 15 → « dans 15 min », 60 → « dans 1 h », 1440 → « demain », 0 → « maintenant ». */
export function beforeLabel(min: number) {
  if (min <= 0) return 'maintenant';
  if (min < 60) return `dans ${min} min`;
  if (min === 1440) return 'demain';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `dans ${h} h ${String(m).padStart(2, '0')}` : `dans ${h} h`;
}

/** « hier 18:00 », « mar. 22/09 », « aujourd'hui 09:00 » : quand une échéance est passée. */
function dueLabel(due: Stamp, ref: Date) {
  const d = dayOf(due);
  const today = dayKey(ref);
  if (d === today) return `aujourd'hui ${timeOf(due)}`;
  if (d === shiftDay(today, -1)) return `hier ${timeOf(due)}`;
  return format(parseDay(d), 'EEE dd/MM', { locale: fr });
}

export async function planNotifications(db: SQLiteDatabase, s: NotifSettings, now = new Date()): Promise<PlannedNotif[]> {
  const today = dayKey(now);
  const out: PlannedNotif[] = [];
  const push = (n: PlannedNotif) => {
    if (n.at.getTime() > now.getTime() + 5_000) out.push(n);
  };

  if (s.rappels) {
    /* Rendez-vous : rappel avant chaque occurrence (répétitions comprises). */
    const events = await db.getAllAsync<{
      id: number; title: string; starts_at: Stamp; all_day: number; location: string | null;
      reminder_min: number; recurrence: Recurrence;
    }>(
      `SELECT id, title, starts_at, all_day, location, reminder_min, recurrence FROM events
        WHERE reminder_min IS NOT NULL AND cancelled_at IS NULL AND starts_at < ?`,
      `${shiftDay(today, EVENT_DAYS + 1)}T00:00`,
    );
    for (const e of events) {
      const time = e.all_day ? '09:00' : timeOf(e.starts_at);
      for (const occ of occurrencesInRange(dayOf(e.starts_at), e.recurrence, today, shiftDay(today, EVENT_DAYS))) {
        const start = at(occ, time);
        const details = [e.all_day ? 'toute la journée' : time, e.location].filter(Boolean).join(' · ');
        push({
          id: `rdv-${e.id}-${occ}`,
          at: addMinutes(start, -e.reminder_min),
          channel: 'rappels',
          title: e.title,
          body: `${beforeLabel(e.reminder_min)} · ${details}`,
          url: `/rdv/apercu/${e.id}?day=${occ}`,
        });
      }
    }

    /* Échéances des rendez-vous (« confirmer avant mardi ») : au moment où elles passent. */
    const deadlines = await db.getAllAsync<{ id: number; title: string; label: string | null; deadline_at: Stamp }>(
      `SELECT id, title, deadline_label AS label, deadline_at FROM events
        WHERE deadline_state = 'open' AND deadline_at IS NOT NULL AND cancelled_at IS NULL AND deadline_at < ?`,
      `${shiftDay(today, LONG_DAYS)}T00:00`,
    );
    for (const e of deadlines) {
      push({
        id: `echeance-rdv-${e.id}`,
        at: parseStamp(e.deadline_at),
        channel: 'retards',
        title: `Échéance passée : ${e.label ? `${e.label} · ` : ''}${e.title}`,
        body: 'Rendez-vous · à régler dans « En retard »',
        url: '/en-retard',
      });
    }

    /* Tâches : rappel avant l'échéance, échéance passée, puis relance quotidienne tant qu'elle traîne. */
    const tasks = await db.getAllAsync<{
      id: number; title: string; due_at: Stamp; reminder_min: number | null; show_late: number; nag_at: string | null;
    }>(
      "SELECT id, title, due_at, reminder_min, show_late, nag_at FROM tasks WHERE state = 'open' AND due_at IS NOT NULL",
    );
    for (const t of tasks) {
      const due = parseStamp(t.due_at);
      if (t.reminder_min !== null) {
        push({
          id: `tache-${t.id}`,
          at: addMinutes(due, -t.reminder_min),
          channel: 'rappels',
          title: t.title,
          body: `Tâche · échéance ${beforeLabel(t.reminder_min)} (${timeOf(t.due_at)})`,
          url: `/tache/apercu/${t.id}`,
        });
      }
      if (!t.show_late) continue;
      push({
        id: `echeance-tache-${t.id}`,
        at: due,
        channel: 'retards',
        title: `Échéance passée : ${t.title}`,
        body: 'Tâche · à faire, reporter ou abandonner',
        url: '/en-retard',
      });
      if (t.nag_at) {
        for (let i = 0; i <= NAG_DAYS; i++) {
          const when = at(shiftDay(today, i), t.nag_at);
          if (when <= due) continue;
          push({
            id: `relance-${t.id}-${i}`,
            at: when,
            channel: 'retards',
            title: `Toujours en retard : ${t.title}`,
            body: `Échéance ${dueLabel(t.due_at, when)}`,
            url: '/en-retard',
          });
        }
      }
    }
  }

  if (s.anniversaires) {
    /* Anniversaires : J-7, J-1, le jour même, et le dernier jour pour acheter le cadeau. */
    const rows = await db.getAllAsync<{
      id: number; name: string; month: number; day: number; year: number | null;
      remind_d7: number; remind_d1: number; remind_d0: number; remind_time: string; track_gifts: number; buy_days: number;
    }>('SELECT * FROM birthdays');
    const given = new Set(
      (await db.getAllAsync<{ birthday_id: number; year: number }>('SELECT birthday_id, year FROM gifts_given')).map(
        (g) => `${g.birthday_id}-${g.year}`,
      ),
    );
    for (const b of rows) {
      const occ = nextOccurrence(b.month, b.day, today);
      if (occ > shiftDay(today, LONG_DAYS)) continue;
      const age = ageAt(b, occ);
      const who = `anniversaire de ${b.name}${age ? ` (${age} ans)` : ''}`;
      const url = `/anniversaires/${b.id}`;
      const remind = (offset: number, id: string, title: string, body: string) =>
        push({ id: `anniv-${b.id}-${id}-${occ}`, at: at(shiftDay(occ, -offset), b.remind_time), channel: 'anniversaires', title, body, url });
      if (b.remind_d7) remind(7, 'j7', `Dans 7 jours : ${who}`, b.track_gifts ? 'Une idée de cadeau ?' : format(parseDay(occ), 'EEEE d MMMM', { locale: fr }));
      if (b.remind_d1) remind(1, 'j1', `Demain : ${who}`, 'Pense à lui souhaiter');
      if (b.remind_d0) remind(0, 'j0', `Aujourd'hui : ${who}`, 'Un message, un appel ?');
      if (b.track_gifts && b.buy_days > 0 && !given.has(`${b.id}-${occ.slice(0, 4)}`)) {
        remind(b.buy_days, 'cadeau', `Cadeau pour ${b.name}`, `Dernier jour conseillé pour l'acheter · anniversaire ${b.buy_days === 1 ? 'demain' : `dans ${b.buy_days} jours`}`);
      }
    }
  }

  if (s.envies) {
    /* Envie en attente qui atteint 30 jours : le moment de décider. */
    const wishes = await db.getAllAsync<{ id: number; title: string; created_at: Stamp }>(
      "SELECT id, title, created_at FROM wishes WHERE state = 'waiting'",
    );
    for (const w of wishes) {
      push({
        id: `envie-${w.id}`,
        at: at(shiftDay(dayOf(w.created_at), OLD_DAYS), '18:30'),
        channel: 'envies',
        title: `${w.title} : ${OLD_DAYS} jours d'envie`,
        body: "Toujours envie ? L'acheter ou l'abandonner.",
        url: `/envie/${w.id}`,
      });
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_NOTIFS);
}

export type DaySummary = {
  day: DayKey;
  /** Repliée : « 3 rdv aujourd'hui · 3 en retard » (texte seul, pour la notification standard). */
  title: string;
  /** Première ligne (visible repliée), puis le détail (visible dépliée). */
  body: string;
  empty: boolean;
  /** Même contenu, structuré pour la mise en page native (modules/day-notification). */
  payload: DayPayload;
};

/**
 * Contenu de « Ma journée » pour un jour, vu à l'instant `ref` : anniversaires (du jour, du lendemain),
 * rendez-vous du jour, éléments en retard.
 */
export async function getDaySummary(db: SQLiteDatabase, day: DayKey, ref: Date): Promise<DaySummary> {
  const [days, late] = await Promise.all([getAgendaDays(db, day, shiftDay(day, 1)), getLateItems(db, stamp(ref))]);
  const items = days[0]?.items ?? [];
  const rdv = items.filter((i) => i.kind === 'event' && !i.cancelled);
  const bdayText = (title: string) => title.replace('Anniv. ', 'anniversaire de ').replace(/ · (\d+) ans$/, ' ($1 ans)');
  const birthdays = [
    ...items.filter((i) => i.kind === 'birthday').map((i) => ({ lead: "Aujourd'hui", text: bdayText(i.title) })),
    ...(days[1]?.items ?? []).filter((i) => i.kind === 'birthday').map((i) => ({ lead: 'Demain', text: bdayText(i.title) })),
  ];

  const refTime = dayKey(ref) === day ? format(ref, 'HH:mm') : '00:00';
  const next = rdv.find((r) => !r.allDay && r.time >= refTime);
  const rdvPart = rdv.length ? `${rdv.length} rdv aujourd'hui` : '';
  const latePart = late.length ? `${late.length} en retard` : '';
  const title = [rdvPart, latePart].filter(Boolean).join(' · ') || (birthdays.length ? 'Ma journée' : "Rien de prévu aujourd'hui");
  const nextLine = next ? `Prochain : ${next.time} ${next.title}` : birthdays.length ? `${birthdays[0].lead} : ${birthdays[0].text}` : '';

  const lines: string[] = [];
  if (nextLine) lines.push(nextLine);
  lines.push(...birthdays.map((b) => `${b.lead} : ${b.text}`).filter((l) => l !== nextLine));
  if (rdv.length) lines.push('', ...rdv.map((r) => `${r.allDay ? 'Journée' : r.time}  ${r.title}`));
  if (late.length) {
    lines.push('', `En retard · ${late.length}`);
    lines.push(...late.slice(0, 4).map((l) => `${l.type === 'event' ? 'RDV · ' : ''}${l.title} — ${dueLabel(l.due, ref)}`));
    if (late.length > 4) lines.push(`+${late.length - 4} autre${late.length > 5 ? 's' : ''}`);
  }

  return {
    day,
    title,
    body: lines.join('\n').trim(),
    empty: !rdv.length && !late.length && !birthdays.length,
    payload: {
      day,
      title: rdvPart || (latePart ? '' : title),
      titleAccent: latePart || undefined,
      next: nextLine,
      birthdays,
      rdvLabel: `Rendez-vous du jour · ${rdv.length}`,
      rdv: rdv.map((r) => ({
        time: r.allDay ? 'Journée' : r.time,
        title: r.title,
        color: r.color,
        highlight: r === next,
      })),
      lateLabel: `En retard · sans action · ${late.length}`,
      late: late.map((l) => ({ title: l.title, when: dueLabel(l.due, ref), rdv: l.type === 'event' })),
    },
  };
}
