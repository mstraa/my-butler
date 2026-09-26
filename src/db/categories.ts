import type { SQLiteDatabase } from 'expo-sqlite';

import type { Category } from '@/db/events';
import { forgetCalendarCategory } from '@/db/google';

/*
 * Catégories (Perso, Santé, Courses…), partagées par les rendez-vous, tâches, dépenses et anniversaires.
 * La `key` des catégories d'origine reste fixe (le seed et les données de test s'en servent) ;
 * une catégorie créée dans l'app en reçoit une unique.
 */

export type CategoryDraft = { name: string; color: string; icon: string };

export async function getCategory(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Category>('SELECT id, key, name, color, icon FROM categories WHERE id = ?', id);
}

export async function createCategory(db: SQLiteDatabase, d: CategoryDraft) {
  const last = await db.getFirstAsync<{ sort: number | null }>('SELECT MAX(sort) AS sort FROM categories');
  await db.runAsync(
    'INSERT INTO categories (key, name, color, icon, sort) VALUES (?, ?, ?, ?, ?)',
    `custom-${Date.now()}`, d.name.trim(), d.color, d.icon, (last?.sort ?? -1) + 1,
  );
}

export async function updateCategory(db: SQLiteDatabase, id: number, d: CategoryDraft) {
  await db.runAsync('UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?', d.name.trim(), d.color, d.icon, id);
}

/** Nombre d'éléments rangés dans la catégorie, pour prévenir avant de la supprimer. */
export async function countCategoryUses(db: SQLiteDatabase, id: number) {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM events WHERE category_id = ?1)
          + (SELECT COUNT(*) FROM tasks WHERE category_id = ?1)
          + (SELECT COUNT(*) FROM expenses WHERE category_id = ?1)
          + (SELECT COUNT(*) FROM birthdays WHERE category_id = ?1) AS n`,
    id,
  );
  return row?.n ?? 0;
}

/** Supprime la catégorie ; ce qui y était rangé passe « sans catégorie ». */
export async function deleteCategory(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    for (const table of ['events', 'tasks', 'expenses', 'birthdays']) {
      await db.runAsync(`UPDATE ${table} SET category_id = NULL WHERE category_id = ?`, id);
    }
    await forgetCalendarCategory(db, id);
    await db.runAsync('DELETE FROM categories WHERE id = ?', id);
  });
}
