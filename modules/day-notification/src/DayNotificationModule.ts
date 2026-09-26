import { requireOptionalNativeModule } from 'expo';

type DayNotificationNative = {
  show(json: string): void;
  schedule(json: string, atMs: number): void;
  cancel(): void;
};

/** Absent hors build natif de l'app (Expo Go, web) : on retombe alors sur une notification texte. */
export default requireOptionalNativeModule<DayNotificationNative>('DayNotification');
