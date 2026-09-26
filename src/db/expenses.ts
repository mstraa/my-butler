import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/icon';
import type { Stamp } from '@/lib/dates';
import { colors } from '@/theme/tokens';

/** Mois 'YYYY-MM'. */
export type MonthKey = string;

export const monthOf = (s: string): MonthKey => s.slice(0, 7);

/** Mois précédent / suivant d'un 'YYYY-MM'. */
export function shiftMonthKey(m: MonthKey, n: number): MonthKey {
  const i = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export type Expense = {
  id: number;
  amountCents: number;
  label: string;
  spentAt: Stamp;
  categoryId: number | null;
  category: string | null;
  color: string;
  icon: IconName;
  taskId: number | null;
};

export type CategoryShare = { id: number | null; name: string; color: string; cents: number; share: number };

export type MonthSummary = {
  month: MonthKey;
  total: number;
  prevTotal: number;
  budget: number | null;
  /** Catégories du mois, de la plus grosse à la plus petite. */
  byCategory: CategoryShare[];
  expenses: Expense[];
};

type Row = {
  id: number; amount_cents: number; label: string; spent_at: Stamp; category_id: number | null;
  task_id: number | null; name: string | null; color: string | null; icon: string | null;
};

export async function getMonthSummary(db: SQLiteDatabase, month: MonthKey): Promise<MonthSummary> {
  const prev = shiftMonthKey(month, -1);
  const [rows, prevRow, budget] = await Promise.all([
    db.getAllAsync<Row>(
      `SELECT e.id, e.amount_cents, e.label, e.spent_at, e.category_id, e.task_id, c.name, c.color, c.icon
         FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
        WHERE substr(e.spent_at, 1, 7) = ?
        ORDER BY e.spent_at DESC, e.id DESC`,
      month,
    ),
    db.getFirstAsync<{ total: number | null }>(
      'SELECT SUM(amount_cents) AS total FROM expenses WHERE substr(spent_at, 1, 7) = ?', prev,
    ),
    db.getFirstAsync<{ amount_cents: number }>('SELECT amount_cents FROM budgets WHERE month = ?', month),
  ]);
  const expenses: Expense[] = rows.map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    label: r.label,
    spentAt: r.spent_at,
    categoryId: r.category_id,
    category: r.name,
    color: r.color ?? colors.textTertiary,
    icon: (r.icon as IconName) || 'wallet',
    taskId: r.task_id,
  }));
  const total = expenses.reduce((s, e) => s + e.amountCents, 0);
  const shares = new Map<number | null, CategoryShare>();
  for (const e of expenses) {
    const cur = shares.get(e.categoryId) ?? { id: e.categoryId, name: e.category ?? 'Sans catégorie', color: e.color, cents: 0, share: 0 };
    cur.cents += e.amountCents;
    shares.set(e.categoryId, cur);
  }
  const byCategory = [...shares.values()]
    .map((c) => ({ ...c, share: total ? c.cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents);
  return { month, total, prevTotal: prevRow?.total ?? 0, budget: budget?.amount_cents ?? null, byCategory, expenses };
}

/** Mois qui ont des dépenses, plus le mois courant, du plus récent au plus ancien. */
export async function listExpenseMonths(db: SQLiteDatabase, current: MonthKey): Promise<MonthKey[]> {
  const rows = await db.getAllAsync<{ m: string }>(
    'SELECT DISTINCT substr(spent_at, 1, 7) AS m FROM expenses ORDER BY m DESC',
  );
  const set = new Set([current, ...rows.map((r) => r.m)]);
  return [...set].sort().reverse();
}

export type ExpenseDraft = { amountCents: number; label: string; categoryId: number | null; spentAt: Stamp };

export async function addExpense(db: SQLiteDatabase, d: ExpenseDraft) {
  const res = await db.runAsync(
    'INSERT INTO expenses (amount_cents, label, category_id, spent_at) VALUES (?, ?, ?, ?)',
    d.amountCents, d.label.trim(), d.categoryId, d.spentAt,
  );
  return res.lastInsertRowId;
}

export async function updateExpense(db: SQLiteDatabase, id: number, d: ExpenseDraft) {
  await db.runAsync(
    'UPDATE expenses SET amount_cents = ?, label = ?, category_id = ?, spent_at = ? WHERE id = ?',
    d.amountCents, d.label.trim(), d.categoryId, d.spentAt, id,
  );
}

export async function deleteExpense(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', id);
}

/** Budget du mois ; null le retire. */
export async function setBudget(db: SQLiteDatabase, month: MonthKey, cents: number | null) {
  if (cents === null) await db.runAsync('DELETE FROM budgets WHERE month = ?', month);
  else {
    await db.runAsync(
      'INSERT INTO budgets (month, amount_cents) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET amount_cents = excluded.amount_cents',
      month, cents,
    );
  }
}

export type ExpenseTask = { id: number; title: string; estimateCents: number | null; categoryId: number | null; color: string };

/** Tâches à dépense suivie encore ouvertes (pour « Tâche faite »). */
export async function listExpenseTasks(db: SQLiteDatabase): Promise<ExpenseTask[]> {
  const rows = await db.getAllAsync<{ id: number; title: string; estimate_cents: number | null; category_id: number | null; color: string | null }>(
    `SELECT t.id, t.title, t.estimate_cents, t.category_id, c.color
       FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.tracks_expense = 1 AND t.state = 'open'
      ORDER BY COALESCE(t.due_at, t.day), t.id`,
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, estimateCents: r.estimate_cents, categoryId: r.category_id,
    color: r.color ?? colors.textTertiary,
  }));
}

/* ——— Montants ——— */

/** 41260 → « 412,60 » ; `euro` ajoute « € ». */
export function formatCents(cents: number, { euro = true, sign = false } = {}) {
  const abs = Math.abs(cents);
  const [int, dec] = (abs / 100).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign ? '−' : ''}${grouped},${dec}${euro ? ' €' : ''}`;
}

/**
 * Calcule une saisie du pavé (« 12,5+3×2 ») en centimes, avec les priorités × ÷ avant + −.
 * Un opérateur ou une virgule en fin de saisie est ignoré. Résultat négatif ou illisible → 0.
 */
export function evalAmount(expr: string): number {
  let s = expr.replace(/,/g, '.');
  while (s && '+−×÷.'.includes(s[s.length - 1])) s = s.slice(0, -1);
  if (!s) return 0;
  const tokens = s.match(/\d+(?:\.\d*)?|[+−×÷]/g);
  if (!tokens || tokens.join('') !== s) return 0;
  // Termes séparés par + et − ; chaque terme = produit / quotient de nombres.
  let total = 0;
  let sign = 1;
  let term: number | null = null;
  let op: '×' | '÷' | null = null;
  for (const t of tokens) {
    if (t === '+' || t === '−') {
      total += sign * (term ?? 0);
      sign = t === '+' ? 1 : -1;
      term = null;
    } else if (t === '×' || t === '÷') {
      op = t;
    } else {
      const n = Number(t);
      if (term === null) term = n;
      else if (op === '×') term *= n;
      else if (op === '÷') term = n === 0 ? NaN : term / n;
      op = null;
    }
  }
  total += sign * (term ?? 0);
  return Number.isFinite(total) && total > 0 ? Math.round(total * 100) : 0;
}
