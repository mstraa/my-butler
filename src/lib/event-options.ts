import type { Recurrence } from '@/db/agenda';

/** Choix proposés pour le rappel et la répétition d'un rendez-vous. */
export const REMINDERS: { value: number | null; label: string }[] = [
  { value: null, label: 'Aucun' },
  { value: 0, label: "À l'heure" },
  { value: 5, label: '5 min avant' },
  { value: 15, label: '15 min avant' },
  { value: 30, label: '30 min avant' },
  { value: 60, label: '1 h avant' },
  { value: 120, label: '2 h avant' },
  { value: 1440, label: '1 jour avant' },
];

export const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: 'none', label: 'Jamais' },
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
  { value: 'yearly', label: 'Chaque année' },
];
