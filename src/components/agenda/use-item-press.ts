import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { type AgendaItem, toggleTaskDone } from '@/db/agenda';
import { dayOf } from '@/lib/dates';
import { useDbMutation } from '@/db/use-query';

/** Toucher un élément de l'agenda : une tâche se coche, un rendez-vous ouvre son aperçu. */
export function useItemPress() {
  const mutate = useDbMutation();
  return (item: AgendaItem) => {
    if (item.kind === 'task') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      mutate((db) => toggleTaskDone(db, item.id));
    } else if (item.kind === 'event') {
      router.push({
        pathname: '/rdv/apercu/[id]',
        params: { id: String(item.id), day: item.start ? dayOf(item.start) : '' },
      });
    }
  };
}
