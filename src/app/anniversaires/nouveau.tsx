import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { BirthdayForm } from '@/components/birthday-form';
import { createBirthday } from '@/db/birthdays';
import { getCategories } from '@/db/events';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { todayKey } from '@/lib/dates';
import { colors } from '@/theme/tokens';

export default function NewBirthdayScreen() {
  // `day` : jour choisi dans l'agenda (bouton +) ; il préremplit le jour et le mois.
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const mutate = useDbMutation();
  const { data: categories } = useDbQuery(getCategories);

  if (!categories) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayKey();
  return (
    <BirthdayForm
      title="Nouvel anniversaire"
      categories={categories}
      initial={{
        name: '',
        day: Number(day.slice(8, 10)),
        month: Number(day.slice(5, 7)),
        year: null,
        categoryId: categories.find((c) => c.key === 'friends')?.id ?? null,
        remindD7: true,
        remindD1: true,
        remindD0: true,
        remindTime: '09:00',
        trackGifts: true,
        buyDays: 3,
        ideas: [],
      }}
      onSave={async (draft) => {
        await mutate((db) => createBirthday(db, draft));
      }}
    />
  );
}
