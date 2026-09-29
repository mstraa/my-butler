import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { type ReorderItem, ReorderList } from '@/components/reorder-list';
import { BackHeader, Screen } from '@/components/screen';
import { type GoalPeriod, type GoalProgress, listGoals, reorderGoals } from '@/db/goals';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { repeatLabel } from '@/lib/goal-repeat';
import { todayKey } from '@/lib/dates';
import { colors } from '@/theme/tokens';

const SECTIONS: { period: GoalPeriod; title: string }[] = [
  { period: 'day', title: 'Chaque jour' },
  { period: 'week', title: 'Chaque semaine' },
  { period: 'month', title: 'Chaque mois' },
];

const toItem = (g: GoalProgress): ReorderItem => ({
  id: g.id, title: g.title, subtitle: repeatLabel(g.period, g.repeat), icon: g.icon, color: g.color,
});

/** Réorganiser les objectifs, période par période (l'ordre vaut pour la Liste et pour Jour / Semaine / Mois). */
export default function GoalOrderScreen() {
  const today = todayKey();
  const mutate = useDbMutation();
  const { data: goals } = useDbQuery((db) => listGoals(db, today), today, { cacheId: 'objectifs' });

  // L'ordre est global : on remet bout à bout les trois périodes, celle qui change comprise.
  // Dans une période, les objectifs en repos vont à la fin (comme dans les onglets) : chaque groupe se range à part.
  const inPeriod = (period: GoalPeriod) => (goals ?? []).filter((g) => g.period === period);
  const save = (period: GoalPeriod, rest: boolean, ids: number[]) => {
    const byId = new Map((goals ?? []).map((g) => [g.id, g]));
    const others = inPeriod(period).filter((g) => g.off !== rest).map((g) => g.id);
    const ofPeriod = rest ? [...others, ...ids] : [...ids, ...others];
    const all = SECTIONS.flatMap((s) => (s.period === period ? ofPeriod : inPeriod(s.period).map((g) => g.id)));
    mutate((db) => reorderGoals(db, all.map((id) => ({ id, color: byId.get(id)!.color }))));
  };

  return (
    <Screen>
      <BackHeader title="Réorganiser" />
      <ScrollView contentContainerStyle={{ gap: 20, paddingHorizontal: 16, paddingBottom: 40 }}>
        <AppText variant="caption" style={{ paddingHorizontal: 4 }}>
          Fais glisser un objectif par sa poignée pour changer sa place.
        </AppText>
        {goals?.length === 0 && (
          <AppText variant="body" color={colors.textTertiary} style={{ textAlign: 'center', paddingVertical: 20 }}>
            Aucun objectif pour l&apos;instant.
          </AppText>
        )}
        {SECTIONS.map((s) => {
          const list = inPeriod(s.period);
          if (list.length === 0) return null;
          const active = list.filter((g) => !g.off);
          const resting = list.filter((g) => g.off);
          return (
            <View key={s.period} style={{ gap: 8 }}>
              <AppText variant="overline" style={{ paddingHorizontal: 4 }}>
                {s.title}
              </AppText>
              {active.length > 0 && <ReorderList items={active.map(toItem)} onReorder={(ids) => save(s.period, false, ids)} />}
              {resting.length > 0 && (
                <>
                  <AppText variant="caption" style={{ paddingHorizontal: 4 }}>
                    En repos en ce moment
                  </AppText>
                  <ReorderList items={resting.map(toItem)} onReorder={(ids) => save(s.period, true, ids)} />
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
