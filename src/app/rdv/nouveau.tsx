import { addMinutes as addMin, differenceInMinutes } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EventForm } from '@/components/event-form';
import { createEvent, getCategories, getEvent } from '@/db/events';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { parseStamp, stamp, todayKey } from '@/lib/dates';
import { colors } from '@/theme/tokens';

/** Heure pleine suivante si c'est aujourd'hui (ex. 14:20 → 15:00), sinon 09:00. */
function defaultStart(day: string) {
  if (day !== todayKey()) return `${day}T09:00`;
  const h = new Date().getHours() + 1;
  return h <= 22 ? `${day}T${String(h).padStart(2, '0')}:00` : `${day}T22:00`;
}
const minutesBetween = (a: string, b: string) => Math.max(15, differenceInMinutes(parseStamp(b), parseStamp(a)));
const addMinutes = (s: string, m: number) => stamp(addMin(parseStamp(s), m));

export default function NewEventScreen() {
  const { day, from } = useLocalSearchParams<{ day?: string; from?: string }>();
  const mutate = useDbMutation();
  // `from` : rdv annulé à reprogrammer — on reprend son titre, sa catégorie, son lieu et sa durée.
  const { data } = useDbQuery(async (db) => {
    const [categories, source] = await Promise.all([getCategories(db), from ? getEvent(db, Number(from)) : null]);
    return { categories, source };
  }, from ?? '');

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const { categories, source } = data;

  const start = defaultStart(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayKey());
  const minutes = source?.endsAt ? minutesBetween(source.startsAt, source.endsAt) : 60;
  return (
    <EventForm
      title={source ? 'Reprogrammer' : 'Nouveau rendez-vous'}
      categories={categories}
      initial={{
        title: source?.title ?? '',
        categoryId: source ? source.categoryId : (categories.find((c) => c.key === 'personal')?.id ?? null),
        startsAt: start,
        endsAt: addMinutes(start, minutes),
        allDay: source?.allDay ?? false,
        location: source?.location ?? '',
        reminderMin: source ? source.reminderMin : 15,
        recurrence: 'none',
        deadline: null,
        notes: source?.notes ?? '',
      }}
      onSave={async (draft) => {
        await mutate((db) => createEvent(db, draft));
      }}
    />
  );
}
