import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Chip } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import { FoodLine, MacroPills, PortionStepper, SearchField } from '@/components/meal-parts';
import { Sheet } from '@/components/sheet';
import {
  addMealItem, copySlot, type Food, foodMacros, getWeekPlan, listFoods, MEAL_KEYS, type MealKey, recentMeals,
} from '@/db/meals';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dateFieldLabel, todayKey } from '@/lib/dates';
import { kcalText, matchesQuery, MEALS, mealForNow, quantityText } from '@/lib/meal-format';
import { takePendingFood } from '@/lib/meal-view';
import { colors, fonts } from '@/theme/tokens';

const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Ajouter des aliments à un repas : chercher dans le catalogue, choisir le nombre de portions,
 * ou reprendre d'un geste un repas déjà fait. L'écran reste ouvert pour en ajouter plusieurs.
 */
export default function AddToMealScreen() {
  const p = useLocalSearchParams<{ day?: string; meal?: string }>();
  const day = isDay(p.day) ? p.day! : todayKey();
  const [meal, setMeal] = useState<MealKey>(MEAL_KEYS.includes(p.meal as MealKey) ? (p.meal as MealKey) : mealForNow());
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const mutate = useDbMutation();

  const { data: foods } = useDbQuery(listFoods, '', { cacheId: 'aliments' });
  const { data: plan } = useDbQuery((db) => getWeekPlan(db, day), day);
  const { data: recent } = useDbQuery((db) => recentMeals(db, meal, { day, meal }), `${day}:${meal}`);
  const current = plan?.days.find((d) => d.day === day)?.meals[meal];

  // Retour de « Nouvel aliment » : on propose tout de suite ses portions (dès que la liste l'a).
  const [pendingId, setPendingId] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      const id = takePendingFood();
      if (id === null) return;
      setQ('');
      setPendingId(id);
    }, [setPendingId]),
  );
  const sheetFood = picked ?? (pendingId !== null ? foods?.find((f) => f.id === pendingId) : undefined) ?? null;

  const shown = (foods ?? []).filter((f) => matchesQuery(f.name, q));
  const info = MEALS[meal];

  const reuse = async (from: { day: string; meal: MealKey }) => {
    await mutate((db) => copySlot(db, from, { day, meal }, 'append'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.iconBtn}>
          <Icon name="x" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="display" numberOfLines={1} style={{ fontSize: 24 }}>
            Ajouter
          </AppText>
          <AppText variant="caption">{dateFieldLabel(day)}</AppText>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/repas/aliment/nouveau', params: { pick: '1', ...(q.trim() ? { name: q.trim() } : {}) } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}>
          <Icon name="plus" size={14} strokeWidth={2.4} />
          <AppText variant="label">Aliment</AppText>
        </Pressable>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup">
          {MEAL_KEYS.map((m) => (
            <Chip key={m} label={MEALS[m].label} selected={m === meal} onPress={() => setMeal(m)} />
          ))}
        </ScrollView>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <SearchField value={q} onChange={setQ} />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(f) => String(f.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 24 }}
          ListHeaderComponent={
            !q.trim() && recent && recent.length > 0 ? (
              <View style={{ gap: 8, marginBottom: 8 }}>
                <AppText variant="overline">Reprendre un repas</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -16 }}>
                  <View style={{ width: 8 }} />
                  {recent.map((r) => (
                    <Pressable
                      key={`${r.day}-${r.meal}`}
                      onPress={() => reuse(r)}
                      accessibilityRole="button"
                      accessibilityLabel={`Reprendre le ${MEALS[r.meal].label.toLowerCase()} du ${dateFieldLabel(r.day)} : ${r.names.join(', ')}`}
                      style={({ pressed }) => [styles.recent, pressed && { backgroundColor: colors.row }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icon name={MEALS[r.meal].icon} size={14} color={colors.textSecondary} />
                        <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                          {MEALS[r.meal].short} · {dateFieldLabel(r.day)}
                        </AppText>
                      </View>
                      <AppText variant="bodyMedium" numberOfLines={2} style={{ fontSize: 13, lineHeight: 17 }}>
                        {r.names.join(', ')}
                      </AppText>
                      <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 13 }} color={colors.textSecondary}>
                        {kcalText(r.totals)}
                      </AppText>
                    </Pressable>
                  ))}
                  <View style={{ width: 8 }} />
                </ScrollView>
                <AppText variant="overline" style={{ marginTop: 6 }}>
                  Aliments
                </AppText>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 30).duration(260)}>
              <FoodLine food={item} hint="Choisir les portions" onPress={() => setPicked(item)} />
            </Animated.View>
          )}
          ListEmptyComponent={
            foods ? (
              <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
                <Icon name="leaf" size={28} color={colors.textMuted} strokeWidth={1.6} />
                <AppText variant="bodyStrong" color={colors.textSecondary}>
                  {q.trim() ? 'Aucun aliment trouvé' : 'Ton catalogue est vide'}
                </AppText>
                <AppText variant="caption" style={{ textAlign: 'center', fontSize: 13 }}>
                  Crée un aliment une fois (portion, contenant, macros), puis réutilise-le dans tous tes repas.
                </AppText>
                <Pressable
                  onPress={() => router.push({ pathname: '/repas/aliment/nouveau', params: { pick: '1', ...(q.trim() ? { name: q.trim() } : {}) } })}
                  accessibilityRole="button"
                  style={styles.primaryBtn}>
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
                    {q.trim() ? `Créer « ${q.trim()} »` : 'Créer un aliment'}
                  </AppText>
                </Pressable>
              </Animated.View>
            ) : null
          }
        />
      </KeyboardAvoidingView>

      {/* Contenu actuel du repas : on voit ce qui s'ajoute. */}
      <View style={styles.footer}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {info.label}
          </AppText>
          <AppText variant="caption" numberOfLines={1} accessibilityLiveRegion="polite">
            {current?.items.length
              ? `${current.items.length} aliment${current.items.length > 1 ? 's' : ''} · ${kcalText(current.totals)}`
              : 'Rien pour l’instant'}
          </AppText>
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.doneBtn}>
          <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
            Terminé
          </AppText>
        </Pressable>
      </View>

      {sheetFood && (
        <PortionSheet
          key={sheetFood.id}
          food={sheetFood}
          mealTo={info.to}
          onClose={() => {
            setPicked(null);
            setPendingId(null);
          }}
          onAdd={async (n) => {
            await mutate((db) => addMealItem(db, day, meal, sheetFood.id, n));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setQ('');
          }}
        />
      )}
    </SafeAreaView>
  );
}

function PortionSheet({
  food, mealTo, onAdd, onClose,
}: {
  food: Food;
  mealTo: string;
  onAdd: (portions: number) => Promise<void>;
  onClose: () => void;
}) {
  const [n, setN] = useState(1);
  const m = foodMacros(food, n);
  return (
    <Sheet inline onClosed={onClose} label={`Portions de ${food.name}`}>
      {(close) => (
        <>
          <View style={{ gap: 2, paddingHorizontal: 4 }}>
            <AppText variant="title">{food.name}</AppText>
            <AppText variant="caption">{quantityText(food, n)}</AppText>
          </View>
          <PortionStepper value={n} onChange={setN} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
            <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 18 }}>{kcalText(m)}</AppText>
            <MacroPills m={m} />
          </View>
          <Pressable
            onPress={async () => {
              await onAdd(n);
              close();
            }}
            accessibilityRole="button"
            style={styles.sheetBtn}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
              Ajouter {mealTo}
            </AppText>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  newBtn: {
    height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 16,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed,
  },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  recent: {
    width: 170, gap: 4, padding: 12, borderRadius: 18,
    backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
  },
  empty: {
    alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 24,
    backgroundColor: colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: 22,
  },
  primaryBtn: { height: 44, marginTop: 4, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  doneBtn: { height: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  sheetBtn: { height: 52, borderRadius: 999, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
});
