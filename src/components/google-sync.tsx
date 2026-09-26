import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { invalidate } from '@/db/use-query';
import { calendarSupported, syncGoogle } from '@/lib/google-calendar';

/** Relit Google Agenda à l'ouverture de l'app et à chaque retour dedans. */
export function GoogleSync() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (!calendarSupported) return;
    const run = () =>
      syncGoogle(db)
        .then((n) => n > 0 && invalidate())
        .catch((e) => console.warn('Synchro Google Agenda', e));
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [db]);

  return null;
}
