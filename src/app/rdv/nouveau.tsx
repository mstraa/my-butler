import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EventForm } from '@/components/event-form';
import { createEvent, getCategories } from '@/db/events';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { todayKey } from '@/lib/dates';
import { colors } from '@/theme/tokens';

/** Heure pleine suivante si c'est aujourd'hui (ex. 14:20 → 15:00), sinon 09:00. */
function defaultStart(day: string) {
  if (day !== todayKey()) return `${day}T09:00`;
  const h = new Date().getHours() + 1;
  return h <= 22 ? `${day}T${String(h).padStart(2, '0')}:00` : `${day}T22:00`;
}
const plusHour = (s: string) => `${s.slice(0, 11)}${String(Math.min(23, Number(s.slice(11, 13)) + 1)).padStart(2, '0')}:${s.slice(14)}`;

export default function NewEventScreen() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const mutate = useDbMutation();
  const { data: categories } = useDbQuery(getCategories);

  if (!categories) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const start = defaultStart(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayKey());
  return (
    <EventForm
      title="Nouveau rendez-vous"
      categories={categories}
      initial={{
        title: '',
        categoryId: categories.find((c) => c.key === 'personal')?.id ?? null,
        startsAt: start,
        endsAt: plusHour(start),
        allDay: false,
        location: '',
        reminderMin: 15,
        recurrence: 'none',
        deadline: null,
      }}
      onSave={async (draft) => {
        await mutate((db) => createEvent(db, draft));
      }}
    />
  );
}
