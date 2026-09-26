import type { SQLiteDatabase } from 'expo-sqlite';

import { type DayKey, shiftDay, todayKey } from '@/lib/dates';
import { circularMean } from '@/lib/tracker-format';

/*
 * Suivis créés par l'utilisateur (onglet Suivi) : une valeur par jour.
 * Selon le type, `value` est :
 * - 'duration' : une durée en minutes (affichée en h ou en min selon l'unité) ;
 * - 'time'     : une heure de la journée, en minutes depuis minuit ;
 * - 'quantity' : un nombre (unité libre : cafés, verres…) ;
 * - 'volume'   : un volume dans l'unité choisie (ml, cl, L) ;
 * - 'sleep'    : la nuit qui finit le jour D — coucher de la veille au soir (slept_at) et lever
 *                de D (woke_at), en minutes depuis minuit ; `value` garde la durée (0 si incomplète).
 * `step` (même échelle que `value`) est le pas des boutons − / +.
 */

export type TrackerKind = 'duration' | 'time' | 'quantity' | 'volume' | 'sleep';

export type TrackerDraft = {
  name: string;
  kind: TrackerKind;
  unit: string;
  step: number;
  goal: number | null;
  icon: string;
  color: string | null;
};

export type Tracker = TrackerDraft & { id: number; createdAt: DayKey };

export type TrackerDay = {
  day: DayKey;
  value: number | null;
  /** Sommeil : coucher (veille au soir) et lever, en minutes depuis minuit. */
  slept?: number | null;
  woke?: number | null;
};

export type TrackerView = Tracker & {
  /** Les 7 jours qui finissent au jour choisi, du plus ancien au plus récent. */
  days: TrackerDay[];
  /** Moyenne par jour (durée, heure : jours saisis ; quantité, volume : jours depuis la création). */
  avg: number | null;
  /** Total des 7 jours (quantité, volume). */
  total: number;
  /** Moyenne des 7 jours d'avant (tendance), si des valeurs y ont été saisies. */
  prevAvg: number | null;
  /** Sommeil : heure de lever moyenne. */
  wokeAvg: number | null;
};

/** Durée d'une nuit : le coucher peut être la veille au soir ou après minuit. */
export const nightMinutes = (slept: number, woke: number) => (((woke - slept) % 1440) + 1440) % 1440;

type EntryRow = { value: number; slept_at: number | null; woke_at: number | null };

/** Valeur d'un jour : pour le sommeil, la durée seulement si coucher et lever sont notés. */
const entryValue = (kind: TrackerKind, e: EntryRow | undefined) => {
  if (!e) return null;
  if (kind !== 'sleep') return e.value;
  return e.slept_at !== null && e.woke_at !== null ? nightMinutes(e.slept_at, e.woke_at) : null;
};

type Row = {
  id: number; name: string; kind: TrackerKind; unit: string; step: number; goal: number | null;
  icon: string | null; color: string | null; created_at: DayKey;
};

const toTracker = (r: Row): Tracker => ({
  id: r.id, name: r.name, kind: r.kind, unit: r.unit, step: r.step, goal: r.goal,
  icon: r.icon ?? 'pulse', color: r.color, createdAt: r.created_at,
});

export async function listTrackers(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<Row>('SELECT * FROM trackers ORDER BY sort, id');
  return rows.map(toTracker);
}

export async function getTracker(db: SQLiteDatabase, id: number) {
  const row = await db.getFirstAsync<Row>('SELECT * FROM trackers WHERE id = ?', id);
  return row ? toTracker(row) : null;
}

/** Tous les suivis avec leurs 7 derniers jours (jusqu'à `day`) et les moyennes. */
export async function getTrackerViews(db: SQLiteDatabase, day: DayKey): Promise<TrackerView[]> {
  const from = shiftDay(day, -13);
  const [trackers, entries] = await Promise.all([
    listTrackers(db),
    db.getAllAsync<EntryRow & { tracker_id: number; day: DayKey }>(
      'SELECT tracker_id, day, value, slept_at, woke_at FROM tracker_entries WHERE day BETWEEN ? AND ?', from, day,
    ),
  ]);
  return trackers.map((t) => {
    const by = new Map(entries.filter((e) => e.tracker_id === t.id).map((e) => [e.day, e]));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = shiftDay(day, i - 6);
      const e = by.get(d);
      return { day: d, value: entryValue(t.kind, e), slept: e?.slept_at ?? null, woke: e?.woke_at ?? null };
    });
    const prev = Array.from({ length: 7 }, (_, i) => entryValue(t.kind, by.get(shiftDay(day, i - 13))));
    const wakes = days.map((d) => d.woke).filter((w): w is number => w !== null);
    return { ...t, days, ...stats(t, days, prev), wokeAvg: t.kind === 'sleep' && wakes.length ? circularMean(wakes) : null };
  });
}

function stats(t: Tracker, days: TrackerDay[], prev: (number | null)[]) {
  const known = days.map((d) => d.value).filter((v): v is number => v !== null);
  const prevKnown = prev.filter((v): v is number => v !== null);
  const total = known.reduce((a, b) => a + b, 0);
  if (t.kind === 'time') {
    return { avg: known.length ? circularMean(known) : null, total, prevAvg: null };
  }
  if (t.kind === 'duration' || t.kind === 'sleep') {
    return {
      avg: known.length ? total / known.length : null,
      total,
      prevAvg: prevKnown.length ? prevKnown.reduce((a, b) => a + b, 0) / prevKnown.length : null,
    };
  }
  // Quantité, volume : un jour sans saisie compte 0, mais seulement depuis la création du suivi.
  const counted = days.filter((d) => d.day >= t.createdAt || d.value !== null).length;
  return {
    avg: counted ? total / counted : null,
    total,
    prevAvg: prevKnown.length ? prevKnown.reduce((a, b) => a + b, 0) / 7 : null,
  };
}

export async function createTracker(db: SQLiteDatabase, d: TrackerDraft) {
  const last = await db.getFirstAsync<{ s: number | null }>('SELECT MAX(sort) AS s FROM trackers');
  const res = await db.runAsync(
    'INSERT INTO trackers (name, kind, unit, step, goal, icon, color, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    d.name.trim(), d.kind, d.unit, d.step, d.goal, d.icon, d.color, (last?.s ?? 0) + 1, todayKey(),
  );
  return res.lastInsertRowId;
}

export async function updateTracker(db: SQLiteDatabase, id: number, d: TrackerDraft) {
  const before = await getTracker(db, id);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE trackers SET name = ?, kind = ?, unit = ?, step = ?, goal = ?, icon = ?, color = ? WHERE id = ?',
      d.name.trim(), d.kind, d.unit, d.step, d.goal, d.icon, d.color, id,
    );
    // Changer de type rend les anciennes valeurs absurdes (des minutes lues comme des ml…) : on les efface.
    if (before && before.kind !== d.kind) {
      await db.runAsync('DELETE FROM tracker_entries WHERE tracker_id = ?', id);
    } else if (before && before.kind === 'volume' && before.unit !== d.unit) {
      // Volume : on convertit les valeurs dans la nouvelle unité.
      const k = ML[before.unit] / ML[d.unit];
      if (k && Number.isFinite(k)) await db.runAsync('UPDATE tracker_entries SET value = value * ? WHERE tracker_id = ?', k, id);
    }
  });
}

const ML: Record<string, number> = { ml: 1, cl: 10, L: 1000 };

export async function deleteTracker(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM tracker_entries WHERE tracker_id = ?', id);
    await db.runAsync('DELETE FROM trackers WHERE id = ?', id);
  });
}

/** Remplace la valeur d'un jour ; `null` l'efface. */
export async function setTrackerValue(db: SQLiteDatabase, id: number, day: DayKey, value: number | null) {
  if (value === null) {
    await db.runAsync('DELETE FROM tracker_entries WHERE tracker_id = ? AND day = ?', id, day);
    return;
  }
  await db.runAsync(
    'INSERT INTO tracker_entries (tracker_id, day, value) VALUES (?, ?, ?) ON CONFLICT(tracker_id, day) DO UPDATE SET value = excluded.value',
    id, day, value,
  );
}

/** Sommeil : note le coucher ou le lever d'une nuit (`null` l'efface) et recalcule sa durée. */
export async function setSleepTime(db: SQLiteDatabase, id: number, day: DayKey, field: 'slept' | 'woke', minutes: number | null) {
  const col = field === 'slept' ? 'slept_at' : 'woke_at';
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO tracker_entries (tracker_id, day, value, ${col}) VALUES (?, ?, 0, ?)
       ON CONFLICT(tracker_id, day) DO UPDATE SET ${col} = excluded.${col}`,
      id, day, minutes,
    );
    await db.runAsync(
      `UPDATE tracker_entries SET value = CASE WHEN slept_at IS NOT NULL AND woke_at IS NOT NULL
         THEN ((woke_at - slept_at) % 1440 + 1440) % 1440 ELSE 0 END
       WHERE tracker_id = ? AND day = ?`,
      id, day,
    );
    await db.runAsync('DELETE FROM tracker_entries WHERE tracker_id = ? AND day = ? AND slept_at IS NULL AND woke_at IS NULL', id, day);
  });
}

/** « Je me couche » maintenant : le soir, c'est la nuit qui finit demain ; après minuit, celle d'aujourd'hui. */
export function bedtimeTarget(now: Date, today: DayKey) {
  return now.getHours() >= 12 ? shiftDay(today, 1) : today;
}

/** Ajoute `delta` à la valeur du jour (jamais sous 0) et renvoie la nouvelle valeur. */
export async function addTrackerValue(db: SQLiteDatabase, id: number, day: DayKey, delta: number) {
  await db.runAsync(
    `INSERT INTO tracker_entries (tracker_id, day, value) VALUES (?, ?, MAX(0, ?))
     ON CONFLICT(tracker_id, day) DO UPDATE SET value = MAX(0, ROUND(value + ?, 3))`,
    id, day, delta, delta,
  );
  const row = await db.getFirstAsync<{ value: number }>(
    'SELECT value FROM tracker_entries WHERE tracker_id = ? AND day = ?', id, day,
  );
  return row?.value ?? 0;
}

/** Valeurs d'un jour, pour l'agenda et la saisie rapide (suivis dans l'ordre de l'onglet). */
export async function getDayTrackers(db: SQLiteDatabase, day: DayKey) {
  const rows = await db.getAllAsync<Row & { value: number | null; slept_at: number | null; woke_at: number | null }>(
    `SELECT t.*, e.value, e.slept_at, e.woke_at FROM trackers t
       LEFT JOIN tracker_entries e ON e.tracker_id = t.id AND e.day = ?
      ORDER BY t.sort, t.id`,
    day,
  );
  return rows.map((r) => ({
    ...toTracker(r),
    value: r.value === null ? null : entryValue(r.kind, { ...r, value: r.value }),
    slept: r.slept_at,
    woke: r.woke_at,
  }));
}
