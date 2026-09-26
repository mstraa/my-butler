/**
 * Liens entrants avant la navigation. Un partage Android vers l'app (Partager → My Personal Life)
 * arrive avec l'hôte « expo-sharing » : on l'envoie vers la création d'envie.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (new URL(path).hostname === 'expo-sharing') return '/envie/partage';
    return path;
  } catch {
    return path;
  }
}
