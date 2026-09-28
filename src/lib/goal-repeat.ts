import { differenceInCalendarDays } from 'date-fns';

import { ALL_DAYS, alarmDaysLabel, alarmOnDay } from '@/lib/alarm';
import { type DayKey, monthIndex, monthStart, parseDay, shiftDay, shiftMonth, weekIndex, weekStart } from '@/lib/dates';

/*
 * Rythme d'un objectif (période personnalisée), en plus de son unité (jour, semaine, mois) :
 * - `days` : objectif du jour, seulement certains jours de la semaine (masque, bit 0 = lundi) ;
 * - `every` : une période sur N (tous les 2 jours, 1 semaine sur 2, 1 mois sur 3…), comptée depuis `from`.
 * Les périodes hors rythme sont du repos : rien à faire, elles ne cassent pas les séries.
 */

export type RepeatUnit = 'day' | 'week' | 'month';
export type GoalRepeat = { every: number; days: number; from: DayKey };

export const EVERY_PERIOD = (from: DayKey): GoalRepeat => ({ every: 1, days: ALL_DAYS, from });

export const isCustomRepeat = (r: GoalRepeat) => r.every > 1 || r.days !== ALL_DAYS;

/** Lu depuis les colonnes repeat_every / repeat_days / repeat_from. */
export const repeatOf = (every: number | null, days: number | null, from: string | null, fallback: DayKey): GoalRepeat => ({
  every: Math.max(1, every ?? 1),
  days: days || ALL_DAYS,
  from: from ?? fallback,
});

/** Premier jour de la période qui contient `day`. */
export function periodStartOf(unit: RepeatUnit, day: DayKey): DayKey {
  return unit === 'day' ? day : unit === 'week' ? weekStart(day) : monthStart(day);
}

/** Période suivante (ou précédente, n < 0). */
export function shiftPeriod(unit: RepeatUnit, day: DayKey, n: number): DayKey {
  const start = periodStartOf(unit, day);
  return unit === 'day' ? shiftDay(start, n) : unit === 'week' ? shiftDay(start, 7 * n) : shiftMonth(start, n);
}

/** Écart en périodes entre `from` et `day`. */
function periodsBetween(unit: RepeatUnit, from: DayKey, day: DayKey) {
  if (unit === 'day') return differenceInCalendarDays(parseDay(day), parseDay(from));
  if (unit === 'week') return weekIndex(day) - weekIndex(from);
  return monthIndex(day) - monthIndex(from);
}

/** La période qui contient `day` fait-elle partie du rythme ? */
export function isActiveOn(unit: RepeatUnit, r: GoalRepeat, day: DayKey) {
  if (unit === 'day' && !alarmOnDay(r.days, day)) return false;
  if (r.every <= 1) return true;
  const n = periodsBetween(unit, r.from, day);
  return ((n % r.every) + r.every) % r.every === 0;
}

/** Début des `count` prochaines périodes actives, à partir de celle qui contient `day` (incluse si active). */
export function nextActive(unit: RepeatUnit, r: GoalRepeat, day: DayKey, count = 1): DayKey[] {
  const out: DayKey[] = [];
  for (let k = 0; k < 400 && out.length < count; k++) {
    const p = shiftPeriod(unit, day, k);
    if (isActiveOn(unit, r, p)) out.push(p);
  }
  return out;
}

const UNIT_LABEL: Record<RepeatUnit, [string, string]> = {
  day: ['Chaque jour', 'jours'],
  week: ['Chaque semaine', 'semaines'],
  month: ['Chaque mois', 'mois'],
};

/** « Chaque jour », « Lun., mer., ven. », « En semaine », « Tous les 2 jours », « 1 semaine sur 2 », « 1 mois sur 3 ». */
export function repeatLabel(unit: RepeatUnit, r: GoalRepeat) {
  if (unit === 'day' && r.days !== ALL_DAYS) {
    const s = alarmDaysLabel(r.days);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (r.every <= 1) return UNIT_LABEL[unit][0];
  if (unit === 'day') return `Tous les ${r.every} jours`;
  return `1 ${unit === 'week' ? 'semaine' : 'mois'} sur ${r.every}`;
}
