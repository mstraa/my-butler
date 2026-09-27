import type { SQLiteDatabase } from 'expo-sqlite';

import type { Recurrence } from '@/db/agenda';
import { nowStamp, type Stamp } from '@/lib/dates';

export type Category = { id: number; key: string; name: string; color: string; icon: string };

export async function getCategories(db: SQLiteDatabase) {
  return db.getAllAsync<Category>('SELECT id, key, name, color, icon FROM categories ORDER BY sort, id');
}

/** Ce que le formulaire lit et écrit. */
export type EventDraft = {
  title: string;
  categoryId: number | null;
  startsAt: Stamp;
  endsAt: Stamp | null;
  allDay: boolean;
  location: string;
  reminderMin: number | null;
  /** Rappel par notification, ou vraie alarme (sonnerie, plein écran). */
  reminderKind: ReminderKind;
  recurrence: Recurrence;
  deadline: { label: string; at: Stamp } | null;
  notes: string;
};

export type ReminderKind = 'notif' | 'alarm';

export type EventRecord = EventDraft & {
  id: number;
  source: 'app' | 'google';
  /** Rendez-vous Google répété : id de la série (ses occurrences partagent le rappel), sinon null. */
  googleSeries: string | null;
  /** Lien Google Meet (rendez-vous importés de Google Agenda). */
  meetUrl: string | null;
  deadlineState: 'open' | 'done' | 'abandoned' | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelMode: 'keep' | 'hide' | null;
};

export async function getEvent(db: SQLiteDatabase, id: number): Promise<EventRecord | null> {
  const r = await db.getFirstAsync<{
    id: number; title: string; category_id: number | null; starts_at: Stamp; ends_at: Stamp | null;
    all_day: number; location: string | null; reminder_min: number | null; reminder_kind: ReminderKind; recurrence: Recurrence;
    deadline_at: Stamp | null; deadline_label: string | null; deadline_state: EventRecord['deadlineState'];
    source: 'app' | 'google'; cancelled_at: string | null; cancel_reason: string | null;
    cancel_mode: 'keep' | 'hide' | null; notes: string | null; meet_url: string | null; external_id: string | null;
  }>('SELECT * FROM events WHERE id = ?', id);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    categoryId: r.category_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: !!r.all_day,
    location: r.location ?? '',
    reminderMin: r.reminder_min,
    reminderKind: r.reminder_kind === 'alarm' ? 'alarm' : 'notif',
    recurrence: r.recurrence,
    deadline: r.deadline_at ? { label: r.deadline_label ?? '', at: r.deadline_at } : null,
    deadlineState: r.deadline_state,
    source: r.source,
    googleSeries: r.source === 'google' ? seriesOf(r.external_id) : null,
    meetUrl: r.meet_url,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    cancelMode: r.cancel_mode,
    notes: r.notes ?? '',
  };
}

/** « 1234@2026-09-28T07:00:00.000Z » (occurrence d'un évènement répété, voir listPhoneEvents) → « 1234 ». */
export function seriesOf(externalId: string | null) {
  const at = externalId?.lastIndexOf('@') ?? -1;
  return at > 0 ? externalId!.slice(0, at) : null;
}

/**
 * Rappel d'un rendez-vous Google répété : gardé pour la série (les occurrences importées plus tard le reprennent,
 * voir applyGoogleSync) et appliqué à toutes les occurrences déjà là.
 */
async function setSeriesReminder(db: SQLiteDatabase, series: string, min: number | null, kind: ReminderKind) {
  await db.runAsync(
    `INSERT INTO google_series (series_id, reminder_min, reminder_kind) VALUES (?, ?, ?)
     ON CONFLICT(series_id) DO UPDATE SET reminder_min = excluded.reminder_min, reminder_kind = excluded.reminder_kind`,
    series, min, kind,
  );
  await db.runAsync(
    "UPDATE events SET reminder_min = ?, reminder_kind = ? WHERE source = 'google' AND external_id LIKE ? ESCAPE '\\'",
    min, kind, `${series.replace(/[\\%_]/g, (c) => `\\${c}`)}@%`,
  );
}

export async function createEvent(db: SQLiteDatabase, d: EventDraft) {
  const res = await db.runAsync(
    `INSERT INTO events (title, category_id, starts_at, ends_at, all_day, location, reminder_min, reminder_kind, recurrence,
                         deadline_at, deadline_label, deadline_state, notes, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'app', ?)`,
    d.title.trim(), d.categoryId, d.startsAt, d.allDay ? null : d.endsAt, d.allDay ? 1 : 0,
    (d.location ?? '').trim() || null, d.reminderMin, d.reminderKind, d.recurrence,
    d.deadline?.at ?? null, d.deadline ? d.deadline.label.trim() || null : null, d.deadline ? 'open' : null,
    (d.notes ?? '').trim() || null, nowStamp(),
  );
  return res.lastInsertRowId;
}

export async function updateEvent(db: SQLiteDatabase, id: number, d: EventDraft) {
  const prev = await getEvent(db, id);
  // Une échéance modifiée (ou ajoutée) redevient « ouverte » ; sinon on garde son état.
  const deadlineState = d.deadline
    ? prev?.deadline?.at === d.deadline.at && prev.deadlineState
      ? prev.deadlineState
      : 'open'
    : null;
  await db.runAsync(
    `UPDATE events SET title = ?, category_id = ?, starts_at = ?, ends_at = ?, all_day = ?, location = ?,
                       reminder_min = ?, reminder_kind = ?, recurrence = ?, deadline_at = ?, deadline_label = ?, deadline_state = ?,
                       notes = ?
      WHERE id = ?`,
    d.title.trim(), d.categoryId, d.startsAt, d.allDay ? null : d.endsAt, d.allDay ? 1 : 0,
    (d.location ?? '').trim() || null, d.reminderMin, d.reminderKind, d.recurrence,
    d.deadline?.at ?? null, d.deadline ? d.deadline.label.trim() || null : null, deadlineState,
    (d.notes ?? '').trim() || null, id,
  );
  if (prev?.googleSeries) await setSeriesReminder(db, prev.googleSeries, d.reminderMin, d.reminderKind);
}

export async function deleteEvent(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM deadline_log WHERE item_type = 'event' AND item_id = ?", id);
    await db.runAsync('DELETE FROM events WHERE id = ?', id);
  });
}

/* ——— Détail, annulation ——— */

export type CancelMode = 'keep' | 'hide' | 'delete';

/**
 * Annule un rendez-vous. « keep » : reste barré dans l'agenda ; « hide » : disparaît de
 * l'agenda mais reste en base (historique) ; « delete » : supprimé sans trace.
 */
export async function cancelEvent(db: SQLiteDatabase, id: number, mode: CancelMode, reason: string | null) {
  if (mode === 'delete') return deleteEvent(db, id);
  await db.runAsync(
    'UPDATE events SET cancelled_at = ?, cancel_reason = ?, cancel_mode = ? WHERE id = ?',
    nowStamp(), reason?.trim() || null, mode, id,
  );
}

export async function restoreEvent(db: SQLiteDatabase, id: number) {
  await db.runAsync('UPDATE events SET cancelled_at = NULL, cancel_reason = NULL, cancel_mode = NULL WHERE id = ?', id);
}

/** Copie un rendez-vous (sans annulation ni état d'échéance) ; renvoie l'id de la copie. */
export async function duplicateEvent(db: SQLiteDatabase, id: number) {
  const e = await getEvent(db, id);
  if (!e) return null;
  const newId = await createEvent(db, e);
  return newId;
}

export async function setEventNotes(db: SQLiteDatabase, id: number, notes: string) {
  await db.runAsync('UPDATE events SET notes = ? WHERE id = ?', notes.trim() || null, id);
}

/** Coche / décoche l'échéance d'un rendez-vous (datée dans l'historique). */
export async function setEventDeadlineDone(db: SQLiteDatabase, id: number, done: boolean) {
  const e = await getEvent(db, id);
  if (!e?.deadline) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE events SET deadline_state = ? WHERE id = ?', done ? 'done' : 'open', id);
    if (done) {
      await db.runAsync(
        "INSERT INTO deadline_log (item_type, item_id, action, at, from_due) VALUES ('event', ?, 'done', ?, ?)",
        id, nowStamp(), e.deadline!.at,
      );
    }
  });
}
