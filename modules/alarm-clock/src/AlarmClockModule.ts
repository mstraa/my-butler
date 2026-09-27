import { requireOptionalNativeModule } from 'expo';

type AlarmClockNative = {
  /** Remplace toutes les alarmes planifiées (JSON d'un tableau d'AlarmSpec). Les « répéter » en cours sont gardés. */
  setAlarms(json: string): void;
  /** Développement : une alarme dans `seconds` secondes. */
  test(seconds: number, title: string, body: string): void;
  /** Android 14+ : l'app a le droit d'afficher l'écran plein de l'alarme sur l'écran verrouillé. */
  canUseFullScreen(): boolean;
  /** Ouvre le réglage système « Notifications en plein écran » de l'app. */
  openFullScreenSettings(): void;
};

/** Absent hors build natif de l'app (Expo Go, iOS, web) : les alarmes deviennent alors des notifications. */
export default requireOptionalNativeModule<AlarmClockNative>('AlarmClock');
