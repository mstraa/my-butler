import { useSyncExternalStore } from 'react';

import { type DayKey, todayKey } from '@/lib/dates';

/**
 * Jour affiché dans l'onglet Repas (sa semaine est la semaine affichée). Les feuilles
 * (ajout, copie, courses) sont des écrans à part, d'où ce petit état partagé.
 */
let day: DayKey | null = null; // null = aujourd'hui (suit le changement de date)
const listeners = new Set<() => void>();

export function setMealDay(d: DayKey | null) {
  day = d === todayKey() ? null : d;
  listeners.forEach((l) => l());
}

export const getMealDay = () => day ?? todayKey();

export function useMealDay() {
  const d = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => day,
  );
  return d ?? todayKey();
}

/** Aliment tout juste créé depuis l'écran d'ajout : celui-ci l'ouvre à son retour. */
let pendingFood: number | null = null;
export const setPendingFood = (id: number | null) => {
  pendingFood = id;
};
export function takePendingFood() {
  const id = pendingFood;
  pendingFood = null;
  return id;
}
