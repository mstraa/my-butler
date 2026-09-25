import { useFocusEffect } from 'expo-router';
import { type SQLiteDatabase, useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';

/* Petit signal global : toute écriture appelle invalidate(), et les écrans visibles se rechargent. */
let version = 0;
const listeners = new Set<() => void>();
export function invalidate() {
  version += 1;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

/**
 * Lance une requête sur la base locale. Elle est relancée :
 * - à chaque retour sur l'écran,
 * - après chaque écriture (invalidate),
 * - quand `key` change (ex. le jour affiché).
 */
export function useDbQuery<T>(fn: (db: SQLiteDatabase) => Promise<T>, key = '') {
  const db = useSQLiteContext();
  const v = useSyncExternalStore(subscribe, getVersion);
  const [focusCount, setFocusCount] = useState(0);
  const [state, setState] = useState<{ data?: T; error: Error | null }>({ error: null });

  useFocusEffect(
    useCallback(() => {
      setFocusCount((n) => n + 1);
    }, []),
  );

  const load = useEffectEvent(() => fn(db));

  useEffect(() => {
    if (focusCount === 0) return; // attend le premier focus (évite un double chargement)
    let alive = true;
    load()
      .then((data) => alive && setState({ data, error: null }))
      .catch((e: unknown) => alive && setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)) })));
    return () => {
      alive = false;
    };
  }, [db, v, focusCount, key]);

  return state;
}

/** Exécute une écriture puis rafraîchit les écrans. */
export function useDbMutation() {
  const db = useSQLiteContext();
  return useCallback(
    async <R,>(fn: (db: SQLiteDatabase) => Promise<R>) => {
      const r = await fn(db);
      invalidate();
      return r;
    },
    [db],
  );
}
