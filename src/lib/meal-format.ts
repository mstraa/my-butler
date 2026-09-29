import type { IconName } from '@/components/icon';
import type { Food, Macros, MealKey, MealStatus } from '@/db/meals';

/** `to` / `the` : le nom avec son article (« à l'en-cas », « le dîner »). */
export const MEALS: Record<MealKey, { label: string; short: string; to: string; the: string; icon: IconName }> = {
  breakfast: { label: 'Petit-déjeuner', short: 'Petit-déj', to: 'au petit-déjeuner', the: 'le petit-déjeuner', icon: 'coffee' },
  lunch: { label: 'Déjeuner', short: 'Déjeuner', to: 'au déjeuner', the: 'le déjeuner', icon: 'sun' },
  snack: { label: 'En-cas', short: 'En-cas', to: "à l'en-cas", the: "l'en-cas", icon: 'fruit' },
  dinner: { label: 'Dîner', short: 'Dîner', to: 'au dîner', the: 'le dîner', icon: 'moon' },
};

export const STATUSES: Record<MealStatus, { label: string; color: string }> = {
  planned: { label: 'Prévu', color: '#B8B8BE' },
  missed: { label: 'Manqué', color: '#FF6B6B' },
  out: { label: 'Extérieur', color: '#8CC8FF' },
};

/** Couleurs des macros (reprises de la palette des objectifs). */
export const MACRO_COLORS = { protein: '#FF9A3C', carbs: '#F5D547', fat: '#8CC8FF' } as const;

/** 12.5 → « 12,5 », 3 → « 3 », 0.333 → « 0,33 ». */
export function fmtNum(n: number, decimals = 1) {
  const f = 10 ** decimals;
  const r = Math.round(n * f) / f;
  return String(r).replace('.', ',');
}

/** Nombre saisi (« 12,5 », « 80 ») ; vide → null ; illisible ou négatif → NaN. */
export function parseNum(text: string): number | null {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export const numText = (n: number | null) => (n === null ? '' : fmtNum(n, 2));

export const kcalText = (m: Macros) => `${Math.round(m.kcal)} kcal`;
/** « P 32 · G 80 · L 14 » */
export const macroLine = (m: Macros) => `P ${Math.round(m.protein)} · G ${Math.round(m.carbs)} · L ${Math.round(m.fat)}`;

/** « 1,5 portion », « 2 portions » */
export const portionsText = (n: number) => `${fmtNum(n, 2)} portion${n >= 2 ? 's' : ''}`;

/** « 2 × 80 g » ou « 2 portions » quand l'aliment n'a pas de portion décrite. */
export function quantityText(food: Food, portions: number) {
  return food.portionLabel ? `${fmtNum(portions, 2)} × ${food.portionLabel}` : portionsText(portions);
}

/** « sachet 1 kg · 12,5 portions » */
export function containerText(food: Food) {
  if (!food.portionsPerContainer) return food.containerLabel;
  const n = `${fmtNum(food.portionsPerContainer, 2)} portion${food.portionsPerContainer >= 2 ? 's' : ''}`;
  return food.containerLabel ? `${food.containerLabel} · ${n}` : `${n} par contenant`;
}

/** Recherche insensible à la casse et aux accents. */
export function matchesQuery(name: string, q: string) {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return norm(name).includes(norm(q));
}

/** Repas le plus probable à cette heure (bouton + de l'onglet Repas). */
export function mealForNow(d = new Date()): MealKey {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 10 * 60 + 30) return 'breakfast';
  if (m < 15 * 60) return 'lunch';
  if (m < 18 * 60 + 30) return 'snack';
  return 'dinner';
}
