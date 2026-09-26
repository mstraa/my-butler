import type { SQLiteDatabase } from 'expo-sqlite';

import { nowStamp } from '@/lib/dates';
import type { PhoneEvent } from '@/lib/google-calendar';

/*
 * Import Google Agenda, en lecture seule. Titre, horaires, lieu et lien Meet viennent du téléphone et sont
 * réécrits à chaque synchro ; catégorie, notes, rappel, échéance et annulation restent dans l'app.
 */

/** Agendas importés, avec la catégorie donnée à leurs rendez-vous (null = sans catégorie). */
export type GoogleSettings = {
  calendars: Record<string, number | null>;
  lastSync: string | null;
};

const KEY_CALENDARS = 'google:calendars';
const KEY_LAST_SYNC = 'google:last_sync';

async function putSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

export async function getGoogleSettings(db: SQLiteDatabase): Promise<GoogleSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string | null }>(
    'SELECT key, value FROM settings WHERE key IN (?, ?)', KEY_CALENDARS, KEY_LAST_SYNC,
  );
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
  let calendars: GoogleSettings['calendars'] = {};
  try {
    calendars = JSON.parse(get(KEY_CALENDARS) ?? '{}');
  } catch {}
  return { calendars, lastSync: get(KEY_LAST_SYNC) };
}

/** Active ou coupe un agenda. Coupé : ses rendez-vous importés sont retirés de l'app. */
export async function setCalendarEnabled(db: SQLiteDatabase, calendarId: string, on: boolean) {
  const { calendars } = await getGoogleSettings(db);
  if (on) calendars[calendarId] = calendars[calendarId] ?? null;
  else delete calendars[calendarId];
  await db.withTransactionAsync(async () => {
    await putSetting(db, KEY_CALENDARS, JSON.stringify(calendars));
    if (!on) await removeImported(db, 'calendar_id = ?', [calendarId]);
  });
}

/** Catégorie d'un agenda : appliquée à tous ses rendez-vous déjà importés. */
export async function setCalendarCategory(db: SQLiteDatabase, calendarId: string, categoryId: number | null) {
  const { calendars } = await getGoogleSettings(db);
  calendars[calendarId] = categoryId;
  await db.withTransactionAsync(async () => {
    await putSetting(db, KEY_CALENDARS, JSON.stringify(calendars));
    await db.runAsync("UPDATE events SET category_id = ? WHERE source = 'google' AND calendar_id = ?", categoryId, calendarId);
  });
}

async function removeImported(db: SQLiteDatabase, where: string, args: (string | number)[]) {
  const cond = `source = 'google' AND ${where}`;
  await db.runAsync(
    `DELETE FROM deadline_log WHERE item_type = 'event' AND item_id IN (SELECT id FROM events WHERE ${cond})`, ...args,
  );
  return (await db.runAsync(`DELETE FROM events WHERE ${cond}`, ...args)).changes;
}

/**
 * Met la base au niveau des agendas lus sur [fromKey, toKey[ : ajoute, met à jour, et retire ce
 * qui a disparu du téléphone dans cette fenêtre. Renvoie le nombre de lignes changées.
 */
export async function applyGoogleSync(
  db: SQLiteDatabase, events: PhoneEvent[], fromKey: string, toKey: string,
): Promise<number> {
  const { calendars } = await getGoogleSettings(db);
  const ids = Object.keys(calendars);
  let changed = 0;

  await db.withTransactionAsync(async () => {
    // Agendas coupés entre-temps (ou disparus du téléphone) : plus rien d'importé.
    const marks = ids.map(() => '?').join(',');
    changed += await removeImported(db, ids.length ? `calendar_id NOT IN (${marks})` : '1', ids);

    const existing = await db.getAllAsync<{
      id: number; external_id: string; title: string; starts_at: string; ends_at: string | null;
      all_day: number; location: string | null; calendar_id: string; meet_url: string | null;
    }>(
      `SELECT id, external_id, title, starts_at, ends_at, all_day, location, calendar_id, meet_url
         FROM events WHERE source = 'google' AND external_id IS NOT NULL`,
    );
    const byExt = new Map(existing.map((r) => [r.external_id, r]));
    const seen = new Set<string>();

    for (const e of events) {
      if (!(e.calendarId in calendars) || seen.has(e.externalId)) continue;
      seen.add(e.externalId);
      const prev = byExt.get(e.externalId);
      if (!prev) {
        await db.runAsync(
          `INSERT INTO events (title, category_id, starts_at, ends_at, all_day, location, meet_url, recurrence,
                               source, external_id, calendar_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'none', 'google', ?, ?, ?)`,
          e.title, calendars[e.calendarId], e.startsAt, e.endsAt, e.allDay ? 1 : 0, e.location, e.meetUrl,
          e.externalId, e.calendarId, nowStamp(),
        );
        changed++;
      } else if (
        prev.title !== e.title || prev.starts_at !== e.startsAt || prev.ends_at !== e.endsAt ||
        !!prev.all_day !== e.allDay || prev.location !== e.location || prev.calendar_id !== e.calendarId ||
        prev.meet_url !== e.meetUrl
      ) {
        await db.runAsync(
          `UPDATE events SET title = ?, starts_at = ?, ends_at = ?, all_day = ?, location = ?, calendar_id = ?,
                             meet_url = ?
            WHERE id = ?`,
          e.title, e.startsAt, e.endsAt, e.allDay ? 1 : 0, e.location, e.calendarId, e.meetUrl, prev.id,
        );
        changed++;
      }
    }

    // Supprimés du téléphone : seulement dans la fenêtre lue (le reste n'a pas été relu).
    const gone = existing.filter(
      (r) => !seen.has(r.external_id) && r.starts_at >= fromKey && r.starts_at < toKey && r.calendar_id in calendars,
    );
    for (const r of gone) changed += await removeImported(db, 'id = ?', [r.id]);

    await putSetting(db, KEY_LAST_SYNC, nowStamp());
  });
  return changed;
}
