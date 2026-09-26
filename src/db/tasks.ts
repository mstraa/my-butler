import type { SQLiteDatabase } from 'expo-sqlite';

import { type DayKey, dayOf, nowStamp, type Stamp } from '@/lib/dates';

/** Ce que le formulaire de tâche lit et écrit. */
export type TaskDraft = {
  title: string;
  categoryId: number | null;
  /** Jour où la tâche apparaît dans l'agenda (celui de l'échéance s'il y en a une). */
  day: DayKey;
  /** Échéance ; null = tâche sans heure limite. */
  due: Stamp | null;
  reminderMin: number | null;
  /** Échéance passée sans action → « En retard ». */
  showLate: boolean;
  /** Relance quotidienne 'HH:mm' tant que la tâche est en retard ; null = aucune. */
  nagAt: string | null;
  tracksExpense: boolean;
  estimateCents: number | null;
  /** Note libre (mise en forme à l'affichage). */
  notes: string;
};

export type TaskRecord = TaskDraft & {
  id: number;
  state: 'open' | 'done' | 'abandoned';
};

type TaskRow = {
  id: number; title: string; day: DayKey | null; due_at: Stamp | null; category_id: number | null;
  tracks_expense: number; estimate_cents: number | null; state: TaskRecord['state'];
  reminder_min: number | null; show_late: number; nag_at: string | null; notes: string | null;
};

export async function getTask(db: SQLiteDatabase, id: number): Promise<TaskRecord | null> {
  const r = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', id);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    categoryId: r.category_id,
    day: r.day ?? (r.due_at ? dayOf(r.due_at) : nowStamp().slice(0, 10)),
    due: r.due_at,
    reminderMin: r.reminder_min,
    showLate: !!r.show_late,
    nagAt: r.nag_at,
    tracksExpense: !!r.tracks_expense,
    estimateCents: r.estimate_cents,
    notes: r.notes ?? '',
    state: r.state,
  };
}

/** Ce que l'aperçu affiche en plus : reports, dépense payée, motif d'abandon. */
export type TaskDetail = TaskRecord & {
  postponed: number;
  spentCents: number | null;
  abandonReason: string | null;
};

export async function getTaskDetail(db: SQLiteDatabase, id: number): Promise<TaskDetail | null> {
  const [task, extra] = await Promise.all([
    getTask(db, id),
    db.getFirstAsync<{ postponed: number; spent: number | null; reason: string | null }>(
      `SELECT (SELECT COUNT(*) FROM deadline_log WHERE item_type = 'task' AND item_id = t.id AND action = 'postponed') AS postponed,
              (SELECT SUM(amount_cents) FROM expenses WHERE task_id = t.id) AS spent,
              t.abandon_reason AS reason
         FROM tasks t WHERE t.id = ?`,
      id,
    ),
  ]);
  if (!task) return null;
  return { ...task, postponed: extra?.postponed ?? 0, spentCents: extra?.spent ?? null, abandonReason: extra?.reason ?? null };
}

/** Le rappel, le retard et la relance n'ont de sens qu'avec une échéance. */
const columns = (d: TaskDraft) => [
  d.title.trim(),
  d.due ? dayOf(d.due) : d.day,
  d.due,
  d.categoryId,
  d.tracksExpense ? 1 : 0,
  d.tracksExpense ? d.estimateCents : null,
  d.due ? d.reminderMin : null,
  d.due && d.showLate ? 1 : 0,
  d.due && d.showLate ? d.nagAt : null,
  d.notes.trim() || null,
];

export async function createTask(db: SQLiteDatabase, d: TaskDraft) {
  const res = await db.runAsync(
    `INSERT INTO tasks (title, day, due_at, category_id, tracks_expense, estimate_cents, reminder_min, show_late, nag_at,
                        notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...columns(d), nowStamp(),
  );
  return res.lastInsertRowId;
}

export async function updateTask(db: SQLiteDatabase, id: number, d: TaskDraft) {
  await db.runAsync(
    `UPDATE tasks SET title = ?, day = ?, due_at = ?, category_id = ?, tracks_expense = ?, estimate_cents = ?,
                      reminder_min = ?, show_late = ?, nag_at = ?, notes = ?
      WHERE id = ?`,
    ...columns(d), id,
  );
}

export async function deleteTask(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM deadline_log WHERE item_type = 'task' AND item_id = ?", id);
    // La dépense déjà payée reste dans les comptes, sans lien vers la tâche.
    await db.runAsync('UPDATE expenses SET task_id = NULL WHERE task_id = ?', id);
    await db.runAsync('DELETE FROM tasks WHERE id = ?', id);
  });
}

/**
 * Coche ou décoche une tâche. Cochée : datée dans l'historique si elle avait une échéance,
 * et la dépense réelle (si donnée) est enregistrée. Décochée : on défait les deux.
 */
export async function setTaskDone(db: SQLiteDatabase, id: number, done: boolean, amountCents: number | null = null) {
  const t = await db.getFirstAsync<{ title: string; due_at: Stamp | null; category_id: number | null }>(
    'SELECT title, due_at, category_id FROM tasks WHERE id = ?', id,
  );
  if (!t) return;
  const now = nowStamp();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE tasks SET state = ?, state_at = ? WHERE id = ?', done ? 'done' : 'open', now, id);
    if (done) {
      if (t.due_at) {
        await db.runAsync(
          "INSERT INTO deadline_log (item_type, item_id, action, at, from_due) VALUES ('task', ?, 'done', ?, ?)",
          id, now, t.due_at,
        );
      }
      if (amountCents !== null) {
        await db.runAsync(
          'INSERT INTO expenses (amount_cents, label, category_id, spent_at, task_id) VALUES (?, ?, ?, ?, ?)',
          amountCents, t.title, t.category_id, now, id,
        );
      }
    } else {
      await db.runAsync(
        `DELETE FROM deadline_log WHERE id = (
           SELECT MAX(id) FROM deadline_log WHERE item_type = 'task' AND item_id = ? AND action = 'done')`,
        id,
      );
      await db.runAsync('DELETE FROM expenses WHERE task_id = ?', id);
    }
  });
}

/** Montant saisi (« 12,50 », « 8 ») → centimes ; null si vide ou illisible. */
export function parseEuros(text: string): number | null {
  const clean = text.replace(/\s|€/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** 8400 → « 84 », 1250 → « 12,50 ». */
export function formatEuros(cents: number) {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
}

export async function setTaskNotes(db: SQLiteDatabase, id: number, notes: string) {
  await db.runAsync('UPDATE tasks SET notes = ? WHERE id = ?', notes.trim() || null, id);
}
