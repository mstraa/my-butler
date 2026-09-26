import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncHealth } from '@/db/health-sync';

/** Importe les pas et le sommeil de Health Connect au lancement et à chaque retour dans l'app. */
export function HealthSync() {
  const db = useSQLiteContext();

  useEffect(() => {
    syncHealth(db);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncHealth(db);
    });
    return () => sub.remove();
  }, [db]);

  return null;
}
