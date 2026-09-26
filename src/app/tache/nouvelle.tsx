import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { defaultDue, TaskForm } from '@/components/task-form';
import { getCategories } from '@/db/events';
import { createTask } from '@/db/tasks';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { todayKey } from '@/lib/dates';
import { colors } from '@/theme/tokens';

export default function NewTaskScreen() {
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const mutate = useDbMutation();
  const { data: categories } = useDbQuery(getCategories);

  if (!categories) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayKey();
  return (
    <TaskForm
      title="Nouvelle tâche"
      categories={categories}
      initial={{
        title: '',
        categoryId: categories.find((c) => c.key === 'personal')?.id ?? null,
        day,
        due: defaultDue(day),
        reminderMin: 60,
        showLate: true,
        nagAt: '09:00',
        tracksExpense: false,
        estimateCents: null,
        notes: '',
      }}
      onSave={async (draft) => {
        await mutate((db) => createTask(db, draft));
      }}
    />
  );
}
