import { differenceInCalendarDays, getDaysInMonth } from 'date-fns';
import type { SQLiteDatabase } from 'expo-sqlite';

import { type DayKey, nowStamp, parseDay, shiftDay, todayKey } from '@/lib/dates';
import { categoryColors } from '@/theme/tokens';

/** Ce que le formulaire lit et écrit. */
export type BirthdayDraft = {
  name: string;
  day: number;
  month: number; // 1 à 12
  year: number | null; // inconnue possible
  categoryId: number | null;
  remindD7: boolean;
  remindD1: boolean;
  remindD0: boolean;
  remindTime: string; // 'HH:mm'
  trackGifts: boolean;
  buyDays: number;
  /** Idées pas encore offertes (id absent = nouvelle). */
  ideas: { id?: number; title: string }[];
};

type BirthdayRow = {
  id: number; name: string; month: number; day: number; year: number | null; category_id: number | null;
  remind_d7: number; remind_d1: number; remind_d0: number; remind_time: string;
  track_gifts: number; buy_days: number;
};

export type Birthday = Omit<BirthdayDraft, 'ideas'> & { id: number };

const fromRow = (r: BirthdayRow): Birthday => ({
  id: r.id,
  name: r.name,
  day: r.day,
  month: r.month,
  year: r.year,
  categoryId: r.category_id,
  remindD7: !!r.remind_d7,
  remindD1: !!r.remind_d1,
  remindD0: !!r.remind_d0,
  remindTime: r.remind_time,
  trackGifts: !!r.track_gifts,
  buyDays: r.buy_days,
});

const pad = (n: number) => String(n).padStart(2, '0');

/** Le jour de l'anniversaire une année donnée (un 29 février tombe le 28 les autres années). */
export function occurrenceIn(month: number, day: number, year: number): DayKey {
  const max = getDaysInMonth(new Date(year, month - 1, 1));
  return `${year}-${pad(month)}-${pad(Math.min(day, max))}`;
}

/** Prochain anniversaire à partir d'aujourd'hui (aujourd'hui compris). */
export function nextOccurrence(month: number, day: number, today: DayKey = todayKey()): DayKey {
  const y = Number(today.slice(0, 4));
  const d = occurrenceIn(month, day, y);
  return d >= today ? d : occurrenceIn(month, day, y + 1);
}

export const daysUntil = (d: DayKey, today: DayKey = todayKey()) => differenceInCalendarDays(parseDay(d), parseDay(today));

/** « aujourd'hui », « demain », « dans 8 j ». */
export function untilLabel(n: number) {
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  return `dans ${n} j`;
}

/** Âge fêté à cette date ; null si l'année de naissance est inconnue. */
export const ageAt = (b: Pick<Birthday, 'year'>, occ: DayKey) => (b.year ? Number(occ.slice(0, 4)) - b.year : null);

/** Date limite d'achat du cadeau pour cette occurrence. */
export const buyBefore = (b: Pick<Birthday, 'buyDays'>, occ: DayKey) => shiftDay(occ, -b.buyDays);

/** Rappels actifs, ex. « J-7, J-1, le jour ». */
export function remindersLabel(b: Pick<Birthday, 'remindD7' | 'remindD1' | 'remindD0'>) {
  const out = [b.remindD7 && 'J-7', b.remindD1 && 'J-1', b.remindD0 && 'le jour'].filter(Boolean);
  return out.length ? out.join(', ') : 'aucun rappel';
}

export type Cat = { name: string; color: string };

export type BirthdaySummary = Birthday & {
  next: DayKey;
  inDays: number;
  age: number | null;
  category: Cat | null;
  ideas: number;
  given: number;
  /** Cadeau pour cette occurrence : offert, sinon première idée. */
  gift: { title: string; given: boolean } | null;
};

/** Tous les anniversaires, du plus proche au plus lointain. */
export async function listBirthdays(db: SQLiteDatabase, today: DayKey = todayKey()): Promise<BirthdaySummary[]> {
  const [rows, cats, ideas, given] = await Promise.all([
    db.getAllAsync<BirthdayRow>('SELECT * FROM birthdays'),
    db.getAllAsync<{ id: number; name: string; color: string }>('SELECT id, name, color FROM categories'),
    db.getAllAsync<{ birthday_id: number; title: string }>(
      'SELECT birthday_id, title FROM gift_ideas WHERE bought = 0 ORDER BY created_at, id',
    ),
    db.getAllAsync<{ birthday_id: number; year: number; title: string }>(
      'SELECT birthday_id, year, title FROM gifts_given ORDER BY id DESC',
    ),
  ]);
  return rows
    .map((r) => {
      const b = fromRow(r);
      const next = nextOccurrence(b.month, b.day, today);
      const occYear = Number(next.slice(0, 4));
      const mine = ideas.filter((i) => i.birthday_id === b.id);
      const gifts = given.filter((g) => g.birthday_id === b.id);
      const now = gifts.find((g) => g.year === occYear);
      const c = cats.find((x) => x.id === b.categoryId);
      return {
        ...b,
        next,
        inDays: daysUntil(next, today),
        age: ageAt(b, next),
        category: c ? { name: c.name, color: c.color } : null,
        ideas: mine.length,
        given: gifts.length,
        gift: now ? { title: now.title, given: true } : mine[0] ? { title: mine[0].title, given: false } : null,
      };
    })
    .sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}

export type GiftIdea = { id: number; title: string; priceCents: number | null; createdAt: string; given: boolean; fromWish: boolean };
export type GiftGiven = { id: number; year: number; title: string; priceCents: number | null };

export type BirthdayDetail = BirthdaySummary & { ideaList: GiftIdea[]; givenList: GiftGiven[] };

export async function getBirthday(db: SQLiteDatabase, id: number, today: DayKey = todayKey()): Promise<BirthdayDetail | null> {
  const all = await listBirthdays(db, today);
  const b = all.find((x) => x.id === id);
  if (!b) return null;
  const occYear = Number(b.next.slice(0, 4));
  const [ideas, given] = await Promise.all([
    db.getAllAsync<{ id: number; title: string; price_cents: number | null; created_at: string; wish_id: number | null; given_year: number | null }>(
      `SELECT i.id, i.title, i.price_cents, i.created_at, i.wish_id, g.year AS given_year
         FROM gift_ideas i LEFT JOIN gifts_given g ON g.id = i.given_id
        WHERE i.birthday_id = ? AND (i.bought = 0 OR g.year = ?)
        ORDER BY i.created_at, i.id`,
      id, occYear,
    ),
    db.getAllAsync<{ id: number; year: number; title: string; price_cents: number | null }>(
      'SELECT id, year, title, price_cents FROM gifts_given WHERE birthday_id = ? ORDER BY year DESC, id DESC',
      id,
    ),
  ]);
  return {
    ...b,
    ideaList: ideas.map((i) => ({
      id: i.id, title: i.title, priceCents: i.price_cents, createdAt: i.created_at,
      given: i.given_year !== null, fromWish: i.wish_id !== null,
    })),
    givenList: given.map((g) => ({ id: g.id, year: g.year, title: g.title, priceCents: g.price_cents })),
  };
}

/** Pour le formulaire de modification. */
export async function getBirthdayDraft(db: SQLiteDatabase, id: number): Promise<(BirthdayDraft & { id: number }) | null> {
  const r = await db.getFirstAsync<BirthdayRow>('SELECT * FROM birthdays WHERE id = ?', id);
  if (!r) return null;
  const ideas = await db.getAllAsync<{ id: number; title: string }>(
    'SELECT id, title FROM gift_ideas WHERE birthday_id = ? AND bought = 0 ORDER BY created_at, id', id,
  );
  return { ...fromRow(r), ideas };
}

const columns = (d: BirthdayDraft) => [
  d.name.trim(), d.month, d.day, d.year, d.categoryId,
  d.remindD7 ? 1 : 0, d.remindD1 ? 1 : 0, d.remindD0 ? 1 : 0, d.remindTime,
  d.trackGifts ? 1 : 0, d.buyDays,
];

async function saveIdeas(db: SQLiteDatabase, birthdayId: number, ideas: BirthdayDraft['ideas']) {
  const keep = ideas.filter((i) => i.id).map((i) => i.id!);
  // Attention : « NOT IN (NULL) » ne garderait… ni ne supprimerait rien ; sans idée gardée, on supprime tout.
  await db.runAsync(
    `DELETE FROM gift_ideas WHERE birthday_id = ? AND bought = 0${keep.length ? ` AND id NOT IN (${keep.map(() => '?').join(',')})` : ''}`,
    birthdayId, ...keep,
  );
  for (const i of ideas) {
    if (i.id) await db.runAsync('UPDATE gift_ideas SET title = ? WHERE id = ?', i.title.trim(), i.id);
    else await addIdea(db, birthdayId, i.title);
  }
}

export async function createBirthday(db: SQLiteDatabase, d: BirthdayDraft) {
  let id = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO birthdays (name, month, day, year, category_id, remind_d7, remind_d1, remind_d0, remind_time,
                              track_gifts, buy_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...columns(d),
    );
    id = res.lastInsertRowId;
    await saveIdeas(db, id, d.ideas);
  });
  return id;
}

export async function updateBirthday(db: SQLiteDatabase, id: number, d: BirthdayDraft) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE birthdays SET name = ?, month = ?, day = ?, year = ?, category_id = ?, remind_d7 = ?, remind_d1 = ?,
                            remind_d0 = ?, remind_time = ?, track_gifts = ?, buy_days = ?
        WHERE id = ?`,
      ...columns(d), id,
    );
    await saveIdeas(db, id, d.ideas);
  });
}

export async function deleteBirthday(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM gift_ideas WHERE birthday_id = ?', id);
    await db.runAsync('DELETE FROM gifts_given WHERE birthday_id = ?', id);
    await db.runAsync('DELETE FROM birthdays WHERE id = ?', id);
  });
}

/* ——— Cadeaux ——— */

export async function addIdea(db: SQLiteDatabase, birthdayId: number, title: string, priceCents: number | null = null) {
  if (!title.trim()) return;
  await db.runAsync(
    'INSERT INTO gift_ideas (birthday_id, title, price_cents, created_at) VALUES (?, ?, ?, ?)',
    birthdayId, title.trim(), priceCents, nowStamp(),
  );
}

export async function updateIdea(db: SQLiteDatabase, id: number, title: string, priceCents: number | null) {
  await db.runAsync('UPDATE gift_ideas SET title = ?, price_cents = ? WHERE id = ?', title.trim(), priceCents, id);
}

export async function deleteIdea(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    const i = await db.getFirstAsync<{ given_id: number | null }>('SELECT given_id FROM gift_ideas WHERE id = ?', id);
    await db.runAsync('DELETE FROM gift_ideas WHERE id = ?', id);
    if (i?.given_id) await db.runAsync('DELETE FROM gifts_given WHERE id = ?', i.given_id);
  });
}

/**
 * « Offert » : l'idée passe dans « Déjà offert » pour l'année de cet anniversaire.
 * Retoucher le bouton défait l'opération.
 */
export async function setIdeaGiven(db: SQLiteDatabase, ideaId: number, year: number, given: boolean) {
  await db.withTransactionAsync(async () => {
    const i = await db.getFirstAsync<{ birthday_id: number; title: string; price_cents: number | null; given_id: number | null }>(
      'SELECT birthday_id, title, price_cents, given_id FROM gift_ideas WHERE id = ?', ideaId,
    );
    if (!i) return;
    if (given && !i.given_id) {
      const res = await db.runAsync(
        'INSERT INTO gifts_given (birthday_id, year, title, price_cents) VALUES (?, ?, ?, ?)',
        i.birthday_id, year, i.title, i.price_cents,
      );
      await db.runAsync('UPDATE gift_ideas SET bought = 1, given_id = ? WHERE id = ?', res.lastInsertRowId, ideaId);
    } else if (!given && i.given_id) {
      await db.runAsync('UPDATE gift_ideas SET bought = 0, given_id = NULL WHERE id = ?', ideaId);
      await db.runAsync('DELETE FROM gifts_given WHERE id = ?', i.given_id);
    }
  });
}

export async function addGiven(db: SQLiteDatabase, birthdayId: number, year: number, title: string, priceCents: number | null) {
  await db.runAsync(
    'INSERT INTO gifts_given (birthday_id, year, title, price_cents) VALUES (?, ?, ?, ?)',
    birthdayId, year, title.trim(), priceCents,
  );
}

export async function updateGiven(db: SQLiteDatabase, id: number, year: number, title: string, priceCents: number | null) {
  await db.runAsync('UPDATE gifts_given SET year = ?, title = ?, price_cents = ? WHERE id = ?', year, title.trim(), priceCents, id);
}

export async function deleteGiven(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    // Une idée marquée « offert » redevient une idée.
    await db.runAsync('UPDATE gift_ideas SET bought = 0, given_id = NULL WHERE given_id = ?', id);
    await db.runAsync('DELETE FROM gifts_given WHERE id = ?', id);
  });
}

/** Couleur d'un anniversaire : celle de sa catégorie, sinon le rouge « anniversaire ». */
export const colorOf = (b: { category: Cat | null }) => b.category?.color ?? categoryColors.birthday;
