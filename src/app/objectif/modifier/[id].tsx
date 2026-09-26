import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { GoalForm } from '@/components/goal-form';
import { Screen } from '@/components/screen';
import { archiveGoal, deleteGoal, getGoal, updateGoal } from '@/db/goals';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { colors } from '@/theme/tokens';

/** Modifier un objectif (appui long sur sa carte). */
export default function EditGoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = Number(id);
  const mutate = useDbMutation();
  const { data: goal } = useDbQuery((db) => getGoal(db, goalId), id);

  if (goal === undefined) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!goal) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AppText variant="title">Objectif introuvable</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <AppText variant="label" color={colors.textSecondary}>
            Retour
          </AppText>
        </Pressable>
      </Screen>
    );
  }
  return (
    <GoalForm
      key={goal.id}
      title="Modifier l'objectif"
      initial={goal}
      onSave={async (d) => {
        await mutate((db) => updateGoal(db, goal.id, d));
      }}
      onArchive={async () => {
        await mutate((db) => archiveGoal(db, goal.id));
      }}
      onDelete={async () => {
        await mutate((db) => deleteGoal(db, goal.id));
      }}
    />
  );
}
