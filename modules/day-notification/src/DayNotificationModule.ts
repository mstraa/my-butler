import { requireOptionalNativeModule } from 'expo';

type DayNotificationNative = {
  show(json: string): void;
  /** Liste JSON de `DayUpdate` : chacune remplace la notification à son heure (la première peut être tout de suite). */
  plan(json: string): void;
  cancel(): void;
};

/** Absent hors build natif de l'app (Expo Go, web) : on retombe alors sur une notification texte. */
export default requireOptionalNativeModule<DayNotificationNative>('DayNotification');
