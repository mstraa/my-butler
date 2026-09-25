import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/icon';
import { dayOf, type DayKey, nowStamp, shiftDay, type Stamp, timeOf } from '@/lib/dates';
import { categoryColors, colors } from '@/theme/tokens';

export type AgendaItem = {
  key: string;
  kind: 'event' | 'task' | 'birthday';
  id: number;
  title: string;
  /** '09:30', '≤19:00' ou '' */
  time: string;
  color: string;
  icon: IconName;
  cancelled: boolean;
  done: boolean;
};

export type AgendaDay = {
  day: DayKey;
  items: AgendaItem[];
};

type EventRow = {
  id: number;
  title: string;
  starts_at: Stamp;
  all_day: number;
  icon: string | null;
  cancelled_at: string | null;
  color: string | null;
  cat_icon: string | null;
};
type TaskRow = {
  id: number;
  title: string;
  day: DayKey;
  due_at: Stamp | null;
  state: string;
  color: string | null;
  cat_icon: string | null;
};
type BirthdayRow = { id: number; name: string; month: number; day: number; year: number | null };

const asIcon = (v: string | null | undefined, fallback: IconName): IconName => (v as IconName) || fallback;

/** Tous les éléments des jours [from, to] (bornes incluses), groupés par jour. */
export async function getAgendaDays(db: SQLiteDatabase, from: DayKey, to: DayKey): Promise<AgendaDay[]> {
  const [events, tasks, birthdays] = await Promise.all([
    db.getAllAsync<EventRow>(
      `SELECT e.id, e.title, e.starts_at, e.all_day, e.icon, e.cancelled_at, c.color, c.icon AS cat_icon
         FROM events e LEFT JOIN categories c ON c.id = e.category_id
        WHERE e.starts_at >= ? AND e.starts_at < ?
          AND (e.cancelled_at IS NULL OR e.cancel_mode = 'keep')
        ORDER BY e.starts_at`,
      from, shiftDay(to, 1),
    ),
    db.getAllAsync<TaskRow>(
      `SELECT t.id, t.title, t.day, t.due_at, t.state, c.color, c.icon AS cat_icon
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
        time: '', color: categoryColors.birthday, icon: 'cake', cancelled: false, done: false,
      });
    }
  }

  const timed: { sort: string; day: DayKey; item: AgendaItem }[] = [];
  for (const e of events) {
    timed.push({
      sort: e.all_day ? '00:00' : timeOf(e.starts_at),
      day: dayOf(e.starts_at),
      item: {
        key: `e${e.id}`, kind: 'event', id: e.id, title: e.title,
        time: e.all_day ? '' : timeOf(e.starts_at),
        color: e.color ?? colors.textTertiary,
        icon: asIcon(e.icon ?? e.cat_icon, 'calendar'),
        cancelled: !!e.cancelled_at, done: false,
      },
    });
  }
  for (const t of tasks) {
    const sameDayDue = t.due_at && dayOf(t.due_at) === t.day;
    timed.push({
      sort: sameDayDue ? timeOf(t.due_at) : '99:99',
      day: t.day,
      item: {
        key: `t${t.id}`, kind: 'task', id: t.id, title: t.title,
        time: sameDayDue ? `≤${timeOf(t.due_at)}` : '',
        color: t.color ?? colors.textTertiary,
        icon: asIcon(t.cat_icon, 'task'),
        cancelled: false, done: t.state === 'done',
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
};

export async function getLateItems(db: SQLiteDatabase, now: Stamp = nowStamp()): Promise<LateItem[]> {
  const rows = await db.getAllAsync<{
    type: 'task' | 'event'; id: number; title: string; due: Stamp; event_at: Stamp | null; color: string | null;
  }>(
    `SELECT 'task' AS type, t.id, t.title, t.due_at AS due, NULL AS event_at, c.color
       FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.state = 'open' AND t.due_at IS NOT NULL AND t.due_at < ?
     UNION ALL
     SELECT 'event', e.id,
            COALESCE(e.deadline_label || ' · ', '') || e.title, e.deadline_at, e.starts_at, c.color
       FROM events e LEFT JOIN categories c ON c.id = e.category_id
      WHERE e.deadline_state = 'open' AND e.deadline_at < ? AND e.cancelled_at IS NULL
     ORDER BY due`,
    now, now,
  );
  return rows.map((r) => ({
    type: r.type, id: r.id, title: r.title, due: r.due, eventAt: r.event_at,
    color: r.color ?? colors.textTertiary,
  }));
}

async function logDeadline(
  db: SQLiteDatabase, item: Pick<LateItem, 'type' | 'id' | 'due'>,
  action: 'done' | 'postponed' | 'abandoned', toDue: Stamp | null = null, note: string | null = null,
) {
  await db.runAsync(
    'INSERT INTO deadline_log (item_type, item_id, action, at, from_due, to_due, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    item.type, item.id, action, nowStamp(), item.due, toDue, note,
  );
}

export async function resolveLate(db: SQLiteDatabase, item: LateItem, action: 'done' | 'abandoned', note?: string) {
  await db.withTransactionAsync(async () => {
    if (item.type === 'task') {
      await db.runAsync(
        'UPDATE tasks SET state = ?, state_at = ?, abandon_reason = ? WHERE id = ?',
        action, nowStamp(), action === 'abandoned' ? note ?? null : null, item.id,
      );
    } else {
      // Abandonner l'échéance d'un rendez-vous n'annule pas le rendez-vous.
      await db.runAsync('UPDATE events SET deadline_state = ? WHERE id = ?', action, item.id);
    }
    await logDeadline(db, item, action, null, note ?? null);
  });
}

export async function postponeLate(db: SQLiteDatabase, item: LateItem, to: Stamp) {
  await db.withTransactionAsync(async () => {
    if (item.type === 'task') {
      await db.runAsync('UPDATE tasks SET due_at = ?, day = ? WHERE id = ?', to, dayOf(to), item.id);
    } else {
      await db.runAsync('UPDATE events SET deadline_at = ? WHERE id = ?', to, item.id);
    }
    await logDeadline(db, item, 'postponed', to);
  });
}

export async function toggleTaskDone(db: SQLiteDatabase, id: number) {
  await db.runAsync(
    `UPDATE tasks SET state = CASE state WHEN 'done' THEN 'open' ELSE 'done' END,
                      state_at = ? WHERE id = ?`,
    nowStamp(), id,
  );
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
  const met = goals.filter((g) => (g.value ?? 0) >= (g.kind === 'bool' ? 1 : g.target ?? 1)).length;
  const fruits = goals.find((g) => g.key === 'fruits');
  return {
    wokeAt: sleep?.woke_at ?? null,
    goalsMet: met,
    goalsTotal: goals.length,
    eliquidMl: liquid?.ml ?? null,
    fruits: fruits ? { value: fruits.value ?? 0, target: fruits.target ?? 0 } : null,
  };
}

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
