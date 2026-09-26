/**
 * Jour choisi dans l'agenda (vues Jour et Mois), pour que le bouton + crée à cette date.
 * Simple valeur de module : l'écran Agenda la tient à jour, le bouton + la lit au moment du tap.
 */
let selected: string | null = null;

export function setSelectedDay(day: string | null) {
  selected = day;
}

export function getSelectedDay() {
  return selected;
}
