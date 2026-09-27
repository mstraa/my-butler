import { addMonths, addWeeks, addYears } from 'date-fns';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { IconName } from '@/components/icon';
import { type DayKey, dayKey, nowStamp, parseDay, todayKey } from '@/lib/dates';
import { colors } from '@/theme/tokens';

/*
 * Dépenses récurrentes (abonnements, prêt immobilier, loyer…) : un modèle avec une fréquence.
 * Chaque échéance arrivée devient une vraie dépense (expenses.recurring_id), ce qui la fait entrer
 * dans les totaux, la répartition et l'historique comme une autre. Supprimer une échéance ne la
 * recrée pas : on compte les échéances déjà ajoutées (generated) plutôt que de chercher les manques.
 */

export type Frequency = 'week' | 'month' | 'year';

export const FREQUENCIES: { value: Frequency; label: string; short: string }[] = [
  { value: 'month', label: 'Chaque mois', short: '/mois' },
  { value: 'year', label: 'Chaque année', short: '/an' },
  { value: 'week', label: 'Chaque semaine', short: '/sem.' },
];

export const frequencyLabel = (f: Frequency) => FREQUENCIES.find((x) => x.value === f)?.label ?? 'Chaque mois';

/**
 * n-ième échéance (0 = la première). Calculée depuis le départ et non de proche en proche :
 * un prélèvement le 31 tombe le 30 avril, le 28 février, puis de nouveau le 31 mai.
 */
export function occurrence(startsOn: DayKey, frequency: Frequency, n: number): DayKey {
  const d = parseDay(startsOn);
  return dayKey(frequency === 'week' ? addWeeks(d, n) : frequency === 'year' ? addYears(d, n) : addMonths(d, n));
}

/** Montant ramené au mois (pour le total des récurrentes). */
export function monthlyCents(cents: number, frequency: Frequency) {
  return frequency === 'year' ? cents / 12 : frequency === 'week' ? (cents * 52) / 12 : cents;
}

let syncing: Promise<number> | null = null;

/**
 * Ajoute aux dépenses les échéances arrivées (jusqu'à aujourd'hui compris). Appelée avant de lire
 * les dépenses ; les appels simultanés partagent la même passe. Renvoie le nombre d'ajouts.
 */
export function syncRecurring(db: SQLiteDatabase, today: DayKey = todayKey()): Promise<number> {
  syncing ??= run(db, today).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function run(db: SQLiteDatabase, today: DayKey) {
  const rows = await db.getAllAsync<{
    id: number; amount_cents: number; label: string; category_id: number | null;
    frequency: Frequency; starts_on: DayKey; ends_on: DayKey | null; generated: number;
  }>('SELECT id, amount_cents, label, category_id, frequency, starts_on, ends_on, generated FROM recurring_expenses');
  let added = 0;
  for (const r of rows) {
    let n = r.generated;
    const due: DayKey[] = [];
    for (;;) {
      const day = occurrence(r.starts_on, r.frequency, n);
      if (day > today || (r.ends_on && day > r.ends_on)) break;
      due.push(day);
      n += 1;
    }
    if (!due.length) continue;
    await db.withTransactionAsync(async () => {
      for (const day of due) {
        // OR IGNORE : filet de sécurité si l'échéance est déjà là (index unique).
        await db.runAsync(
          'INSERT OR IGNORE INTO expenses (amount_cents, label, category_id, spent_at, recurring_id) VALUES (?, ?, ?, ?, ?)',
          r.amount_cents, r.label, r.category_id, `${day}T00:00`, r.id,
        );
      }
      await db.runAsync('UPDATE recurring_expenses SET generated = ? WHERE id = ?', n, r.id);
    });
    added += due.length;
  }
  return added;
}

export type RecurringDraft = {
  amountCents: number;
  label: string;
  categoryId: number | null;
  frequency: Frequency;
  startsOn: DayKey;
  endsOn: DayKey | null;
};

export type RecurringExpense = RecurringDraft & {
  id: number;
  category: string | null;
  color: string;
  icon: IconName;
  /** Prochaine échéance, ou null si la récurrence est terminée. */
  nextOn: DayKey | null;
};

type Row = {
  id: number; amount_cents: number; label: string; category_id: number | null; frequency: Frequency;
  starts_on: DayKey; ends_on: DayKey | null; generated: number; name: string | null; color: string | null; icon: string | null;
};

const toRecurring = (r: Row): RecurringExpense => {
  const next = occurrence(r.starts_on, r.frequency, r.generated);
  return {
    id: r.id,
    amountCents: r.amount_cents,
    label: r.label,
    categoryId: r.category_id,
    frequency: r.frequency,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    category: r.name,
    color: r.color ?? colors.textTertiary,
    icon: (r.icon as IconName) || 'wallet',
    nextOn: r.ends_on && next > r.ends_on ? null : next,
  };
};

const SELECT = `SELECT r.id, r.amount_cents, r.label, r.category_id, r.frequency, r.starts_on, r.ends_on, r.generated,
                       c.name, c.color, c.icon
                  FROM recurring_expenses r LEFT JOIN categories c ON c.id = r.category_id`;

/** Récurrences, les en cours d'abord (par prochaine échéance), puis les terminées. */
export async function listRecurring(db: SQLiteDatabase): Promise<RecurringExpense[]> {
  await syncRecurring(db);
  const rows = await db.getAllAsync<Row>(SELECT);
  return rows.map(toRecurring).sort((a, b) => {
    if (!a.nextOn || !b.nextOn) return a.nextOn ? -1 : b.nextOn ? 1 : a.label.localeCompare(b.label);
    return a.nextOn.localeCompare(b.nextOn);
  });
}

export async function getRecurring(db: SQLiteDatabase, id: number): Promise<RecurringExpense | null> {
  const row = await db.getFirstAsync<Row>(`${SELECT} WHERE r.id = ?`, id);
  return row ? toRecurring(row) : null;
}

/** Crée la récurrence ; les échéances déjà arrivées (dont aujourd'hui) sont ajoutées aussitôt. */
export async function addRecurring(db: SQLiteDatabase, d: RecurringDraft) {
  const res = await db.runAsync(
    `INSERT INTO recurring_expenses (amount_cents, label, category_id, frequency, starts_on, ends_on, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    d.amountCents, d.label.trim(), d.categoryId, d.frequency, d.startsOn, d.endsOn, nowStamp(),
  );
  await syncRecurring(db);
  return res.lastInsertRowId;
}

/**
 * Modifie montant, libellé, catégorie et fin pour les prochaines échéances ; celles déjà passées
 * gardent leur montant (ex. un taux de prêt qui change). Le départ et la fréquence sont fixes.
 */
export async function updateRecurring(db: SQLiteDatabase, id: number, d: Pick<RecurringDraft, 'amountCents' | 'label' | 'categoryId' | 'endsOn'>) {
  await db.runAsync(
    'UPDATE recurring_expenses SET amount_cents = ?, label = ?, category_id = ?, ends_on = ? WHERE id = ?',
    d.amountCents, d.label.trim(), d.categoryId, d.endsOn, id,
  );
  await syncRecurring(db);
}

/** Arrête la récurrence : plus d'échéances, celles déjà passées restent dans les dépenses. */
export async function deleteRecurring(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE expenses SET recurring_id = NULL WHERE recurring_id = ?', id);
    await db.runAsync('DELETE FROM recurring_expenses WHERE id = ?', id);
  });
}
