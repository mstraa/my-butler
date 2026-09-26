/** Contenu de « Ma journée » pour la mise en page native (voir DayNotifier.kt). */
export type DayPayload = {
  day: string;
  /** « 3 rdv aujourd'hui » ; la partie retard va dans `titleAccent` (en orange). */
  title: string;
  titleAccent?: string;
  /** Deuxième ligne repliée : « Prochain : 09:30 Point équipe ». */
  next: string;
  birthdays: { lead: string; text: string }[];
  rdvLabel: string;
  rdv: { time: string; title: string; color: string; highlight: boolean }[];
  lateLabel: string;
  late: { title: string; when: string; rdv: boolean }[];
};
