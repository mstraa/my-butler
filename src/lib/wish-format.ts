import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import type { IconName } from '@/components/icon';
import type { WishLevel, WishSource, WishState } from '@/db/wishes';
import { dayOf, parseDay, type Stamp } from '@/lib/dates';

export const LEVELS: { value: WishLevel; label: string; dots: number }[] = [
  { value: 'bof', label: 'Bof', dots: 1 },
  { value: 'envie', label: 'Envie', dots: 2 },
  { value: 'besoin', label: 'Besoin', dots: 3 },
];

export const SOURCES: Record<WishSource, { label: string; icon: IconName }> = {
  lien: { label: 'lien', icon: 'link' },
  screen: { label: 'capture', icon: 'phone' },
  photo: { label: 'photo', icon: 'camera' },
};

export const STATES: { value: WishState; label: string; empty: string }[] = [
  { value: 'waiting', label: 'En attente', empty: 'Aucune envie en attente' },
  { value: 'bought', label: 'Achetées', empty: 'Aucune envie achetée' },
  { value: 'abandoned', label: 'Abandonnées', empty: 'Aucune envie abandonnée' },
];

/** « en attente », « achetée(s) », « abandonnée(s) » selon le nombre. */
export function stateWord(state: WishState, n: number) {
  if (state === 'waiting') return 'en attente';
  const s = n > 1 ? 's' : '';
  return state === 'bought' ? `achetée${s}` : `abandonnée${s}`;
}

/** 1240 € → « 1 240 » (espace fine insécable pour les milliers) ; les centimes seulement s'il y en a. */
export function euros(cents: number) {
  const whole = Math.floor(Math.abs(cents) / 100);
  const int = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const rest = Math.abs(cents) % 100;
  return `${cents < 0 ? '−' : ''}${int}${rest ? `,${String(rest).padStart(2, '0')}` : ''}`;
}

/** « depuis le 12 août · 44 j ». */
export function sinceLabel(createdAt: Stamp, days: number) {
  if (days === 0) return "depuis aujourd'hui";
  if (days === 1) return 'depuis hier · 1 j';
  return `depuis le ${format(parseDay(dayOf(createdAt)), 'd MMM', { locale: fr })} · ${days} j`;
}

export const shortDate = (s: Stamp) => format(parseDay(dayOf(s)), 'd MMM yyyy', { locale: fr });
