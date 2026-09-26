import { useSyncExternalStore } from 'react';

import { monthOf } from '@/db/expenses';
import { todayKey } from '@/lib/dates';

/**
 * Mois et filtre affichés dans l'onglet Dépenses. Les feuilles de choix sont des écrans à part
 * (au-dessus de la barre d'onglets), d'où ce petit état partagé.
 */
type View = { month: string; filter: number | 'all' };

let view: View = { month: monthOf(todayKey()), filter: 'all' };
const listeners = new Set<() => void>();

export function setExpenseView(patch: Partial<View>) {
  view = { ...view, ...patch };
  listeners.forEach((l) => l());
}

export const getExpenseView = () => view;

export function useExpenseView() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );
}
