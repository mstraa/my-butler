import { addDays, addMonths, addYears, differenceInCalendarDays } from 'date-fns';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/icon';
import { deleteTask } from '@/db/tasks';
import { dayKey, dayOf, type DayKey, nowStamp, parseDay, shiftDay, type Stamp, timeOf } from '@/lib/dates';
import { categoryColors, colors } from '@/theme/tokens';

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type AgendaItem = {
  key: string;
  kind: 'event' | 'task' | 'birthday';
  id: number;
  title: string;
  /** '09:30', '≤19:00' ou '' */
  time: string;
  /** Début réel (rdv) ou échéance (tâche) ; null pour un anniversaire. */
  start: Stamp | null;
  end: Stamp | null;
  allDay: boolean;
  color: string;
  icon: IconName;
  cancelled: boolean;
  done: boolean;
  location?: string | null;
  /** Tâche : le montant réel est demandé quand on la coche. */
  tracksExpense?: boolean;
};

export type AgendaDay = {
  day: DayKey;
  items: AgendaItem[];
};

type EventRow = {
  id: number;
  title: string;
  starts_at: Stamp;
  ends_at: Stamp | null;
  all_day: number;
  icon: string | null;
  location: string | null;
  cancelled_at: string | null;
  recurrence: Recurrence;
  color: string | null;
  cat_icon: string | null;
};
type TaskRow = {
  id: number;
  title: string;
  day: DayKey;
  due_at: Stamp | null;
  state: string;
  tracks_expense: number;
  color: string | null;
  cat_icon: string | null;
};
type BirthdayRow = { id: number; name: string; month: number; day: number; year: number | null };

const asIcon = (v: string | null | undefined, fallback: IconName): IconName => (v as IconName) || fallback;

/**
 * Dates de début des occurrences d'un rdv répété qui tombent dans [from, to].
 * Une répétition « tous les mois » un 31 se cale sur le dernier jour des mois courts.
 */
export function occurrencesInRange(startDay: DayKey, rule: Recurrence, from: DayKey, to: DayKey): DayKey[] {
  if (rule === 'none') return startDay >= from && startDay <= to ? [startDay] : [];
  const start = parseDay(startDay);
  const out: DayKey[] = [];
  if (rule === 'daily' || rule === 'weekly') {
    const step = rule === 'daily' ? 1 : 7;
    const gap = differenceInCalendarDays(parseDay(from), start);
    let i = Math.max(0, Math.ceil(gap / step));
    for (let d = dayKey(addDays(start, i * step)); d <= to; i++, d = dayKey(addDays(start, i * step))) out.push(d);
    return out;
  }
  const add = rule === 'monthly' ? addMonths : addYears;
  for (let i = 0; i < 2000; i++) {
    const d = dayKey(add(start, i));
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Tous les éléments des jours [from, to] (bornes incluses), groupés par jour. */
export async function getAgendaDays(db: SQLiteDatabase, from: DayKey, to: DayKey): Promise<AgendaDay[]> {
  const [events, tasks, birthdays] = await Promise.all([
    db.getAllAsync<EventRow>(
      `SELECT e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.icon, e.location, e.cancelled_at, e.recurrence,
              c.color, c.icon AS cat_icon
         FROM events e LEFT JOIN categories c ON c.id = e.category_id
        WHERE (e.cancelled_at IS NULL OR e.cancel_mode = 'keep')
          AND ((e.recurrence = 'none' AND e.starts_at >= ? AND e.starts_at < ?)
            OR (e.recurrence != 'none' AND e.starts_at < ?))
        ORDER BY e.starts_at`,
      from, shiftDay(to, 1), shiftDay(to, 1),
    ),
    db.getAllAsync<TaskRow>(
      `SELECT t.id, t.title, t.day, t.due_at, t.state, t.tracks_expense, c.color, c.icon AS cat_icon
         FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.day BETWEEN ? AND ? AND t.state != 'abandoned'`,
      from, to,
    ),
    db.getAllAsync<BirthdayRow>('SELECT id, name, month, day, year FROM birthdays'),
  ]);

  const days: AgendaDay[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) days.push({ day: d, items: [] });
  const byDay = new Map(days.map((x) => [x.day, x]));

  for (const d of days) {
    const m = Number(d.day.slice(5, 7));
    const dd = Number(d.day.slice(8, 10));
    for (const b of birthdays) {
      if (b.month !== m || b.day !== dd) continue;
      const age = b.year ? Number(d.day.slice(0, 4)) - b.year : null;
      d.items.push({
        key: `b${b.id}`, kind: 'birthday', id: b.id,
        title: age ? `Anniv. ${b.name} · ${age} ans` : `Anniv. ${b.name}`,
        time: '', start: null, end: null, allDay: true,
        color: categoryColors.birthday, icon: 'cake', cancelled: false, done: false,
      });
    }
  }

  const timed: { sort: string; day: DayKey; item: AgendaItem }[] = [];
  for (const e of events) {
    const startDay = dayOf(e.starts_at);
    const startTime = timeOf(e.starts_at);
    // Durée en jours entre début et fin, pour recaler la fin de chaque occurrence.
    const spanDays = e.ends_at ? differenceInCalendarDays(parseDay(dayOf(e.ends_at)), parseDay(startDay)) : 0;
    for (const occ of occurrencesInRange(startDay, e.recurrence, from, to)) {
      const start = `${occ}T${startTime}`;
      const end = e.ends_at ? `${shiftDay(occ, spanDays)}T${timeOf(e.ends_at)}` : null;
      timed.push({
        sort: e.all_day ? '00:00' : startTime,
        day: occ,
        item: {
          key: `e${e.id}-${occ}`, kind: 'event', id: e.id, title: e.title,
          time: e.all_day ? '' : startTime, start, end, allDay: !!e.all_day,
          color: e.color ?? colors.textTertiary,
          icon: asIcon(e.icon ?? e.cat_icon, 'calendar'),
          cancelled: !!e.cancelled_at, done: false, location: e.location,
        },
      });
    }
  }
  for (const t of tasks) {
    const sameDayDue = t.due_at && dayOf(t.due_at) === t.day;
    timed.push({
      sort: sameDayDue ? timeOf(t.due_at) : '99:99',
      day: t.day,
      item: {
        key: `t${t.id}`, kind: 'task', id: t.id, title: t.title,
        time: sameDayDue ? `≤${timeOf(t.due_at)}` : '',
        start: t.due_at, end: null, allDay: !sameDayDue,
        color: t.color ?? colors.textTertiary,
        icon: asIcon(t.cat_icon, 'task'),
        cancelled: false, done: t.state === 'done', tracksExpense: !!t.tracks_expense,
      },
    });
  }
  timed.sort((a, b) => a.sort.localeCompare(b.sort));
  for (const x of timed) byDay.get(x.day)?.items.push(x.item);

  return days;
}

export type LateItem = {
  type: 'task' | 'event';
  id: number;
  title: string;
  due: Stamp;
  /** Pour un rendez-vous : sa date, ex. « rdv sam. 3/10 ». */
  eventAt: Stamp | null;
  color: string;
  icon: IconName;
  category: string | null;
  /** Tâche avec dépense suivie : son estimation. */
  estimateCents: number | null;
};

export async function getLateItems(db: SQLiteDatabase, now: Stamp = nowStamp()): Promise<LateItem[]> {
  const rows = await db.getAllAsync<{
    type: 'task' | 'event'; id: number; title: string; due: Stamp; event_at: Stamp | null;
    color: string | null; icon: string | null; category: string | null; estimate_cents: number | null;
  }>(
    `SELECT 'task' AS type, t.id, t.title, t.due_at AS due, NULL AS event_at, c.color, c.icon, c.name AS category,
            CASE WHEN t.tracks_expense = 1 THEN t.estimate_cents END AS estimate_cents
       FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.state = 'open' AND t.show_late = 1 AND t.due_at IS NOT NULL AND t.due_at < ?
     UNION ALL
     SELECT 'event', e.id,
            COALESCE(e.deadline_label || ' · ', '') || e.title, e.deadline_at, e.starts_at,
            c.color, COALESCE(e.icon, c.icon), c.name, NULL
       FROM events e LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.deadline_state = 'open' AND e.deadline_at < ? AND e.cancelled_at IS NULL
     ORDER BY due`,
    now, now,
  );
  return rows.map((r) => ({
    type: r.type, id: r.id, title: r.title, due: r.due, eventAt: r.event_at,
    color: r.color ?? colors.textTertiary,
    icon: asIcon(r.icon, r.type === 'task' ? 'task' : 'calendar'),
    category: r.category,
    estimateCents: r.estimate_cents,
  }));
}

/** État d'un élément en retard avant une action, pour pouvoir l'annuler. */
export type LateUndo = {
  item: LateItem;
  logId: number;
  task?: { state: string; state_at: string | null; abandon_reason: string | null; due_at: Stamp; day: DayKey | null };
  event?: { deadline_state: string | null; deadline_at: Stamp | null };
};

async function snapshot(db: SQLiteDatabase, item: LateItem): Promise<Omit<LateUndo, 'logId'>> {
  if (item.type === 'task') {
    const task = await db.getFirstAsync<NonNullable<LateUndo['task']>>(
      'SELECT state, state_at, abandon_reason, due_at, day FROM tasks WHERE id = ?', item.id,
    );
    return { item, task: task ?? undefined };
  }
  const event = await db.getFirstAsync<NonNullable<LateUndo['event']>>(
    'SELECT deadline_state, deadline_at FROM events WHERE id = ?', item.id,
  );
  return { item, event: event ?? undefined };
}

async function logDeadline(
  db: SQLiteDatabase, item: Pick<LateItem, 'type' | 'id' | 'due'>,
  action: 'done' | 'postponed' | 'abandoned', toDue: Stamp | null = null, note: string | null = null,
) {
  const res = await db.runAsync(
    'INSERT INTO deadline_log (item_type, item_id, action, at, from_due, to_due, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    item.type, item.id, action, nowStamp(), item.due, toDue, note,
  );
  return res.lastInsertRowId;
}

/**
 * Fait ou abandonné. `onTime` : fait avant l'échéance mais coché après coup —
 * la tâche est datée de son échéance, et l'historique le note.
 */
export async function resolveLate(
  db: SQLiteDatabase, item: LateItem, action: 'done' | 'abandoned',
  { note, onTime }: { note?: string; onTime?: boolean } = {},
): Promise<LateUndo> {
  const before = await snapshot(db, item);
  const reason = note?.trim() || null;
  let logId = 0;
  await db.withTransactionAsync(async () => {
    if (item.type === 'task') {
      await db.runAsync(
        'UPDATE tasks SET state = ?, state_at = ?, abandon_reason = ? WHERE id = ?',
        action, onTime ? item.due : nowStamp(), action === 'abandoned' ? reason : null, item.id,
      );
    } else {
      // Abandonner l'échéance d'un rendez-vous n'annule pas le rendez-vous.
      await db.runAsync('UPDATE events SET deadline_state = ? WHERE id = ?', action, item.id);
    }
    logId = await logDeadline(db, item, action, null, onTime ? 'fait à temps, coché après coup' : reason);
  });
  return { ...before, logId };
}

export async function postponeLate(db: SQLiteDatabase, item: LateItem, to: Stamp): Promise<LateUndo> {
  const before = await snapshot(db, item);
  let logId = 0;
  await db.withTransactionAsync(async () => {
    if (item.type === 'task') {
      await db.runAsync('UPDATE tasks SET due_at = ?, day = ? WHERE id = ?', to, dayOf(to), item.id);
    } else {
      await db.runAsync('UPDATE events SET deadline_at = ? WHERE id = ?', to, item.id);
    }
    logId = await logDeadline(db, item, 'postponed', to);
  });
  return { ...before, logId };
}

/** Remet l'élément comme avant l'action et retire sa ligne d'historique. */
export async function undoLate(db: SQLiteDatabase, u: LateUndo) {
  await db.withTransactionAsync(async () => {
    if (u.task) {
      await db.runAsync(
        'UPDATE tasks SET state = ?, state_at = ?, abandon_reason = ?, due_at = ?, day = ? WHERE id = ?',
        u.task.state, u.task.state_at, u.task.abandon_reason, u.task.due_at, u.task.day, u.item.id,
      );
    } else if (u.event) {
      await db.runAsync(
        'UPDATE events SET deadline_state = ?, deadline_at = ? WHERE id = ?',
        u.event.deadline_state, u.event.deadline_at, u.item.id,
      );
    }
    await db.runAsync('DELETE FROM deadline_log WHERE id = ?', u.logId);
  });
}

/** Supprime sans historique : la tâche entière, ou seulement l'échéance d'un rendez-vous. */
export async function deleteLate(db: SQLiteDatabase, item: LateItem) {
  if (item.type === 'task') return deleteTask(db, item.id);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE events SET deadline_at = NULL, deadline_label = NULL, deadline_state = NULL WHERE id = ?', item.id,
    );
    await db.runAsync("DELETE FROM deadline_log WHERE item_type = 'event' AND item_id = ?", item.id);
  });
}

export type DayStats = {
  wokeAt: string | null;
  goalsMet: number;
  goalsTotal: number;
  eliquidMl: number | null;
  fruits: { value: number; target: number } | null;
};

export async function getDayStats(db: SQLiteDatabase, day: DayKey): Promise<DayStats> {
  const [sleep, liquid, goals] = await Promise.all([
    db.getFirstAsync<{ woke_at: string | null }>('SELECT woke_at FROM sleep_log WHERE day = ?', day),
    db.getFirstAsync<{ ml: number }>('SELECT ml FROM eliquid_log WHERE day = ?', day),
    db.getAllAsync<{ key: string | null; kind: string; target: number | null; value: number | null }>(
      `SELECT g.key, g.kind, g.target, ge.value
         FROM goals g LEFT JOIN goal_entries ge ON ge.goal_id = g.id AND ge.day = ?
        WHERE g.active = 1 AND g.period = 'day'`,
      day,
    ),
  ]);
  const met = goals.filter((g) => isMet(g.kind, g.target, g.value)).length;
  const fruits = goals.find((g) => g.key === 'fruits');
  return {
    wokeAt: sleep?.woke_at ?? null,
    goalsMet: met,
    goalsTotal: goals.length,
    eliquidMl: liquid?.ml ?? null,
    fruits: fruits ? { value: fruits.value ?? 0, target: fruits.target ?? 0 } : null,
  };
}

const isMet = (kind: string, target: number | null, value: number | null) =>
  (value ?? 0) >= (kind === 'bool' ? 1 : target ?? 1);

/** Part des objectifs quotidiens atteints, par jour (0 à 1). Les jours sans objectif valent 0. */
export async function getGoalRatios(db: SQLiteDatabase, from: DayKey, to: DayKey): Promise<Map<DayKey, number>> {
  const [goals, entries] = await Promise.all([
    db.getAllAsync<{ id: number; kind: string; target: number | null }>(
      "SELECT id, kind, target FROM goals WHERE active = 1 AND period = 'day'",
    ),
    db.getAllAsync<{ goal_id: number; day: DayKey; value: number }>(
      'SELECT goal_id, day, value FROM goal_entries WHERE day BETWEEN ? AND ?', from, to,
    ),
  ]);
  const out = new Map<DayKey, number>();
  if (goals.length === 0) return out;
  const byId = new Map(goals.map((g) => [g.id, g]));
  const met = new Map<DayKey, number>();
  for (const e of entries) {
    const g = byId.get(e.goal_id);
    if (g && isMet(g.kind, g.target, e.value)) met.set(e.day, (met.get(e.day) ?? 0) + 1);
  }
  for (const [d, n] of met) out.set(d, n / goals.length);
  return out;
}

export type WeekGoal = {
  id: number;
  title: string;
  color: string;
  /** Avancement affiché, ex. '1 / 3' ou '4 / 7 j'. */
  valueText: string;
  targetText: string;
  ratio: number;
};

export const GOAL_COLORS = [
  categoryColors.health, categoryColors.sport, categoryColors.work,
  categoryColors.groceries, categoryColors.family, categoryColors.friends,
];

/**
 * Objectifs de la semaine [from, to] :
 * - objectifs hebdomadaires : somme des saisies de la semaine face à la cible ;
 * - objectifs quotidiens : nombre de jours atteints (jusqu'à aujourd'hui) sur 7.
 */
export async function getWeekGoals(db: SQLiteDatabase, from: DayKey, to: DayKey, today: DayKey): Promise<WeekGoal[]> {
  const [goals, entries] = await Promise.all([
    db.getAllAsync<{ id: number; title: string; period: string; kind: string; target: number | null; unit: string | null; color: string | null }>(
      "SELECT id, title, period, kind, target, unit, color FROM goals WHERE active = 1 AND period IN ('day', 'week') ORDER BY sort, id",
    ),
    db.getAllAsync<{ goal_id: number; day: DayKey; value: number }>(
      'SELECT goal_id, day, value FROM goal_entries WHERE day BETWEEN ? AND ?', from, to,
    ),
  ]);
  return goals.map((g, i) => {
    const mine = entries.filter((e) => e.goal_id === g.id);
    const color = g.color ?? GOAL_COLORS[i % GOAL_COLORS.length];
    if (g.period === 'week') {
      const value = mine.reduce((s, e) => s + e.value, 0);
      const target = g.kind === 'bool' ? 1 : g.target ?? 1;
      const unit = g.unit ? ` ${g.unit}` : '';
      return {
        id: g.id, title: g.title, color,
        valueText: fmtNum(value), targetText: `${fmtNum(target)}${unit}`,
        ratio: Math.min(1, value / target),
      };
    }
    const met = mine.filter((e) => e.day <= today && isMet(g.kind, g.target, e.value)).length;
    return {
      id: g.id, title: `${g.title} · chaque jour`, color,
      valueText: String(met), targetText: '7 j', ratio: met / 7,
    };
  });
}

const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/* ——— Saisie rapide (feuille « Ajouter ») ——— */

export async function addToGoal(db: SQLiteDatabase, key: string, day: DayKey, delta: number) {
  const goal = await db.getFirstAsync<{ id: number }>('SELECT id FROM goals WHERE key = ?', key);
  if (!goal) return null;
  await db.runAsync(
    `INSERT INTO goal_entries (goal_id, day, value) VALUES (?, ?, ?)
     ON CONFLICT(goal_id, day) DO UPDATE SET value = value + excluded.value`,
    goal.id, day, delta,
  );
  const row = await db.getFirstAsync<{ value: number }>(
    'SELECT value FROM goal_entries WHERE goal_id = ? AND day = ?', goal.id, day,
  );
  return row?.value ?? null;
}

export async function addEliquid(db: SQLiteDatabase, day: DayKey, ml: number) {
  await db.runAsync(
    `INSERT INTO eliquid_log (day, ml) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET ml = MAX(0, ml + excluded.ml)`,
    day, ml,
  );
  const row = await db.getFirstAsync<{ ml: number }>('SELECT ml FROM eliquid_log WHERE day = ?', day);
  return row?.ml ?? 0;
}

export async function setWokeAt(db: SQLiteDatabase, day: DayKey, hhmm: string) {
  await db.runAsync(
    `INSERT INTO sleep_log (day, woke_at) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET woke_at = excluded.woke_at`,
    day, hhmm,
  );
}

