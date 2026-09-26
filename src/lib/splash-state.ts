import { useSyncExternalStore } from 'react';

/**
 * Fin du splash animé, partagée hors des props : les enfants directs de <SQLiteProvider> ne sont
 * pas re-rendus quand le layout racine change d'état (le fournisseur est mémoïsé sans tenir compte
 * de `children`).
 */
let done = false;
const listeners = new Set<() => void>();

export function markSplashDone() {
  if (done) return;
  done = true;
  listeners.forEach((l) => l());
}

export function useSplashDone() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => done,
  );
}
