import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useDbVersion } from '@/db/use-query';
import { listenNotificationTaps, syncNotifications } from '@/lib/notifications';

/**
 * Tient les notifications à jour : replanifie tout après chaque écriture en base (regroupée sur
 * 1,5 s) et à chaque retour dans l'app (le jour a pu changer). Ouvre l'écran lié au toucher.
 */
export function NotificationSync() {
  const db = useSQLiteContext();
  const version = useDbVersion();
  const [resumed, setResumed] = useState(0);

  useEffect(() => listenNotificationTaps(), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setResumed((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => syncNotifications(db), 1500);
    return () => clearTimeout(t);
  }, [db, version, resumed]);

  return null;
}
