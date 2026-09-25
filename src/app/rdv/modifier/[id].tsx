import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { EventForm } from '@/components/event-form';
import { Screen } from '@/components/screen';
import { deleteEvent, getCategories, getEvent, updateEvent } from '@/db/events';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { colors } from '@/theme/tokens';

/** Modifier un rendez-vous (formulaire, ouvert depuis le détail). */
export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Number(id);
  const mutate = useDbMutation();
  const { data } = useDbQuery(async (db) => {
    const [event, categories] = await Promise.all([getEvent(db, eventId), getCategories(db)]);
    return { event, categories };
  }, id);

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (!data.event) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AppText variant="title">Rendez-vous introuvable</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <AppText variant="label" color={colors.textSecondary}>
            Retour
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  const { event, categories } = data;
  return (
    <EventForm
      key={event.id}
      title="Modifier le rendez-vous"
      categories={categories}
      initial={event}
      readOnlyNote={event.recurrence !== 'none' ? 'Rendez-vous répété : les changements s\'appliquent à toutes les occurrences.' : undefined}
      onSave={async (draft) => {
        await mutate((db) => updateEvent(db, event.id, draft));
      }}
      onDelete={async () => {
        await mutate((db) => deleteEvent(db, event.id));
      }}
    />
  );
}
