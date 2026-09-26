import { OptionSheet } from '@/components/form/fields';
import { listExpenseMonths, monthOf } from '@/db/expenses';
import { useDbQuery } from '@/db/use-query';
import { todayKey } from '@/lib/dates';
import { monthLabel } from '@/lib/expense-format';
import { setExpenseView, useExpenseView } from '@/lib/expense-view';

/** Choix du mois affiché dans l'onglet Dépenses. */
export default function ExpenseMonthSheet() {
  const current = monthOf(todayKey());
  const { month } = useExpenseView();
  const { data } = useDbQuery((db) => listExpenseMonths(db, current));
  return (
    <OptionSheet
      asRoute
      title="Mois"
      options={(data ?? [current]).map((m) => ({ value: m, label: `${monthLabel(m)} ${m.slice(0, 4)}` }))}
      value={month}
      onPick={(m) => setExpenseView({ month: m, filter: 'all' })}
    />
  );
}
