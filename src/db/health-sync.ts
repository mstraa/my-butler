import type { SQLiteDatabase } from 'expo-sqlite';

import { type DayKey, dayKey } from '@/lib/dates';
import { grantedHealthMetrics, healthSupported, readDailySteps, readNights } from '@/lib/health';

import { healthMetricOf, listTrackers, nightMinutes } from './tracking';
import { invalidate } from './use-query';

/*
 * Remplit les suivis reliés à Health Connect (source = 'health') avec les N derniers jours :
 * pas du jour pour une quantité en « pas », nuit (coucher, lever) pour le sommeil.
 * Seuls les jours où Health Connect a des données sont écrits : une saisie à la main d'un jour
 * sans données est gardée, et remplacée dès que Health Connect en a.
 */

const DAYS = 14;

const clockOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

let running: Promise<boolean> | null = null;

/** Lance l'import (un seul à la fois) et rafraîchit les écrans si la base a changé. */
export function syncHealth(db: SQLiteDatabase) {
  running ??= run(db)
    .catch(() => false)
    .then((changed) => {
      if (changed) invalidate();
      return changed;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

async function run(db: SQLiteDatabase) {
  if (!healthSupported) return false;
  const linked = (await listTrackers(db)).filter((t) => t.source === 'health');
  if (!linked.length) return false;
  const granted = await grantedHealthMetrics();

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1));
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const fromKey = dayKey(from);

  const needs = (m: 'steps' | 'sleep') => granted.has(m) && linked.some((t) => healthMetricOf(t) === m);
  const [steps, nights] = await Promise.all([
    needs('steps') ? readDailySteps(from, tomorrow) : [],
    needs('sleep') ? readNights(from, tomorrow) : [],
  ]);

  // Une nuit par jour de lever : la plus longue (une sieste ne remplace pas la nuit).
  const nightByDay = new Map<DayKey, { slept: number; woke: number; length: number }>();
  for (const n of nights) {
    const length = n.end.getTime() - n.start.getTime();
    const day = dayKey(n.end);
    if ((nightByDay.get(day)?.length ?? 0) < length) nightByDay.set(day, { slept: clockOf(n.start), woke: clockOf(n.end), length });
  }

  let changed = false;
  for (const t of linked) {
    const metric = healthMetricOf(t);
    if (!metric || !granted.has(metric)) continue;
    const rows = await db.getAllAsync<{ day: DayKey; value: number; slept_at: number | null; woke_at: number | null }>(
      'SELECT day, value, slept_at, woke_at FROM tracker_entries WHERE tracker_id = ? AND day >= ?', t.id, fromKey,
    );
    const have = new Map(rows.map((r) => [r.day, r]));

    if (metric === 'steps') {
      for (const s of steps) {
        const day = dayKey(s.start);
        if (have.get(day)?.value === s.count) continue;
        await db.runAsync(
          'INSERT INTO tracker_entries (tracker_id, day, value) VALUES (?, ?, ?) ON CONFLICT(tracker_id, day) DO UPDATE SET value = excluded.value',
          t.id, day, s.count,
        );
        changed = true;
      }
    } else {
      for (const [day, n] of nightByDay) {
        const cur = have.get(day);
        if (cur?.slept_at === n.slept && cur?.woke_at === n.woke) continue;
        await db.runAsync(
          `INSERT INTO tracker_entries (tracker_id, day, value, slept_at, woke_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(tracker_id, day) DO UPDATE SET value = excluded.value, slept_at = excluded.slept_at, woke_at = excluded.woke_at`,
          t.id, day, nightMinutes(n.slept, n.woke), n.slept, n.woke,
        );
        changed = true;
      }
    }
  }
  return changed;
}
