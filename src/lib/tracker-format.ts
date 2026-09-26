import type { TrackerKind } from '@/db/tracking';

/* Affichage et saisie des valeurs de suivi (voir src/db/tracking.ts pour les échelles). */

const pad = (n: number) => String(n).padStart(2, '0');

/** Le sommeil s'affiche comme une durée (la nuit). */
export const isDuration = (kind: TrackerKind) => kind === 'duration' || kind === 'sleep';

/** Nombre de décimales utiles d'un pas (0,5 → 1 ; 0,25 → 2 ; 10 → 0). */
export function decimalsOf(step: number) {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.min(2, s.length - i - 1);
}

/** 3.5 → « 3,5 » ; avec `decimals`, nombre fixe de décimales (3 → « 3,0 »). */
export function fmtNum(v: number, decimals?: number) {
  const s = decimals === undefined ? String(Math.round(v * 100) / 100) : v.toFixed(decimals);
  return s.replace('.', ',');
}

/** 445 → « 7 h 25 » ; 45 → « 45 min ». */
export function fmtDuration(min: number, unit = 'h') {
  const m = Math.round(min);
  if (unit === 'min' || m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${pad(m % 60)}` : `${h} h`;
}

/** Minutes depuis minuit → « 07:10 ». */
export function fmtClock(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

type Fmt = { kind: TrackerKind; unit: string; step: number };

/** Unité accordée : singulier jusqu'à 1 (« 0 café », « 1 café », « 2 cafés »). */
export function unitFor(n: number, unit: string) {
  if (Math.abs(n) > 1 || !/[^s]s$/.test(unit) || INVARIABLE.includes(unit)) return unit;
  return unit.slice(0, -1);
}
const INVARIABLE = ['fois', 'pas', 'ml', 'cl'];

/** Valeur avec son unité : « 7 h 25 », « 07:10 », « 3 cafés », « 3,5 ml ». */
export function fmtValue(t: Fmt, v: number) {
  if (isDuration(t.kind)) return fmtDuration(v, t.unit);
  if (t.kind === 'time') return fmtClock(v);
  const n = fmtNum(v, t.kind === 'volume' ? decimalsOf(t.step) : undefined);
  return t.unit ? `${n} ${unitFor(v, t.unit)}` : n;
}

/** Valeur sans unité, pour les petits graphiques. */
export function fmtShort(t: Fmt, v: number) {
  if (isDuration(t.kind)) return t.unit === 'min' ? String(Math.round(v)) : fmtDuration(v).replace(' h ', 'h').replace(' h', 'h');
  if (t.kind === 'time') return fmtClock(v);
  return fmtNum(v);
}

/** Libellé du pas : « 15 min », « 1 h », « 0,5 ml », « 1 café ». */
export function fmtStep(t: Fmt) {
  if (isDuration(t.kind) || t.kind === 'time') return t.step >= 60 && t.step % 60 === 0 ? `${t.step / 60} h` : `${t.step} min`;
  return t.unit ? `${fmtNum(t.step)} ${unitFor(t.step, t.unit)}` : fmtNum(t.step);
}

/** Valeur éditable dans le champ texte (sans unité). */
export function toDraft(t: Fmt, v: number) {
  if (isDuration(t.kind)) {
    if (t.unit === 'min') return String(Math.round(v));
    const m = Math.round(v);
    return m % 60 ? `${Math.floor(m / 60)}h${pad(m % 60)}` : `${m / 60}`;
  }
  if (t.kind === 'time') return fmtClock(v);
  return fmtNum(v, t.kind === 'volume' ? decimalsOf(t.step) : undefined);
}

/**
 * Lit une saisie : « 7h25 », « 7:25 », « 7,5 » (en heures si l'unité est h), « 450 » ; « 07:10 » pour une heure.
 * Renvoie null si la saisie est vide ou illisible.
 */
export function parseDraft(t: Fmt, text: string): number | null {
  const s = text.trim().toLowerCase().replace(',', '.');
  if (!s) return null;
  if (isDuration(t.kind) || t.kind === 'time') {
    const m = s.match(/^(\d{1,2})\s*[h:]\s*(\d{0,2})$/);
    if (m) {
      const v = Number(m[1]) * 60 + Number(m[2] || 0);
      return t.kind === 'time' ? v % 1440 : v;
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    if (t.kind === 'time') return Math.round(n * 60) % 1440; // « 7 » → 07:00
    return Math.round(t.unit === 'min' ? n : n * 60);
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

/** Clavier adapté à la saisie. */
export const keyboardFor = (kind: TrackerKind) => (kind === 'quantity' || kind === 'volume' ? 'decimal-pad' : 'numbers-and-punctuation');

/**
 * Moyenne d'heures de la journée sur un cercle de 24 h : 23:30 et 00:30 donnent 00:00, pas 12:00.
 */
export function circularMean(values: number[]) {
  let x = 0;
  let y = 0;
  for (const v of values) {
    const a = (v / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  const a = Math.atan2(y, x);
  return ((((a / (2 * Math.PI)) * 1440) % 1440) + 1440) % 1440;
}

/** Écart signé (en minutes) d'une heure par rapport à une référence, dans ]−12 h, 12 h]. */
export function clockOffset(v: number, ref: number) {
  let d = (v - ref) % 1440;
  if (d > 720) d -= 1440;
  if (d <= -720) d += 1440;
  return d;
}
