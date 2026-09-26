import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import { TaskForm } from '@/components/task-form';
import { getCategories } from '@/db/events';
import { deleteTask, getTask, updateTask } from '@/db/tasks';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { colors } from '@/theme/tokens';

/** Modifier une tâche (appui long sur la tâche dans l'agenda). */
export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = Number(id);
  const mutate = useDbMutation();
  const { data } = useDbQuery(async (db) => {
    const [task, categories] = await Promise.all([getTask(db, taskId), getCategories(db)]);
    return { task, categories };
  }, id);

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (!data.task) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AppText variant="title">Tâche introuvable</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <AppText variant="label" color={colors.textSecondary}>
            Retour
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  const { task, categories } = data;
  return (
    <TaskForm
      key={task.id}
      title="Modifier la tâche"
      categories={categories}
      initial={task}
      onSave={async (draft) => {
        await mutate((db) => updateTask(db, task.id, draft));
      }}
      onDelete={async () => {
        await mutate((db) => deleteTask(db, task.id));
      }}
    />
  );
}
