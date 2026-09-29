import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { Chip } from '@/components/form/fields';
import { WeekNav } from '@/components/meal-parts';
import { Sheet } from '@/components/sheet';
import { type CopyMode, copySlot, copyWeek, countItems, MEAL_KEYS, type MealKey, type Slot } from '@/db/meals';
import { useDbMutation } from '@/db/use-query';
import { dateFieldLabel, type DayKey, shiftDay, todayKey, weekDays, weekdayAbbr, weekRangeLabel, weekStart } from '@/lib/dates';
import { MEALS } from '@/lib/meal-format';
import { setMealDay } from '@/lib/meal-view';
import { colors, fonts } from '@/theme/tokens';

type Kind = 'meal' | 'day' | 'week';

/** Choisir où copier un repas, une journée ou une semaine (n'importe quelle semaine, passée ou future). */
export default function CopySheet() {
  const p = useLocalSearchParams<{ kind?: Kind; day?: string; meal?: MealKey }>();
  const kind: Kind = p.kind === 'meal' || p.kind === 'day' ? p.kind : 'week';
  const from: DayKey = p.day && /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : todayKey();
  const fromMeal: MealKey = MEAL_KEYS.includes(p.meal as MealKey) ? (p.meal as MealKey) : 'lunch';
  const db = useSQLiteContext();
  const mutate = useDbMutation();

  // Par défaut : le lendemain (repas, journée) ou la semaine suivante.
  const [to, setTo] = useState<DayKey>(shiftDay(from, kind === 'week' ? 7 : 1));
  const [toMeal, setToMeal] = useState<MealKey>(fromMeal);

  const source =
    kind === 'meal' ? `${MEALS[fromMeal].label} du ${dateFieldLabel(from)}` : kind === 'day' ? `Journée du ${dateFieldLabel(from)}` : `Semaine du ${weekRangeLabel(from)}`;
  const target =
    kind === 'meal' ? `${MEALS[toMeal].the} du ${dateFieldLabel(to)}` : kind === 'day' ? `le ${dateFieldLabel(to)}` : `la semaine du ${weekRangeLabel(to)}`;
  const same = kind === 'week' ? weekStart(to) === weekStart(from) : to === from && (kind === 'day' || toMeal === fromMeal);

  return (
    <Sheet label="Copier vers" draggable={false}>
      {(close) => {
        const run = async (mode: CopyMode) => {
          await mutate((d) =>
            kind === 'week'
              ? copyWeek(d, from, to, mode)
              : copySlot(d, { day: from, meal: kind === 'meal' ? fromMeal : undefined }, { day: to, meal: kind === 'meal' ? toMeal : undefined }, mode),
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // On montre le résultat.
          setMealDay(kind === 'week' ? shiftDay(weekStart(to), weekDays(from).indexOf(from)) : to);
          close();
        };
        const copy = async () => {
          const slots: Slot[] = kind === 'week' ? weekDays(to).map((d) => ({ day: d })) : [{ day: to, meal: kind === 'meal' ? toMeal : undefined }];
          const n = await countItems(db, slots);
          if (!n) return run('replace');
          showDialog(
            'Il y a déjà des aliments',
            `${n} aliment${n > 1 ? 's' : ''} déjà prévu${n > 1 ? 's' : ''} pour ${target}.`,
            [
              { text: 'Remplacer', style: 'destructive', onPress: () => run('replace') },
              { text: 'Ajouter à la suite', onPress: () => run('append') },
              { text: 'Annuler', style: 'cancel' },
            ],
          );
        };

        return (
          <>
            <View style={{ gap: 2, paddingHorizontal: 4 }}>
              <AppText variant="title">Copier vers…</AppText>
              <AppText variant="caption">{source}</AppText>
            </View>

            <WeekNav day={to} onChange={setTo} compact />

            {kind !== 'week' && (
              <View style={styles.days}>
                {weekDays(to).map((d) => {
                  const on = d === to;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setTo(d);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={dateFieldLabel(d)}
                      style={[styles.day, on && styles.dayOn]}>
                      <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 11 }} color={on ? colors.sheetTextSecondary : colors.textTertiary}>
                        {weekdayAbbr(d)}
                      </AppText>
                      <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 17 }} color={on ? colors.onLight : colors.text}>
                        {Number(d.slice(8))}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {kind === 'meal' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
                {MEAL_KEYS.map((m) => (
                  <Chip key={m} label={MEALS[m].label} selected={m === toMeal} onPress={() => setToMeal(m)} />
                ))}
              </ScrollView>
            )}

            <Pressable
              onPress={copy}
              disabled={same}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, (pressed || same) && { opacity: same ? 0.35 : 0.85 }]}>
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight} numberOfLines={1}>
                {same ? 'Choisis une autre destination' : `Copier vers ${target}`}
              </AppText>
            </Pressable>
          </>
        );
      }}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1, height: 58, alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  dayOn: { backgroundColor: colors.text, borderColor: colors.text },
  btn: { height: 52, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
});
