import { type DayKey, parseDay } from '@/lib/dates';

/*
 * Alarmes quotidiennes d'un objectif ou d'un suivi : chacune une heure et des jours de la semaine.
 * Les jours sont un masque : bit 0 = lundi … bit 6 = dimanche (127 = tous les jours).
 * En base, la liste est une colonne JSON (`alarms`) : [{"time":"21:00","days":127}].
 */

export type DailyAlarm = { time: string; days: number };

export const ALL_DAYS = 127;
export const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEKDAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** Rang du jour dans la semaine, lundi = 0. */
export const weekdayIndex = (day: DayKey) => (parseDay(day).getDay() + 6) % 7;

export const alarmOnDay = (days: number, day: DayKey) => (days & (1 << weekdayIndex(day))) !== 0;

/** Lu depuis la colonne JSON `alarms` (une valeur illisible ne donne aucune alarme). */
export function alarmsOf(json: string | null): DailyAlarm[] {
  try {
    const list: unknown = JSON.parse(json || '[]');
    if (!Array.isArray(list)) return [];
    return list
      .filter((a): a is DailyAlarm => typeof a?.time === 'string' && /^\d{2}:\d{2}$/.test(a.time))
      .map((a) => ({ time: a.time, days: (Number(a.days) & ALL_DAYS) || ALL_DAYS }));
  } catch {
    return [];
  }
}

/** Écrit dans la colonne `alarms` : sans les doublons (même heure, mêmes jours). */
export const alarmsJson = (list: DailyAlarm[]) =>
  JSON.stringify(list.filter((a, i) => list.findIndex((b) => b.time === a.time && b.days === a.days) === i));

/** « tous les jours », « en semaine », « le week-end », « lun., mer., ven. ». */
export function alarmDaysLabel(days: number) {
  if (days === ALL_DAYS) return 'tous les jours';
  if (days === 0b0011111) return 'en semaine';
  if (days === 0b1100000) return 'le week-end';
  return WEEKDAY_SHORT.filter((_, i) => days & (1 << i)).join(', ');
}

/** « 21:00 · tous les jours », « 07:00, 21:00 · en semaine », « 07:00 · en semaine, 10:00 · le week-end ». */
export function alarmsLabel(list: DailyAlarm[]) {
  if (!list.length) return 'Aucune';
  const sorted = [...list].sort((a, b) => a.time.localeCompare(b.time));
  if (sorted.every((a) => a.days === sorted[0].days)) return `${sorted.map((a) => a.time).join(', ')} · ${alarmDaysLabel(sorted[0].days)}`;
  return sorted.map((a) => `${a.time} · ${alarmDaysLabel(a.days)}`).join(', ');
}
