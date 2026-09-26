import { router } from 'expo-router';

import { DateTimeSheet } from '@/components/form/date-time-sheet';
import { todayKey } from '@/lib/dates';
import { setTrackingDay, useTrackingDay } from '@/lib/tracking-view';

/** Choix du jour affiché dans l'onglet Suivi (pas de jour futur). */
export default function TrackingDaySheet() {
  const day = useTrackingDay();
  return (
    <DateTimeSheet
      visible
      title="Jour affiché"
      allDay
      value={{ day, start: '00:00', end: null }}
      onDone={({ day: d }) => setTrackingDay(d > todayKey() ? todayKey() : d)}
      onClose={() => router.back()}
    />
  );
}
