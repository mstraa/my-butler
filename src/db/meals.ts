import type { SQLiteDatabase } from 'expo-sqlite';

import { type DayKey, nowStamp, shiftDay, weekDays, weekStart } from '@/lib/dates';

/*
 * Repas de la semaine. Un aliment du catalogue décrit une portion (ex. « 80 g »),
 * ce qu'on achète (ex. « sachet 1 kg » = 12,5 portions) et les macros d'une portion.
 * Chaque repas (petit-déjeuner, déjeuner, en-cas, dîner) d'un jour liste des aliments
 * avec un nombre de portions ; la liste de courses en déduit les contenants à acheter.
 */

export type MealKey = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export const MEAL_KEYS: MealKey[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** « Manqué » et « Extérieur » ne sont que des étiquettes : les aliments prévus restent comptés. */
export type MealStatus = 'planned' | 'missed' | 'out';

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };
export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export type FoodDraft = {
  name: string;
  portionLabel: string;
  containerLabel: string;
  portionsPerContainer: number | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type Food = FoodDraft & { id: number; archived: boolean; uses: number };

export type MealItem = { id: number; day: DayKey; meal: MealKey; portions: number; food: Food; macros: Macros };

export type MealPlan = { meal: MealKey; status: MealStatus; items: MealItem[]; totals: Macros };
export type DayPlan = { day: DayKey; meals: Record<MealKey, MealPlan>; totals: Macros; count: number };
export type WeekPlan = { week: DayKey; days: DayPlan[] };

type FoodRow = {
  id: number; name: string; portion_label: string | null; container_label: string | null;
  portions_per_container: number | null; kcal: number | null; protein: number | null; carbs: number | null;
  fat: number | null; archived: number; uses?: number;
};

const toFood = (r: FoodRow): Food => ({
  id: r.id, name: r.name, portionLabel: r.portion_label ?? '', containerLabel: r.container_label ?? '',
  portionsPerContainer: r.portions_per_container, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat,
  archived: !!r.archived, uses: r.uses ?? 0,
});

/** Macros de `portions` portions d'un aliment (une macro non renseignée compte 0). */
export const foodMacros = (f: FoodDraft, portions: number): Macros => ({
  kcal: (f.kcal ?? 0) * portions,
  protein: (f.protein ?? 0) * portions,
  carbs: (f.carbs ?? 0) * portions,
  fat: (f.fat ?? 0) * portions,
});

export const addMacros = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat,
});

/* ——— Catalogue d'aliments ——— */

/** Aliments actifs, les plus utilisés d'abord. */
export async function listFoods(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<FoodRow>(
    `SELECT f.*, (SELECT COUNT(*) FROM meal_items mi WHERE mi.food_id = f.id) AS uses
     FROM foods f WHERE f.archived = 0 ORDER BY uses DESC, f.name COLLATE NOCASE`,
  );
  return rows.map(toFood);
}

export async function getFood(db: SQLiteDatabase, id: number) {
  const row = await db.getFirstAsync<FoodRow>('SELECT * FROM foods WHERE id = ?', id);
  return row ? toFood(row) : null;
}

const foodParams = (d: FoodDraft) => [
  d.name.trim(), d.portionLabel.trim() || null, d.containerLabel.trim() || null,
  d.portionsPerContainer, d.kcal, d.protein, d.carbs, d.fat,
];

export async function createFood(db: SQLiteDatabase, d: FoodDraft) {
  const res = await db.runAsync(
    `INSERT INTO foods (name, portion_label, container_label, portions_per_container, kcal, protein, carbs, fat, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...foodParams(d), nowStamp(),
  );
  return res.lastInsertRowId;
}

export async function updateFood(db: SQLiteDatabase, id: number, d: FoodDraft) {
  await db.runAsync(
    `UPDATE foods SET name = ?, portion_label = ?, container_label = ?, portions_per_container = ?,
     kcal = ?, protein = ?, carbs = ?, fat = ? WHERE id = ?`,
    ...foodParams(d), id,
  );
}

/** Un aliment déjà utilisé dans un repas est seulement retiré du catalogue (les anciens repas le gardent). */
export async function deleteFood(db: SQLiteDatabase, id: number) {
  const used = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM meal_items WHERE food_id = ?', id);
  if (used?.n) {
    await db.runAsync('UPDATE foods SET archived = 1 WHERE id = ?', id);
  } else {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM shopping_checks WHERE food_id = ?', id);
      await db.runAsync('DELETE FROM foods WHERE id = ?', id);
    });
  }
}

/* ——— Planning de la semaine ——— */

type ItemRow = FoodRow & { item_id: number; day: DayKey; meal: MealKey; portions: number };

export async function getWeekPlan(db: SQLiteDatabase, anyDay: DayKey): Promise<WeekPlan> {
  const week = weekStart(anyDay);
  const end = shiftDay(week, 6);
  const [rows, statuses] = await Promise.all([
    db.getAllAsync<ItemRow>(
      `SELECT mi.id AS item_id, mi.day, mi.meal, mi.portions, f.*
       FROM meal_items mi JOIN foods f ON f.id = mi.food_id
       WHERE mi.day BETWEEN ? AND ? ORDER BY mi.day, mi.sort, mi.id`,
      week, end,
    ),
    db.getAllAsync<{ day: DayKey; meal: MealKey; status: MealStatus }>(
      'SELECT * FROM meal_status WHERE day BETWEEN ? AND ?', week, end,
    ),
  ]);

  const days: DayPlan[] = weekDays(week).map((day) => {
    const meals = {} as Record<MealKey, MealPlan>;
    for (const m of MEAL_KEYS) meals[m] = { meal: m, status: 'planned', items: [], totals: ZERO_MACROS };
    return { day, meals, totals: ZERO_MACROS, count: 0 };
  });
  const byDay = new Map(days.map((d) => [d.day, d]));

  for (const r of rows) {
    const d = byDay.get(r.day);
    if (!d || !d.meals[r.meal]) continue;
    const food = toFood(r);
    const macros = foodMacros(food, r.portions);
    const plan = d.meals[r.meal];
    plan.items.push({ id: r.item_id, day: r.day, meal: r.meal, portions: r.portions, food, macros });
    plan.totals = addMacros(plan.totals, macros);
    d.totals = addMacros(d.totals, macros);
    d.count += 1;
  }
  for (const s of statuses) {
    const plan = byDay.get(s.day)?.meals[s.meal];
    if (plan) plan.status = s.status;
  }
  return { week, days };
}

export async function addMealItem(db: SQLiteDatabase, day: DayKey, meal: MealKey, foodId: number, portions: number) {
  await db.runAsync(
    `INSERT INTO meal_items (day, meal, food_id, portions, sort)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM meal_items WHERE day = ? AND meal = ?))`,
    day, meal, foodId, portions, day, meal,
  );
}

export async function getMealItem(db: SQLiteDatabase, id: number): Promise<MealItem | null> {
  const r = await db.getFirstAsync<ItemRow>(
    `SELECT mi.id AS item_id, mi.day, mi.meal, mi.portions, f.*
     FROM meal_items mi JOIN foods f ON f.id = mi.food_id WHERE mi.id = ?`,
    id,
  );
  if (!r) return null;
  const food = toFood(r);
  return { id: r.item_id, day: r.day, meal: r.meal, portions: r.portions, food, macros: foodMacros(food, r.portions) };
}

export async function updateMealItem(db: SQLiteDatabase, id: number, portions: number) {
  await db.runAsync('UPDATE meal_items SET portions = ? WHERE id = ?', portions, id);
}

export async function deleteMealItem(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM meal_items WHERE id = ?', id);
}

export async function setMealStatus(db: SQLiteDatabase, day: DayKey, meal: MealKey, status: MealStatus) {
  if (status === 'planned') {
    await db.runAsync('DELETE FROM meal_status WHERE day = ? AND meal = ?', day, meal);
  } else {
    await db.runAsync(
      'INSERT INTO meal_status (day, meal, status) VALUES (?, ?, ?) ON CONFLICT(day, meal) DO UPDATE SET status = excluded.status',
      day, meal, status,
    );
  }
}

/* ——— Copier / vider ——— */

/** Un repas précis, ou tout le jour quand `meal` est absent. */
export type Slot = { day: DayKey; meal?: MealKey };
export type CopyMode = 'replace' | 'append';

/** Nombre d'aliments déjà présents dans des repas (pour prévenir avant d'écraser). */
export async function countItems(db: SQLiteDatabase, slots: Slot[]) {
  let n = 0;
  for (const s of slots) {
    const row = s.meal
      ? await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM meal_items WHERE day = ? AND meal = ?', s.day, s.meal)
      : await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM meal_items WHERE day = ?', s.day);
    n += row?.n ?? 0;
  }
  return n;
}

async function clearSlotRaw(db: SQLiteDatabase, s: Slot) {
  if (s.meal) {
    await db.runAsync('DELETE FROM meal_items WHERE day = ? AND meal = ?', s.day, s.meal);
    await db.runAsync('DELETE FROM meal_status WHERE day = ? AND meal = ?', s.day, s.meal);
  } else {
    await db.runAsync('DELETE FROM meal_items WHERE day = ?', s.day);
    await db.runAsync('DELETE FROM meal_status WHERE day = ?', s.day);
  }
}

/**
 * Copie les aliments d'un repas (ou d'un jour entier) vers un autre. Les statuts
 * (manqué, extérieur) ne sont pas copiés. En ajout, les aliments se placent après ceux déjà là.
 */
async function copySlotRaw(db: SQLiteDatabase, from: Slot, to: Slot, mode: CopyMode) {
  if (from.day === to.day && from.meal === to.meal) return;
  if (mode === 'replace') await clearSlotRaw(db, to);
  const offset = `(SELECT COALESCE(MAX(t.sort), -1) + 1 FROM meal_items t WHERE t.day = ? AND t.meal = %MEAL%)`;
  if (from.meal && to.meal) {
    await db.runAsync(
      `INSERT INTO meal_items (day, meal, food_id, portions, sort)
       SELECT ?, ?, food_id, portions, sort + ${offset.replace('%MEAL%', '?')}
       FROM meal_items WHERE day = ? AND meal = ? ORDER BY sort, id`,
      to.day, to.meal, to.day, to.meal, from.day, from.meal,
    );
  } else {
    await db.runAsync(
      `INSERT INTO meal_items (day, meal, food_id, portions, sort)
       SELECT ?, meal, food_id, portions, sort + ${offset.replace('%MEAL%', 'meal_items.meal')}
       FROM meal_items WHERE day = ? ORDER BY meal, sort, id`,
      to.day, to.day, from.day,
    );
  }
}

export async function copySlot(db: SQLiteDatabase, from: Slot, to: Slot, mode: CopyMode) {
  await db.withTransactionAsync(() => copySlotRaw(db, from, to, mode));
}

/** Copie les 7 jours d'une semaine sur une autre (jour par jour : lundi → lundi…). */
export async function copyWeek(db: SQLiteDatabase, fromWeek: DayKey, toWeek: DayKey, mode: CopyMode) {
  const from = weekDays(fromWeek);
  const to = weekDays(toWeek);
  if (from[0] === to[0]) return;
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < 7; i++) await copySlotRaw(db, { day: from[i] }, { day: to[i] }, mode);
  });
}

export async function clearSlot(db: SQLiteDatabase, s: Slot) {
  await db.withTransactionAsync(() => clearSlotRaw(db, s));
}

export async function clearWeek(db: SQLiteDatabase, anyDay: DayKey) {
  await db.withTransactionAsync(async () => {
    for (const d of weekDays(anyDay)) await clearSlotRaw(db, { day: d });
  });
}

/** Derniers repas de ce type (ou de n'importe quel type) déjà remplis, pour les reprendre d'un geste. */
export async function recentMeals(db: SQLiteDatabase, meal: MealKey, exclude: Slot, limit = 12) {
  const slots = await db.getAllAsync<{ day: DayKey; meal: MealKey }>(
    `SELECT day, meal, MAX(id) AS last FROM meal_items
     WHERE NOT (day = ? AND meal = ?)
     GROUP BY day, meal ORDER BY (meal = ?) DESC, day DESC LIMIT ?`,
    exclude.day, exclude.meal ?? '', meal, limit,
  );
  const out: { day: DayKey; meal: MealKey; names: string[]; totals: Macros }[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    const rows = await db.getAllAsync<FoodRow & { portions: number }>(
      `SELECT mi.portions, f.* FROM meal_items mi JOIN foods f ON f.id = mi.food_id
       WHERE mi.day = ? AND mi.meal = ? ORDER BY mi.sort, mi.id`,
      s.day, s.meal,
    );
    // Même contenu qu'un repas déjà proposé : inutile de le montrer deux fois.
    const sig = rows.map((r) => `${r.id}x${r.portions}`).join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const totals = rows.reduce((acc, r) => addMacros(acc, foodMacros(toFood(r), r.portions)), ZERO_MACROS);
    out.push({ day: s.day, meal: s.meal, names: rows.map((r) => r.name), totals });
  }
  return out;
}

/* ——— Liste de courses ——— */

export type ShoppingLine = {
  food: Food;
  /** Portions prévues sur la semaine. */
  portions: number;
  /** Contenants à acheter (arrondi au-dessus) ; null si l'aliment n'a pas de contenant. */
  containers: number | null;
  /** Portions en trop dans le dernier contenant. */
  spare: number;
  checked: boolean;
};

export async function getShoppingList(db: SQLiteDatabase, anyDay: DayKey): Promise<ShoppingLine[]> {
  const week = weekStart(anyDay);
  const rows = await db.getAllAsync<FoodRow & { total: number; checked: number }>(
    `SELECT f.*, SUM(mi.portions) AS total,
       EXISTS (SELECT 1 FROM shopping_checks c WHERE c.week = ? AND c.food_id = f.id) AS checked
     FROM meal_items mi JOIN foods f ON f.id = mi.food_id
     WHERE mi.day BETWEEN ? AND ?
     GROUP BY f.id ORDER BY f.name COLLATE NOCASE`,
    week, week, shiftDay(week, 6),
  );
  return rows.map((r) => {
    const food = toFood(r);
    const per = food.portionsPerContainer;
    const containers = per && per > 0 ? Math.ceil(r.total / per - 1e-9) : null;
    return {
      food,
      portions: r.total,
      containers,
      spare: containers !== null && per ? containers * per - r.total : 0,
      checked: !!r.checked,
    };
  });
}

export async function setShoppingCheck(db: SQLiteDatabase, anyDay: DayKey, foodId: number, checked: boolean) {
  const week = weekStart(anyDay);
  if (checked) {
    await db.runAsync('INSERT OR IGNORE INTO shopping_checks (week, food_id) VALUES (?, ?)', week, foodId);
  } else {
    await db.runAsync('DELETE FROM shopping_checks WHERE week = ? AND food_id = ?', week, foodId);
  }
}

export async function clearShoppingChecks(db: SQLiteDatabase, anyDay: DayKey) {
  await db.runAsync('DELETE FROM shopping_checks WHERE week = ?', weekStart(anyDay));
}
