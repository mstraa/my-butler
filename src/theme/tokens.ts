/**
 * Jetons de design repris des maquettes « Haute fidélité » du canevas
 * « App Agenda Android ». Tout est sombre ; la couleur est réservée aux catégories.
 */

export const colors = {
  bg: '#0E0E10',
  surface: '#131315', // carte de jour repliée
  surfaceRaised: '#18181B', // carte ouverte, feuilles sombres
  row: '#222226', // lignes dans une carte
  pill: '#1F1F23', // barre de navigation flottante
  segmented: '#1B1B1E',
  border: '#2A2A2E',
  borderSoft: '#1F1F23',
  borderStrong: '#2E2E33',
  borderDashed: '#34343A',

  text: '#F4F4F2',
  textSecondary: '#B8B8BE',
  textTertiary: '#9A9AA0',
  textMuted: '#75757B',
  textFaint: '#6B6B70',
  onLight: '#141416',

  sheet: '#FFFFFF', // feuilles blanches (timeline, historique)
  sheetText: '#141416',
  sheetTextSecondary: '#5B5B61',
  sheetBorder: '#E4E4E7',

  late: '#FFB547',
  lateBg: 'rgba(255,181,71,0.10)',
  lateBorder: 'rgba(255,181,71,0.28)',
  success: '#2BD94A',
  veil: 'rgba(0,0,0,0.6)',
} as const;

/** Couleurs de catégorie (brief §3). */
export const categoryColors = {
  work: '#4FD1D9', // Travail — cyan
  friends: '#FF9A3C', // Potes — orange
  health: '#6BE08A', // Santé — vert
  groceries: '#F5D547', // Courses — jaune
  birthday: '#E0525A', // Anniversaire — rouge
  sport: '#B18CFF', // Sport — violet
  family: '#FF7AB6', // Famille — rose
  personal: '#B8B8BE', // Perso — neutre
} as const;

/** Ajoute une opacité hexadécimale à une couleur #RRGGBB (ex. withAlpha(c, 0.13)). */
export function withAlpha(hex: string, alpha: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

export const fonts = {
  displayThin: 'Outfit_200ExtraLight',
  displayLight: 'Outfit_300Light',
  displayMedium: 'Outfit_500Medium',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
  bodyBold: 'DMSans_700Bold',
} as const;

export const radius = {
  sm: 9,
  md: 14,
  lg: 20,
  xl: 24,
  sheet: 30,
  full: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Hauteur réservée en bas des écrans pour la barre de navigation flottante. */
export const TAB_BAR_CLEARANCE = 108;

/** Courbe utilisée dans toutes les animations des maquettes : cubic-bezier(.2,.8,.2,1). */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
