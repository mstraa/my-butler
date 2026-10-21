import { requireOptionalNativeModule } from 'expo';

import type { AlarmSound } from './AlarmClock.types';

type AlarmClockNative = {
  /** Remplace toutes les alarmes planifiées (JSON d'un tableau d'AlarmSpec). Les « répéter » en cours sont gardés. */
  setAlarms(json: string): void;
  /** Développement : une alarme dans `seconds` secondes. */
  test(seconds: number, title: string, body: string): void;
  /** Sonneries d'alarme du téléphone. */
  getSounds(): AlarmSound[];
  /** Sonnerie choisie pour les alarmes de l'app ; null : celle du réveil du téléphone. */
  getSound(): AlarmSound | null;
  setSound(uri: string | null): void;
  /** Fait écouter quelques secondes d'une sonnerie (null : celle du téléphone). */
  previewSound(uri: string | null): void;
  stopPreview(): void;
  /** Android 14+ : l'app a le droit d'afficher l'écran plein de l'alarme sur l'écran verrouillé. */
  canUseFullScreen(): boolean;
  /** Ouvre le réglage système « Notifications en plein écran » de l'app. */
  openFullScreenSettings(): void;
};

/** Absent hors build natif de l'app (Expo Go, iOS, web) : les alarmes deviennent alors des notifications. */
export default requireOptionalNativeModule<AlarmClockNative>('AlarmClock');
