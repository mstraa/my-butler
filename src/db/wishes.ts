import { differenceInCalendarDays } from 'date-fns';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { addExpense } from '@/db/expenses';
import { dayOf, nowStamp, parseDay, type Stamp, todayKey } from '@/lib/dates';

/*
 * Envies d'achat : une chose qu'on aimerait acheter, avec lien, image et prix.
 * Elle attend (« waiting ») puis est achetée ou abandonnée. Une envie qui tient 30 jours
 * mérite peut-être d'être achetée : elle porte alors le badge « 30 j+ ».
 */

export type WishState = 'waiting' | 'bought' | 'abandoned';
export type WishLevel = 'bof' | 'envie' | 'besoin';
/** Origine de l'image : lien (page web), photo (appareil), capture (galerie). */
export type WishSource = 'lien' | 'photo' | 'screen';

export type WishDraft = {
  title: string;
  url: string;
  imageUri: string | null;
  priceCents: number | null;
  level: WishLevel;
  source: WishSource | null;
};

export type Wish = WishDraft & {
  id: number;
  state: WishState;
  stateAt: Stamp | null;
  createdAt: Stamp;
  expenseId: number | null;
  /** Jours depuis l'entrée dans la liste. */
  days: number;
};

export type WishSort = 'age' | 'price';

/** Au bout de ce nombre de jours, une envie en attente porte le badge « 30 j+ ». */
export const OLD_DAYS = 30;

type Row = {
  id: number; title: string; url: string | null; image_uri: string | null; price_cents: number | null;
  state: WishState; state_at: Stamp | null; created_at: Stamp; level: WishLevel; source: WishSource | null;
  expense_id: number | null;
};

const toWish = (r: Row, today = todayKey()): Wish => ({
  id: r.id, title: r.title, url: r.url ?? '', imageUri: r.image_uri, priceCents: r.price_cents,
  level: r.level, source: r.source, state: r.state, stateAt: r.state_at, createdAt: r.created_at,
  expenseId: r.expense_id,
  days: Math.max(0, differenceInCalendarDays(parseDay(today), parseDay(dayOf(r.created_at)))),
});

export async function listWishes(db: SQLiteDatabase, state: WishState, sort: WishSort) {
  const order = sort === 'price' ? 'price_cents IS NULL, price_cents DESC, created_at' : state === 'waiting' ? 'created_at' : 'state_at DESC';
  const rows = await db.getAllAsync<Row>(`SELECT * FROM wishes WHERE state = ? ORDER BY ${order}, id`, state);
  const today = todayKey();
  return rows.map((r) => toWish(r, today));
}

export async function getWish(db: SQLiteDatabase, id: number) {
  const row = await db.getFirstAsync<Row>('SELECT * FROM wishes WHERE id = ?', id);
  return row ? toWish(row) : null;
}

export async function createWish(db: SQLiteDatabase, d: WishDraft) {
  const res = await db.runAsync(
    'INSERT INTO wishes (title, url, image_uri, price_cents, level, source, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    d.title.trim(), d.url.trim() || null, d.imageUri, d.priceCents, d.level, d.source, 'waiting', nowStamp(),
  );
  return res.lastInsertRowId;
}

export async function updateWish(db: SQLiteDatabase, id: number, d: WishDraft) {
  const before = await getWish(db, id);
  await db.runAsync(
    'UPDATE wishes SET title = ?, url = ?, image_uri = ?, price_cents = ?, level = ?, source = ? WHERE id = ?',
    d.title.trim(), d.url.trim() || null, d.imageUri, d.priceCents, d.level, d.source, id,
  );
  if (before?.imageUri && before.imageUri !== d.imageUri) deleteLocalImage(before.imageUri);
}

export async function deleteWish(db: SQLiteDatabase, id: number) {
  const w = await getWish(db, id);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE gift_ideas SET wish_id = NULL WHERE wish_id = ?', id);
    await db.runAsync('DELETE FROM wishes WHERE id = ?', id);
  });
  if (w?.imageUri) deleteLocalImage(w.imageUri);
}

/**
 * Change l'état d'une envie. Achetée avec `expense` : la dépense est créée aujourd'hui (prix de l'envie).
 * Revenir en attente retire la dépense créée à l'achat.
 */
export async function setWishState(db: SQLiteDatabase, id: number, state: WishState, expense = false) {
  const w = await getWish(db, id);
  if (!w) return;
  await db.withTransactionAsync(async () => {
    let expenseId = w.expenseId;
    if (state !== 'bought' && expenseId !== null) {
      await db.runAsync('DELETE FROM expenses WHERE id = ?', expenseId);
      expenseId = null;
    }
    if (state === 'bought' && expense && w.priceCents !== null && expenseId === null) {
      expenseId = await addExpense(db, { amountCents: w.priceCents, label: w.title, categoryId: null, spentAt: nowStamp() });
    }
    await db.runAsync(
      'UPDATE wishes SET state = ?, state_at = ?, expense_id = ? WHERE id = ?',
      state, state === 'waiting' ? null : nowStamp(), expenseId, id,
    );
  });
}

/** Les images prises ou choisies sont copiées dans les documents de l'app ; les images de lien restent distantes. */
function deleteLocalImage(uri: string) {
  if (!uri.startsWith('file:')) return;
  try {
    new File(uri).delete();
  } catch {
    // Déjà supprimée : rien à faire.
  }
}
