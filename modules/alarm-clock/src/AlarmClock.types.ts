/** Condition lue dans Health Connect au moment de sonner : déjà atteinte, l'alarme se tait. */
export type AlarmHealthCheck = { metric: 'steps'; goal: number } | { metric: 'sleep' };

/** Une alarme planifiée (voir AlarmScheduler.kt). */
export type AlarmSpec = {
  id: string;
  /** Instant de la sonnerie, en ms. */
  at: number;
  title: string;
  body: string;
  /** Lien profond ouvert par « Ouvrir » (ex. mypersonallife://rdv/apercu/3). */
  link: string;
  health?: AlarmHealthCheck;
};
