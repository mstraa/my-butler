import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useDbVersion } from '@/db/use-query';
import { useSplashDone } from '@/lib/splash-state';
import { listenNotificationTaps, syncNotifications } from '@/lib/notifications';

/**
 * Tient les notifications à jour : replanifie tout après chaque écriture en base (regroupée sur
 * 1,5 s) et à chaque retour dans l'app (le jour a pu changer). Ouvre l'écran lié au toucher.
 * Attend la fin du splash : la demande d'autorisation met l'app en pause, pas pendant l'animation.
 */
export function NotificationSync() {
  const db = useSQLiteContext();
  const version = useDbVersion();
  const [resumed, setResumed] = useState(0);
  const ready = useSplashDone();

  useEffect(() => (ready ? listenNotificationTaps() : undefined), [ready]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setResumed((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => syncNotifications(db), 1500);
    return () => clearTimeout(t);
  }, [db, version, resumed, ready]);

  return null;
}
