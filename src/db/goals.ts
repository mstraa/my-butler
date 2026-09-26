import { endOfMonth } from 'date-fns';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/icon';
import { GOAL_COLORS } from '@/db/agenda';
import { type DayKey, dayKey, parseDay, shiftDay, shiftMonth, todayKey, weekDays } from '@/lib/dates';

export type GoalPeriod = 'day' | 'week' | 'month';
export type GoalKind = 'counter' | 'value' | 'duration' | 'bool';

/** Ce que le formulaire lit et écrit. */
export type GoalDraft = {
  title: string;
  period: GoalPeriod;
  kind: GoalKind;
  target: number;
  unit: string;
  color: string | null;
  icon: IconName;
};

export type GoalProgress = GoalDraft & {
  id: number;
  key: string | null;
  color: string;
  /** Total de la période en cours (somme des saisies). */
  value: number;
  /** Saisie du jour (pour les objectifs du jour, c'est aussi `value`). */
  today: number;
  /** Une saisie existe pour aujourd'hui (distingue « Non » de « pas encore répondu »). */
  answered: boolean;
  done: boolean;
  /** Périodes d'affilée atteintes (jours, semaines ou mois) : la période en cours compte si elle est atteinte. */
  streak: number;
  /** Les 7 dernières périodes, de la plus ancienne à la période en cours. */
  history: ('met' | 'miss' | 'now')[];
  /** Chrono lancé (objectif « durée ») : instant de départ en ms, sinon null. */
  chronoSince: number | null;
};

/** Premier et dernier jour de la période qui contient `day`. */
export function periodRange(period: GoalPeriod, day: DayKey): [DayKey, DayKey] {
  if (period === 'day') return [day, day];
  if (period === 'week') {
    const w = weekDays(day);
    return [w[0], w[6]];
  }
  return [`${day.slice(0, 8)}01`, dayKey(endOfMonth(parseDay(day)))];
}

/** Premier jour de la k-ième période en arrière (0 = en cours). */
function periodStartBack(period: GoalPeriod, day: DayKey, k: number): DayKey {
  if (period === 'day') return shiftDay(day, -k);
  if (period === 'week') return shiftDay(weekDays(day)[0], -7 * k);
  return shiftMonth(`${day.slice(0, 8)}01`, -k);
}

export const isDone = (kind: GoalKind, target: number, value: number) => value >= (kind === 'bool' ? 1 : target);

type GoalRow = {
  id: number; key: string | null; title: string; period: GoalPeriod; kind: GoalKind; target: number | null;
  unit: string | null; color: string | null; icon: string | null; sort: number;
};

const DEFAULT_ICON: Record<GoalKind, IconName> = { counter: 'target', value: 'target', duration: 'clock', bool: 'check' };

/** Objectifs actifs avec leur avancement dans la période en cours. */
export async function listGoals(db: SQLiteDatabase, today: DayKey = todayKey()): Promise<GoalProgress[]> {
  const [goals, chronos] = await Promise.all([
    db.getAllAsync<GoalRow>('SELECT * FROM goals WHERE active = 1 ORDER BY sort, id'),
    db.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'chrono:%'"),
  ]);
  // Assez d'historique pour les séries : un an de jours, un an de semaines, deux ans de mois.
  const from = shiftMonth(periodRange('month', today)[0], -24);
  const entries = await db.getAllAsync<{ goal_id: number; day: DayKey; value: number }>(
    'SELECT goal_id, day, value FROM goal_entries WHERE day BETWEEN ? AND ?', from, today,
  );
  return goals.map((g, i) => {
    const target = g.kind === 'bool' ? 1 : (g.target ?? 1);
    const mine = entries.filter((e) => e.goal_id === g.id);
    const [a, b] = periodRange(g.period, today);
    const value = mine.filter((e) => e.day >= a && e.day <= b).reduce((s, e) => s + e.value, 0);
    const byDay = new Map(mine.map((e) => [e.day, e.value]));
    // Total de la k-ième période en arrière (0 = en cours).
    const sumBack = (k: number) => {
      const [p0, p1] = periodRange(g.period, periodStartBack(g.period, today, k));
      let sum = 0;
      for (const e of mine) if (e.day >= p0 && e.day <= p1) sum += e.value;
      return sum;
    };
    const met = (k: number) => isDone(g.kind, target, k === 0 ? value : sumBack(k));
    // La période en cours compte si elle est atteinte ; sinon la série part de la précédente.
    let streak = 0;
    const max = g.period === 'day' ? 400 : g.period === 'week' ? 60 : 24;
    for (let k = met(0) ? 0 : 1; k <= max && met(k); k++) streak += 1;
    const history = Array.from({ length: 7 }, (_, j) => {
      const k = 6 - j;
      if (k === 0) return value && isDone(g.kind, target, value) ? 'met' : 'now';
      return met(k) ? 'met' : 'miss';
    }) as GoalProgress['history'];
    const chrono = chronos.find((c) => c.key === `chrono:${g.id}`);
    return {
      id: g.id,
      key: g.key,
      title: g.title,
      period: g.period,
      kind: g.kind,
      target,
      unit: g.unit ?? '',
      color: g.color ?? GOAL_COLORS[i % GOAL_COLORS.length],
      icon: (g.icon as IconName) || DEFAULT_ICON[g.kind],
      value,
      today: byDay.get(today) ?? 0,
      answered: byDay.has(today),
      done: isDone(g.kind, target, value),
      streak,
      history,
      chronoSince: chrono ? Number(chrono.value) : null,
    };
  });
}

/** Ajoute (ou retire) à la saisie du jour ; jamais en dessous de 0 sur la période. */
export async function addToGoalEntry(db: SQLiteDatabase, goalId: number, day: DayKey, delta: number, period: GoalPeriod) {
  if (delta >= 0) {
    await db.runAsync(
      `INSERT INTO goal_entries (goal_id, day, value) VALUES (?, ?, ?)
       ON CONFLICT(goal_id, day) DO UPDATE SET value = value + excluded.value`,
      goalId, day, delta,
    );
    return;
  }
  // Retirer : d'abord sur la saisie du jour, puis sur les jours précédents de la période.
  const [a] = periodRange(period, day);
  const rows = await db.getAllAsync<{ day: DayKey; value: number }>(
    'SELECT day, value FROM goal_entries WHERE goal_id = ? AND day BETWEEN ? AND ? AND value > 0 ORDER BY day DESC',
    goalId, a, day,
  );
  let left = -delta;
  for (const r of rows) {
    if (left <= 0) break;
    const take = Math.min(left, r.value);
    await db.runAsync('UPDATE goal_entries SET value = value - ? WHERE goal_id = ? AND day = ?', take, goalId, r.day);
    left -= take;
  }
}

/** Remplace la saisie du jour (valeur, durée, oui/non). */
export async function setGoalEntry(db: SQLiteDatabase, goalId: number, day: DayKey, value: number) {
  await db.runAsync(
    `INSERT INTO goal_entries (goal_id, day, value) VALUES (?, ?, ?)
     ON CONFLICT(goal_id, day) DO UPDATE SET value = excluded.value`,
    goalId, day, Math.max(0, value),
  );
}

/* ——— Chrono (objectifs « durée ») : l'instant de départ est gardé dans settings ——— */

export async function startChrono(db: SQLiteDatabase, goalId: number) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    `chrono:${goalId}`, String(Date.now()),
  );
}

/** Arrête le chrono et ajoute les minutes écoulées (arrondies, au moins 1) au jour. */
export async function stopChrono(db: SQLiteDatabase, goalId: number, day: DayKey) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', `chrono:${goalId}`);
  await db.runAsync('DELETE FROM settings WHERE key = ?', `chrono:${goalId}`);
  if (!row) return 0;
  const minutes = Math.max(1, Math.round((Date.now() - Number(row.value)) / 60000));
  await addToGoalEntry(db, goalId, day, minutes, 'day');
  return minutes;
}

/* ——— Création, modification ——— */

export async function getGoal(db: SQLiteDatabase, id: number): Promise<(GoalDraft & { id: number }) | null> {
  const g = await db.getFirstAsync<GoalRow>('SELECT * FROM goals WHERE id = ?', id);
  if (!g) return null;
  return {
    id: g.id, title: g.title, period: g.period, kind: g.kind, target: g.target ?? 1, unit: g.unit ?? '',
    color: g.color, icon: (g.icon as IconName) || DEFAULT_ICON[g.kind],
  };
}

const cols = (d: GoalDraft) => [
  d.title.trim(), d.period, d.kind, d.kind === 'bool' ? 1 : d.target, d.unit.trim() || null, d.color, d.icon,
];

export async function createGoal(db: SQLiteDatabase, d: GoalDraft) {
  const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort) AS m FROM goals');
  await db.runAsync(
    'INSERT INTO goals (title, period, kind, target, unit, color, icon, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ...cols(d), (max?.m ?? 0) + 1, todayKey(),
  );
}

export async function updateGoal(db: SQLiteDatabase, id: number, d: GoalDraft) {
  await db.runAsync(
    'UPDATE goals SET title = ?, period = ?, kind = ?, target = ?, unit = ?, color = ?, icon = ? WHERE id = ?',
    ...cols(d), id,
  );
}

/** Mettre en pause : l'objectif disparaît des écrans, son historique reste. */
export async function archiveGoal(db: SQLiteDatabase, id: number) {
  await db.runAsync('UPDATE goals SET active = 0 WHERE id = ?', id);
}

export async function deleteGoal(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM goal_entries WHERE goal_id = ?', id);
    await db.runAsync("DELETE FROM settings WHERE key = 'chrono:' || ?", id);
    await db.runAsync('DELETE FROM goals WHERE id = ?', id);
  });
}

/** 8000 → « 8 000 », 2.5 → « 2,5 ». */
export function fmtGoal(n: number) {
  const r = Math.round(n * 10) / 10;
  const [i, d] = String(r).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${d ? `,${d}` : ''}`;
}

/* ——— Historique (feuille ouverte depuis la vue Liste) ——— */

export type HistoryPeriod = {
  /** Premier jour de la période. */
  start: DayKey;
  /** Dernier jour (pour un objectif du jour : le même). */
  end: DayKey;
  value: number;
  met: boolean;
  /** Période en cours (pas encore finie). */
  current: boolean;
};

export type GoalHistory = GoalProgress & {
  /** Début de l'historique : création de l'objectif (ou première saisie). */
  since: DayKey;
  /** Périodes depuis `since`, de la plus récente à la plus ancienne. */
  periods: HistoryPeriod[];
  best: number;
};

export async function getGoalHistory(db: SQLiteDatabase, id: number, today: DayKey = todayKey()): Promise<GoalHistory | null> {
  const [all, row] = await Promise.all([
    listGoals(db, today),
    db.getFirstAsync<{ created_at: string | null; first: string | null }>(
      'SELECT g.created_at, (SELECT MIN(day) FROM goal_entries WHERE goal_id = g.id) AS first FROM goals g WHERE g.id = ?',
      id,
    ),
  ]);
  const g = all.find((x) => x.id === id);
  if (!g || !row) return null;
  // Depuis la création, ou la première saisie si elle est plus ancienne (objectifs d'avant la v7).
  const since = [row.created_at ?? today, row.first ?? today, today].sort()[0];
  const entries = await db.getAllAsync<{ day: DayKey; value: number }>(
    'SELECT day, value FROM goal_entries WHERE goal_id = ? AND day BETWEEN ? AND ?', id, periodRange(g.period, since)[0], today,
  );
  const periods: HistoryPeriod[] = [];
  for (let k = 0; ; k++) {
    const [start, end] = periodRange(g.period, periodStartBack(g.period, today, k));
    if (end < since) break;
    const value = entries.filter((e) => e.day >= start && e.day <= end).reduce((sum, e) => sum + e.value, 0);
    periods.push({ start, end, value, met: isDone(g.kind, g.target, value), current: k === 0 });
  }
  let best = 0;
  let run = 0;
  for (const p of [...periods].reverse()) {
    run = p.met ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { ...g, since, periods, best };
}

/**
 * Coche ou décoche une période dans l'historique.
 * Cocher : complète jusqu'à la cible (sur le dernier jour déjà passé de la période).
 * Décocher : efface les saisies de la période.
 */
export async function setPeriodDone(
  db: SQLiteDatabase, g: Pick<GoalProgress, 'id' | 'kind' | 'target'>, p: Pick<HistoryPeriod, 'start' | 'end' | 'value'>, done: boolean,
  today: DayKey = todayKey(),
) {
  if (!done) {
    await db.runAsync('DELETE FROM goal_entries WHERE goal_id = ? AND day BETWEEN ? AND ?', g.id, p.start, p.end);
    return;
  }
  const target = g.kind === 'bool' ? 1 : g.target;
  const missing = target - p.value;
  if (missing <= 0) return;
  const day = p.end < today ? p.end : today;
  await addToGoalEntry(db, g.id, day, missing, 'day');
}

/**
 * Fixe le total d'une période (éditeur de la feuille d'historique).
 * Objectif du jour : la saisie du jour. Semaine / mois : les saisies de la période sont remplacées
 * par une seule, sur le dernier jour déjà passé de la période.
 */
export async function setPeriodValue(
  db: SQLiteDatabase, goalId: number, p: Pick<HistoryPeriod, 'start' | 'end'>, value: number, today: DayKey = todayKey(),
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM goal_entries WHERE goal_id = ? AND day BETWEEN ? AND ?', goalId, p.start, p.end);
    if (value > 0) {
      const day = p.end < today ? p.end : today;
      await db.runAsync('INSERT INTO goal_entries (goal_id, day, value) VALUES (?, ?, ?)', goalId, day, value);
    }
  });
}

