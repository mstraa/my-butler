import * as LocalAuthentication from 'expo-local-authentication';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

/**
 * Verrou de l'onglet Dépenses : l'empreinte (ou le code du téléphone) est demandée à l'ouverture.
 * Une fois déverrouillé, il le reste au moins 5 minutes, même si l'on change d'onglet ou d'app.
 * Passé ce délai, il se referme quand on quitte l'onglet (autre onglet ou app en arrière-plan) ;
 * les écrans ouverts depuis l'onglet (saisie, filtre, mois…) ne le referment pas.
 * Le cadenas de l'écran le referme tout de suite.
 */
const GRACE_MS = 5 * 60_000;

let unlocked = false;
let unlockedAt = 0;
let inView = false; // l'onglet (ou un écran ouvert depuis lui) est affiché
let away = false; // quitté pendant le délai de grâce : à refermer quand il expire
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

const expired = () => Date.now() - unlockedAt >= GRACE_MS;

function setUnlocked(v: boolean) {
  clearTimeout(timer);
  away = false;
  if (v) unlockedAt = Date.now();
  if (v === unlocked) return;
  unlocked = v;
  listeners.forEach((l) => l());
}

/** Referme tout de suite (cadenas). */
export const lockExpenses = () => setUnlocked(false);

/** On quitte l'onglet : referme, sauf pendant le délai de grâce (referme alors à son expiration). */
function leave() {
  if (!unlocked || away) return;
  if (expired()) return lockExpenses();
  away = true;
  clearTimeout(timer);
  timer = setTimeout(lockExpenses, GRACE_MS - (Date.now() - unlockedAt));
}

/** On revient sur l'onglet : referme si le délai a expiré entre-temps (minuteur figé en arrière-plan). */
function comeBack() {
  if (!away) return;
  if (expired()) return lockExpenses();
  away = false;
  clearTimeout(timer);
}

/** Appelé par la barre d'onglets à chaque changement d'écran. */
export function setExpensesInView(v: boolean) {
  if (v === inView) return;
  inView = v;
  if (v) comeBack();
  else leave();
}

// « inactive » (iOS) est aussi l'état pendant l'invite Face ID : on ne compte que l'arrière-plan.
AppState.addEventListener('change', (s) => {
  if (s === 'background') {
    leave();
    // Une invite laissée ouverte en partant ne revient pas toujours : on l'abandonne pour en relancer une au retour.
    if (pending) {
      pending = null;
      LocalAuthentication.cancelAuthenticate().catch(() => {});
    }
  } else if (s === 'active') {
    if (inView) comeBack();
    else if (away && expired()) lockExpenses();
  }
});

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
  // Lancée en arrière-plan, l'invite ne s'affiche pas et la promesse ne se résout jamais,
  // ce qui bloquait ensuite le bouton « Déverrouiller ».
  if (AppState.currentState !== 'active') return Promise.resolve(false);
  if (pending) return pending;
  const p = (async () => {
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
    if (pending !== p) return false; // abandonnée entre-temps
    pending = null;
    if (ok) setUnlocked(true);
    return ok;
  });
  pending = p;
  return p;
}
