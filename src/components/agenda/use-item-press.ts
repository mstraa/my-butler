import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import type { AgendaItem } from '@/db/agenda';
import { dayOf } from '@/lib/dates';

/** Toucher un élément de l'agenda : aperçu d'une tâche ou d'un rendez-vous, fiche d'un anniversaire. */
export function useItemPress() {
  return (item: AgendaItem) => {
    if (item.kind === 'task') {
      router.push({ pathname: '/tache/apercu/[id]', params: { id: String(item.id) } });
    } else if (item.kind === 'birthday') {
      router.push({ pathname: '/anniversaires/[id]', params: { id: String(item.id) } });
    } else if (item.kind === 'event') {
      router.push({
        pathname: '/rdv/apercu/[id]',
        params: { id: String(item.id), day: item.start ? dayOf(item.start) : '' },
      });
    }
  };
}

/** Appui long : une tâche s'ouvre en modification. */
export function useItemLongPress() {
  return (item: AgendaItem) => {
    if (item.kind !== 'task') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/tache/modifier/[id]', params: { id: String(item.id) } });
  };
}
