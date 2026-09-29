import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { ActionRow } from '@/components/meal-parts';
import { Sheet } from '@/components/sheet';
import { clearSlot, clearWeek, copyWeek, countItems, getWeekPlan, MEAL_KEYS, type MealKey, type MealStatus, setMealStatus } from '@/db/meals';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { type DayKey, longDayTitle, shiftDay, todayKey, weekDays, weekRangeLabel, weekStart } from '@/lib/dates';
import { MEALS, STATUSES } from '@/lib/meal-format';
import { setMealDay } from '@/lib/meal-view';

type Kind = 'meal' | 'day' | 'week';

/** Actions d'un repas (statut, copier, vider), d'une journée ou de la semaine. */
export default function MealActionsSheet() {
  const p = useLocalSearchParams<{ kind?: Kind; day?: string; meal?: MealKey }>();
  const kind: Kind = p.kind === 'meal' || p.kind === 'day' ? p.kind : 'week';
  const day: DayKey = p.day && /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : todayKey();
  const meal: MealKey = MEAL_KEYS.includes(p.meal as MealKey) ? (p.meal as MealKey) : 'lunch';
  const db = useSQLiteContext();
  const mutate = useDbMutation();
  const { data: plan } = useDbQuery((db) => getWeekPlan(db, day), day);
  const mealPlan = plan?.days.find((d) => d.day === day)?.meals[meal];

  const title =
    kind === 'meal' ? `${MEALS[meal].label} · ${longDayTitle(day)}` : kind === 'day' ? longDayTitle(day) : `Semaine du ${weekRangeLabel(day)}`;
  const copyTo = () => router.replace({ pathname: '/repas/copier', params: { kind, day, ...(kind === 'meal' ? { meal } : {}) } });

  return (
    <Sheet label={title}>
      {(close) => {
        const clear = (what: string) =>
          showDialog(`Vider ${what} ?`, 'Les aliments prévus sont retirés.', [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Vider',
              style: 'destructive',
              onPress: async () => {
                await mutate((db) =>
                  kind === 'week' ? clearWeek(db, day) : clearSlot(db, { day, meal: kind === 'meal' ? meal : undefined }),
                );
                close();
              },
            },
          ]);

        return (
          <View style={{ gap: 4 }}>
            <AppText variant="title" style={{ paddingHorizontal: 8, paddingBottom: 6 }} numberOfLines={1}>
              {title}
            </AppText>

            {kind === 'meal' &&
              (['planned', 'missed', 'out'] as MealStatus[]).map((s) => (
                <ActionRow
                  key={s}
                  icon={s === 'planned' ? 'calendar' : s === 'missed' ? 'x' : 'pin'}
                  label={s === 'planned' ? 'Prévu' : s === 'missed' ? 'Marquer comme manqué' : 'Marquer comme extérieur'}
                  selected={(mealPlan?.status ?? 'planned') === s}
                  onPress={async () => {
                    Haptics.selectionAsync();
                    await mutate((db) => setMealStatus(db, day, meal, s));
                    close();
                  }}
                  sub={s === 'planned' ? undefined : `Le repas porte l'étiquette « ${STATUSES[s].label} »`}
                />
              ))}

            {kind === 'week' && (
              <ActionRow
                icon="undo"
                label="Reprendre la semaine précédente"
                sub={`Copie les repas du ${weekRangeLabel(shiftDay(day, -7))} sur cette semaine`}
                onPress={async () => {
                  const from = weekStart(shiftDay(day, -7));
                  const to = weekStart(day);
                  const src = await countItems(db, weekDays(from).map((d) => ({ day: d })));
                  const dst = await countItems(db, weekDays(to).map((d) => ({ day: d })));
                  if (!src) {
                    showDialog('Semaine précédente vide', 'Il n’y a aucun repas à reprendre.');
                    return;
                  }
                  const run = async (mode: 'replace' | 'append') => {
                    await mutate((db) => copyWeek(db, from, to, mode));
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    close();
                  };
                  if (!dst) return run('replace');
                  showDialog('Cette semaine a déjà des repas', `${dst} aliment${dst > 1 ? 's' : ''} déjà prévu${dst > 1 ? 's' : ''}.`, [
                    { text: 'Remplacer', style: 'destructive', onPress: () => run('replace') },
                    { text: 'Ajouter à la suite', onPress: () => run('append') },
                    { text: 'Annuler', style: 'cancel' },
                  ]);
                }}
              />
            )}

            <ActionRow
              icon="copy"
              label={kind === 'meal' ? 'Copier ce repas vers…' : kind === 'day' ? 'Copier cette journée vers…' : 'Copier cette semaine vers…'}
              sub={kind === 'meal' ? 'Un autre jour, un autre repas, une autre semaine' : undefined}
              onPress={() => close(copyTo)}
            />

            {kind === 'week' && (
              <ActionRow icon="leaf" label="Catalogue d'aliments" onPress={() => close(() => router.replace('/repas/aliments'))} />
            )}

            {kind === 'day' && day !== todayKey() && (
              <ActionRow
                icon="calendar"
                label="Revenir à aujourd'hui"
                onPress={() => {
                  setMealDay(null);
                  close();
                }}
              />
            )}

            <ActionRow
              icon="trash"
              destructive
              label={kind === 'meal' ? 'Vider ce repas' : kind === 'day' ? 'Vider la journée' : 'Vider la semaine'}
              onPress={() => clear(kind === 'meal' ? MEALS[meal].the : kind === 'day' ? 'la journée' : 'la semaine')}
            />
          </View>
        );
      }}
    </Sheet>
  );
}
