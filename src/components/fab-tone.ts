import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Teinte du bouton « + » (maquettes) : clair sur fond noir, sombre quand l'écran
 * affiche une feuille blanche derrière (vue Jour).
 */
export type FabTone = 'light' | 'dark';

let tone: FabTone = 'light';
const listeners = new Set<() => void>();
const setTone = (t: FabTone) => {
  if (t === tone) return;
  tone = t;
  listeners.forEach((l) => l());
};

export function useFabTone() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tone,
  );
}

/** À appeler dans un écran à fond clair : le bouton devient sombre tant que l'écran est affiché. */
export function useDarkFab(active = true) {
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      setTone('dark');
      return () => setTone('light');
    }, [active]),
  );
}
