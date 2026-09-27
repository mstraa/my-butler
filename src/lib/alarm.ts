import { type DayKey, parseDay } from '@/lib/dates';

/*
 * Alarme quotidienne d'un objectif ou d'un suivi : une heure et des jours de la semaine.
 * Les jours sont un masque : bit 0 = lundi … bit 6 = dimanche (127 = tous les jours).
 */

export type DailyAlarm = { time: string; days: number };

export const ALL_DAYS = 127;
export const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEKDAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** Rang du jour dans la semaine, lundi = 0. */
export const weekdayIndex = (day: DayKey) => (parseDay(day).getDay() + 6) % 7;

export const alarmOnDay = (days: number, day: DayKey) => (days & (1 << weekdayIndex(day))) !== 0;

/** Lu depuis les colonnes alarm_time / alarm_days. */
export const alarmOf = (time: string | null, days: number | null): DailyAlarm | null =>
  time ? { time, days: days || ALL_DAYS } : null;

/** « tous les jours », « en semaine », « le week-end », « lun., mer., ven. ». */
export function alarmDaysLabel(days: number) {
  if (days === ALL_DAYS) return 'tous les jours';
  if (days === 0b0011111) return 'en semaine';
  if (days === 0b1100000) return 'le week-end';
  return WEEKDAY_SHORT.filter((_, i) => days & (1 << i)).join(', ');
}

/** « 21:00 · tous les jours ». */
export const alarmLabel = (a: DailyAlarm | null) => (a ? `${a.time} · ${alarmDaysLabel(a.days)}` : 'Aucune');
