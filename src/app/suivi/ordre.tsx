import { ScrollView } from 'react-native';

import { AppText } from '@/components/app-text';
import type { IconName } from '@/components/icon';
import { ReorderList } from '@/components/reorder-list';
import { BackHeader, Screen } from '@/components/screen';
import { listTrackers, reorderTrackers } from '@/db/tracking';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { categoryColors, colors } from '@/theme/tokens';

/** Réorganiser les suivis de l'onglet Suivi. */
export default function TrackerOrderScreen() {
  const mutate = useDbMutation();
  const { data: trackers } = useDbQuery((db) => listTrackers(db), '', { cacheId: 'suivi-ordre' });
  return (
    <Screen>
      <BackHeader title="Réorganiser" />
      <ScrollView contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 40 }}>
        <AppText variant="caption" style={{ paddingHorizontal: 4 }}>
          Fais glisser un suivi par sa poignée pour changer sa place.
        </AppText>
        {trackers?.length === 0 && (
          <AppText variant="body" color={colors.textTertiary} style={{ textAlign: 'center', paddingVertical: 20 }}>
            Aucun suivi pour l&apos;instant.
          </AppText>
        )}
        {trackers && trackers.length > 0 && (
          <ReorderList
            items={trackers.map((t) => ({
              id: t.id, title: t.name, icon: t.icon as IconName, color: t.color ?? categoryColors.sport,
              subtitle: t.source === 'health' ? 'Health Connect' : undefined,
            }))}
            onReorder={(ids) => mutate((db) => reorderTrackers(db, ids))}
          />
        )}
      </ScrollView>
    </Screen>
  );
}
