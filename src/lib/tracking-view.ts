import { useSyncExternalStore } from 'react';

import { todayKey } from '@/lib/dates';

/**
 * Jour affiché dans l'onglet Suivi. Les feuilles de choix sont des écrans à part
 * (au-dessus de la barre d'onglets), d'où ce petit état partagé.
 */
let day: string | null = null; // null = aujourd'hui (suit le changement de date)
const listeners = new Set<() => void>();

export function setTrackingDay(d: string | null) {
  day = d === todayKey() ? null : d;
  listeners.forEach((l) => l());
}

export function useTrackingDay() {
  const d = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => day,
  );
  return d ?? todayKey();
}
