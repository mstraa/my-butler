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
 * Dernier résultat connu par requête nommée. Quand un écran revient (changement de vue,
 * de période déjà vue…), il s'affiche tout de suite avec ces données au lieu d'un écran vide,
 * puis se met à jour : c'est ce qui évite le « clignotement ».
 */
const cache = new Map<string, unknown>();

type Options = {
  /** Nom de la requête pour le cache (ex. 'jour'). Sans nom, pas de cache. */
  cacheId?: string;
};

/**
 * Lance une requête sur la base locale. Elle est relancée :
 * - à chaque retour sur l'écran,
 * - après chaque écriture (invalidate),
 * - quand `key` change (ex. le jour affiché).
 */
export function useDbQuery<T>(fn: (db: SQLiteDatabase) => Promise<T>, key = '', { cacheId }: Options = {}) {
  const db = useSQLiteContext();
  const v = useSyncExternalStore(subscribe, getVersion);
  const cacheKey = cacheId ? `${cacheId}:${key}` : null;
  const [focusCount, setFocusCount] = useState(0);
  const [state, setState] = useState<{ data?: T; key: string; error: Error | null }>(() => ({
    data: cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined,
    key,
    error: null,
  }));

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
      .then((data) => {
        if (!alive) return;
        if (cacheKey) cache.set(cacheKey, data);
        setState({ data, key, error: null });
      })
      .catch((e: unknown) => alive && setState((s) => ({ ...s, error: e instanceof Error ? e : new Error(String(e)) })));
    return () => {
      alive = false;
    };
  }, [db, v, focusCount, key, cacheKey]);

  // Changement de clé : on montre le cache de la nouvelle clé s'il existe, sinon l'ancien résultat.
  const cached = cacheKey && state.key !== key ? (cache.get(cacheKey) as T | undefined) : undefined;
  return { data: cached ?? state.data, error: state.error, loadedKey: cached ? key : state.key };
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
