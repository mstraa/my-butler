import { addDays, format, parse } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Convention de stockage : heure locale, sans fuseau.
 * - un jour     : 'YYYY-MM-DD'
 * - un instant  : 'YYYY-MM-DDTHH:mm'
 * Ces chaînes se comparent correctement dans l'ordre alphabétique (et en SQL).
 */
export type DayKey = string;
export type Stamp = string;

export const dayKey = (d: Date): DayKey => format(d, 'yyyy-MM-dd');
export const stamp = (d: Date): Stamp => format(d, "yyyy-MM-dd'T'HH:mm");
export const parseDay = (k: DayKey) => parse(k, 'yyyy-MM-dd', new Date());
export const parseStamp = (s: Stamp) => parse(s, "yyyy-MM-dd'T'HH:mm", new Date());

export const todayKey = () => dayKey(new Date());
export const nowStamp = () => stamp(new Date());
export const shiftDay = (k: DayKey, n: number) => dayKey(addDays(parseDay(k), n));

/** 'HH:mm' d'un instant stocké. */
export const timeOf = (s: Stamp | null | undefined) => (s ? s.slice(11, 16) : '');
export const dayOf = (s: Stamp) => s.slice(0, 10);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 'ven. 25' */
export const shortDayLabel = (k: DayKey) => format(parseDay(k), 'EEE d', { locale: fr });
/** 'ven. 25 sept.' */
export const mediumDayLabel = (k: DayKey) => format(parseDay(k), 'EEE d MMM', { locale: fr });
/** 'Septembre' */
export const monthName = (k: DayKey) => cap(format(parseDay(k), 'MMMM', { locale: fr }));
export const yearOf = (k: DayKey) => k.slice(0, 4);

/** 'hier', 'il y a 3 j', 'il y a 15 h' — pour les éléments en retard. */
export function lateSince(due: Stamp, now: Date = new Date()) {
  const ms = now.getTime() - parseStamp(due).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "il y a moins d'1 h";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'depuis hier' : `il y a ${d} j`;
}
