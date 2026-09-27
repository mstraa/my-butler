import * as LocalAuthentication from 'expo-local-authentication';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * Verrou de l'onglet Dépenses : l'empreinte (ou le code du téléphone) est demandée à l'ouverture.
 * Il se referme quand on passe à un autre onglet ou quand l'app part en arrière-plan ;
 * les écrans ouverts depuis l'onglet (saisie, filtre, mois…) ne le referment pas.
 */
let unlocked = false;
let pending: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function setUnlocked(v: boolean) {
  if (v === unlocked) return;
  unlocked = v;
  listeners.forEach((l) => l());
}

export const lockExpenses = () => setUnlocked(false);

// « inactive » (iOS) est aussi l'état pendant l'invite Face ID : on ne referme qu'en arrière-plan.
AppState.addEventListener('change', (s) => s === 'background' && lockExpenses());

export function useExpensesUnlocked() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => unlocked,
  );
}

/** Demande l'empreinte. Sans empreinte ni code configurés sur le téléphone, l'onglet s'ouvre. */
export function unlockExpenses() {
  if (unlocked) return Promise.resolve(true);
  pending ??= (async () => {
    try {
      const secured =
        (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
      if (!secured) return true;
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Dépenses',
        promptSubtitle: 'Touche le capteur pour voir tes dépenses',
        cancelLabel: 'Annuler',
      });
      return res.success;
    } catch {
      return false;
    }
  })().then((ok) => {
    pending = null;
    if (ok) setUnlocked(true);
    return ok;
  });
  return pending;
}
