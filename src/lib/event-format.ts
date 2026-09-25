import { differenceInMinutes, format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { RECURRENCES, REMINDERS } from '@/lib/event-options';
import type { Category, EventRecord } from '@/db/events';
import { dayOf, parseDay, parseStamp, shiftDay, type Stamp, timeOf, todayKey } from '@/lib/dates';
import { colors } from '@/theme/tokens';

/** Début et fin d'une occurrence précise (un rdv répété garde ses heures, change de jour). */
export function occurrenceOf(e: EventRecord, day?: string): { start: Stamp; end: Stamp | null } {
  if (!day || day === dayOf(e.startsAt)) return { start: e.startsAt, end: e.endsAt };
  const spanDays = e.endsAt
    ? Math.round((parseDay(dayOf(e.endsAt)).getTime() - parseDay(dayOf(e.startsAt)).getTime()) / 86_400_000)
    : 0;
  return {
    start: `${day}T${timeOf(e.startsAt)}`,
    end: e.endsAt ? `${shiftDay(day, spanDays)}T${timeOf(e.endsAt)}` : null,
  };
}

/** 'vendredi 25 septembre' (+ ' · aujourd'hui'). */
export function longDate(day: string) {
  const s = format(parseDay(day), 'EEEE d MMMM', { locale: fr });
  return day === todayKey() ? `${s} · aujourd'hui` : s;
}

/** '30 min', '1 h', '1 h 30'. */
export function durationLabel(start: Stamp, end: Stamp | null) {
  if (!end) return null;
  const m = differenceInMinutes(parseStamp(end), parseStamp(start));
  if (m <= 0) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

export function timeRange(e: EventRecord, start: Stamp, end: Stamp | null) {
  if (e.allDay) return 'Toute la journée';
  return end ? `${timeOf(start)} – ${timeOf(end)}` : timeOf(start);
}

export const reminderLabel = (min: number | null) =>
  min === null ? null : REMINDERS.find((r) => r.value === min)?.label ?? `${min} min avant`;
export const recurrenceLabel = (r: EventRecord['recurrence']) =>
  r === 'none' ? null : RECURRENCES.find((x) => x.value === r)?.label ?? null;

/** 'auj. 09:00', 'demain 18:00', 'mer. 30/09 20:00'. */
export function deadlineLabel(at: Stamp) {
  const d = dayOf(at);
  const t = timeOf(at);
  if (d === todayKey()) return `auj. ${t}`;
  if (d === shiftDay(todayKey(), 1)) return `demain ${t}`;
  return `${format(parseDay(d), 'EEE dd/MM', { locale: fr })} ${t}`;
}

export function categoryOf(e: EventRecord, categories: Category[]) {
  const c = categories.find((x) => x.id === e.categoryId);
  return c ?? { id: -1, key: 'none', name: 'Sans catégorie', color: colors.textTertiary, icon: 'calendar' };
}
