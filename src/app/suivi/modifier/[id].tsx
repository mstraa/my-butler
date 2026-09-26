import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import { TrackerForm } from '@/components/tracker-form';
import { deleteTracker, getTracker, updateTracker } from '@/db/tracking';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { colors } from '@/theme/tokens';

/** Modifier un suivi (crayon sur sa carte). */
export default function EditTrackerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackerId = Number(id);
  const mutate = useDbMutation();
  const { data: tracker } = useDbQuery((db) => getTracker(db, trackerId), id);

  if (tracker === undefined) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!tracker) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AppText variant="title">Suivi introuvable</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <AppText variant="label" color={colors.textSecondary}>
            Retour
          </AppText>
        </Pressable>
      </Screen>
    );
  }
  return (
    <TrackerForm
      key={tracker.id}
      title="Modifier le suivi"
      initial={tracker}
      onSave={async (d) => {
        await mutate((db) => updateTracker(db, tracker.id, d));
      }}
      onDelete={async () => {
        await mutate((db) => deleteTracker(db, tracker.id));
      }}
    />
  );
}
