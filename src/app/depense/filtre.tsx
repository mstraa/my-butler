import { OptionSheet } from '@/components/form/fields';
import { formatCents, getMonthSummary } from '@/db/expenses';
import { useDbQuery } from '@/db/use-query';
import { setExpenseView, useExpenseView } from '@/lib/expense-view';

/** Filtre de l'historique par catégorie (catégories du mois affiché). */
export default function ExpenseFilterSheet() {
  const { month, filter } = useExpenseView();
  const { data } = useDbQuery((db) => getMonthSummary(db, month), month);
  return (
    <OptionSheet
      asRoute
      title="Catégorie"
      options={[
        { value: 'all' as const, label: 'Toutes' },
        ...(data?.byCategory ?? []).map((c) => ({ value: c.id ?? -1, label: `${c.name} · ${formatCents(c.cents)}` })),
      ]}
      value={filter}
      onPick={(f) => setExpenseView({ filter: f })}
    />
  );
}
