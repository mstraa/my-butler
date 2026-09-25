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
  recurrence: Recurrence;
  deadline: { label: string; at: Stamp } | null;
  notes: string;
};

export type EventRecord = EventDraft & {
  id: number;
  source: 'app' | 'google';
  deadlineState: 'open' | 'done' | 'abandoned' | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelMode: 'keep' | 'hide' | null;
};

export async function getEvent(db: SQLiteDatabase, id: number): Promise<EventRecord | null> {
  const r = await db.getFirstAsync<{
    id: number; title: string; category_id: number | null; starts_at: Stamp; ends_at: Stamp | null;
    all_day: number; location: string | null; reminder_min: number | null; recurrence: Recurrence;
    deadline_at: Stamp | null; deadline_label: string | null; deadline_state: EventRecord['deadlineState'];
    source: 'app' | 'google'; cancelled_at: string | null; cancel_reason: string | null;
    cancel_mode: 'keep' | 'hide' | null; notes: string | null;
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
    recurrence: r.recurrence,
    deadline: r.deadline_at ? { label: r.deadline_label ?? '', at: r.deadline_at } : null,
    deadlineState: r.deadline_state,
    source: r.source,
    cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason,
    cancelMode: r.cancel_mode,
    notes: r.notes ?? '',
  };
}

export async function createEvent(db: SQLiteDatabase, d: EventDraft) {
  const res = await db.runAsync(
    `INSERT INTO events (title, category_id, starts_at, ends_at, all_day, location, reminder_min, recurrence,
                         deadline_at, deadline_label, deadline_state, notes, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'app', ?)`,
    d.title.trim(), d.categoryId, d.startsAt, d.allDay ? null : d.endsAt, d.allDay ? 1 : 0,
    d.location.trim() || null, d.reminderMin, d.recurrence,
    d.deadline?.at ?? null, d.deadline ? d.deadline.label.trim() || null : null, d.deadline ? 'open' : null,
    d.notes.trim() || null, nowStamp(),
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
                       reminder_min = ?, recurrence = ?, deadline_at = ?, deadline_label = ?, deadline_state = ?,
                       notes = ?
      WHERE id = ?`,
    d.title.trim(), d.categoryId, d.startsAt, d.allDay ? null : d.endsAt, d.allDay ? 1 : 0,
    d.location.trim() || null, d.reminderMin, d.recurrence,
    d.deadline?.at ?? null, d.deadline ? d.deadline.label.trim() || null : null, deadlineState,
    d.notes.trim() || null, id,
  );
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
