import * as Calendar from 'expo-calendar';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { applyGoogleSync, getGoogleSettings } from '@/db/google';
import { dayKey, type Stamp, stamp } from '@/lib/dates';

/*
 * Lecture des agendas du téléphone (Google Agenda passe par le fournisseur d'agendas d'Android).
 * Rien n'est jamais écrit dans ces agendas. (Android demande lecture et écriture ensemble : expo-calendar
 * exige les deux pour considérer l'accès accordé, on ne peut donc pas bloquer l'écriture.)
 */

/** Android seulement : pas d'agenda à lire ailleurs. */
export const calendarSupported = Platform.OS === 'android';

export type PhoneCalendar = {
  id: string;
  title: string;
  color: string;
  /** Compte du téléphone, ex. 'moi@gmail.com'. */
  account: string;
  isGoogle: boolean;
  isPrimary: boolean;
};

/** Occurrence lue dans un agenda : les rendez-vous répétés arrivent déjà dépliés. */
export type PhoneEvent = {
  /** Clé stable : id de l'évènement, plus la date de l'occurrence s'il est répété. */
  externalId: string;
  calendarId: string;
  title: string;
  startsAt: Stamp;
  /** null pour un évènement sur la journée. */
  endsAt: Stamp | null;
  allDay: boolean;
  location: string | null;
  /** Lien Google Meet trouvé dans la description, le lieu ou l'URL de l'évènement. */
  meetUrl: string | null;
};

export async function calendarAllowed() {
  if (!calendarSupported) return false;
  return (await Calendar.getCalendarPermissions()).granted;
}

/** Demande l'accès ; `false` si refusé (définitivement : seuls les réglages du téléphone le rendent). */
export async function requestCalendarAccess() {
  if (!calendarSupported) return false;
  const current = await Calendar.getCalendarPermissions();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Calendar.requestCalendarPermissions()).granted;
}

export async function listPhoneCalendars(): Promise<PhoneCalendar[]> {
  const cals = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return cals
    .map((c) => ({
      id: c.id,
      title: c.title,
      color: c.color ?? '#8E8E93',
      account: c.source?.name ?? c.ownerAccount ?? '',
      isGoogle: c.source?.type === 'com.google',
      isPrimary: !!c.isPrimary,
    }))
    .sort(
      (a, b) =>
        Number(b.isGoogle) - Number(a.isGoogle) ||
        a.account.localeCompare(b.account) ||
        Number(b.isPrimary) - Number(a.isPrimary) ||
        a.title.localeCompare(b.title),
    );
}

/** Google range le lien Meet dans la description (« Rejoindre avec Google Meet : https://meet.google.com/abc-defg-hij »). */
const MEET_RE = /(?:https?:\/\/)?meet\.google\.com\/[a-z0-9-]+(?:\?[^\s<>"')]*)?/i;

export function findMeetUrl(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t?.match(MEET_RE);
    if (m) return m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
  }
  return null;
}

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
/** Un évènement « journée » est stocké à minuit UTC : on lit sa date en UTC pour ne pas glisser d'un jour. */
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export async function listPhoneEvents(calendarIds: string[], from: Date, to: Date): Promise<PhoneEvent[]> {
  if (calendarIds.length === 0) return [];
  const events = await Calendar.listEvents(calendarIds, from, to);
  const out: PhoneEvent[] = [];
  for (const e of events) {
    if (e.status === Calendar.EventStatus.CANCELED) continue;
    const start = toDate(e.startDate);
    const end = toDate(e.endDate);
    const startsAt = e.allDay ? `${utcDay(start)}T00:00` : stamp(start);
    out.push({
      externalId: e.recurrenceRule ? `${e.id}@${start.toISOString()}` : String(e.id),
      calendarId: String(e.calendarId),
      title: e.title?.trim() || '(Sans titre)',
      startsAt,
      endsAt: e.allDay ? null : end > start ? stamp(end) : null,
      allDay: !!e.allDay,
      location: e.location?.trim() || null,
      meetUrl: findMeetUrl(e.notes, e.location, e.url),
    });
  }
  return out;
}

/** Fenêtre lue à chaque synchro : 2 mois en arrière, 1 an en avant. */
export function syncWindow(now = new Date()) {
  const from = new Date(now);
  from.setMonth(from.getMonth() - 2, 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setFullYear(to.getFullYear() + 1);
  to.setHours(0, 0, 0, 0);
  return { from, to, fromKey: dayKey(from), toKey: dayKey(to) };
}

let running: Promise<number> | null = null;

/**
 * Relit les agendas choisis et met la base à jour. Renvoie le nombre de rendez-vous changés
 * (0 sans agenda choisi ou sans autorisation). Une seule synchro à la fois.
 */
export function syncGoogle(db: SQLiteDatabase): Promise<number> {
  running ??= (async () => {
    try {
      const { calendars } = await getGoogleSettings(db);
      const ids = Object.keys(calendars);
      if (ids.length === 0 || !(await calendarAllowed())) return 0;
      // Un agenda retiré du téléphone disparaît de la liste : on ne le lit plus.
      const present = new Set((await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).map((c) => c.id));
      const { from, to, fromKey, toKey } = syncWindow();
      const events = await listPhoneEvents(ids.filter((id) => present.has(id)), from, to);
      return await applyGoogleSync(db, events, fromKey, toKey);
    } finally {
      running = null;
    }
  })();
  return running;
}
