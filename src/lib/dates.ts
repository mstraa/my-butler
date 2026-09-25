import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, getISOWeek, parse, startOfWeek } from 'date-fns';
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

/* ——— Périodes (vues Jour / Semaine / Mois) ——— */

/** Lundi de la semaine qui contient ce jour. */
export const weekStart = (k: DayKey) => dayKey(startOfWeek(parseDay(k), { weekStartsOn: 1 }));
export const isoWeek = (k: DayKey) => getISOWeek(parseDay(k));
export const monthStart = (k: DayKey) => `${k.slice(0, 8)}01`;
export const shiftMonth = (k: DayKey, n: number) => dayKey(addMonths(parseDay(k), n));

/** Les 7 jours de la semaine de ce jour, du lundi au dimanche. */
export const weekDays = (k: DayKey) => Array.from({ length: 7 }, (_, i) => shiftDay(weekStart(k), i));

/** Grille du mois : semaines complètes du lundi au dimanche. */
export function monthGrid(k: DayKey): DayKey[] {
  const first = monthStart(k);
  const last = dayKey(endOfMonth(parseDay(first)));
  const out: DayKey[] = [];
  for (let d = weekStart(first); d <= last || out.length % 7 !== 0; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/** 'Vendredi 25' */
export const longDayTitle = (k: DayKey) => cap(format(parseDay(k), 'EEEE d', { locale: fr }));
/** 'lun.' */
export const weekdayShort = (k: DayKey) => format(parseDay(k), 'EEE', { locale: fr });
/** 'sam. 3 oct.' avec l'année si elle diffère de l'année en cours. */
export function dateFieldLabel(k: DayKey) {
  const sameYear = k.slice(0, 4) === todayKey().slice(0, 4);
  return format(parseDay(k), sameYear ? 'EEE d MMM' : 'EEE d MMM yyyy', { locale: fr });
}

/** '21 – 27 sept.' ou '29 sept. – 5 oct.' */
export function weekRangeLabel(k: DayKey) {
  const a = parseDay(weekStart(k));
  const b = addDays(a, 6);
  return a.getMonth() === b.getMonth()
    ? `${format(a, 'd', { locale: fr })} – ${format(b, 'd MMM', { locale: fr })}`
    : `${format(a, 'd MMM', { locale: fr })} – ${format(b, 'd MMM', { locale: fr })}`;
}

/** Minutes depuis minuit d'un 'HH:mm'. */
export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/* ——— Index absolus de périodes (carrousels) ——— */

const EPOCH_MONDAY = '1970-01-05';
/** Numéro de la semaine depuis 1970 (0 = semaine du lundi 5 janvier 1970). */
export const weekIndex = (k: DayKey) =>
  Math.round(differenceInCalendarDays(parseDay(weekStart(k)), parseDay(EPOCH_MONDAY)) / 7);
export const weekFromIndex = (i: number) => shiftDay(EPOCH_MONDAY, i * 7);
/** Numéro du mois (année × 12 + mois). */
export const monthIndex = (k: DayKey) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
export const monthFromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;
