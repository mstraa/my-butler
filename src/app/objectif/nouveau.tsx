import { useLocalSearchParams } from 'expo-router';

import { GoalForm } from '@/components/goal-form';
import { createGoal, type GoalPeriod } from '@/db/goals';
import { todayKey } from '@/lib/dates';
import { EVERY_PERIOD } from '@/lib/goal-repeat';
import { useDbMutation } from '@/db/use-query';

export default function NewGoalScreen() {
  // `period` : onglet affiché dans Objectifs au moment du « Nouvel objectif ».
  const { period } = useLocalSearchParams<{ period?: GoalPeriod }>();
  const mutate = useDbMutation();
  return (
    <GoalForm
      title="Nouvel objectif"
      initial={{
        title: '',
        period: period === 'week' || period === 'month' ? period : 'day',
        kind: 'counter',
        target: 0,
        unit: '',
        color: null,
        icon: 'target',
        alarm: null,
        repeat: EVERY_PERIOD(todayKey()),
      }}
      onSave={async (d) => {
        await mutate((db) => createGoal(db, d));
      }}
    />
  );
}
