import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { MacroPills, WeekNav } from '@/components/meal-parts';
import { Screen } from '@/components/screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { type DayPlan, getWeekPlan, MEAL_KEYS, type MealItem, type MealPlan } from '@/db/meals';
import { useDbQuery } from '@/db/use-query';
import { longDayTitle, todayKey, weekdayAbbr, weekStart } from '@/lib/dates';
import { kcalText, MEALS, quantityText, STATUSES } from '@/lib/meal-format';
import { setMealDay, useMealDay } from '@/lib/meal-view';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/** Onglet Repas : les 4 repas de chaque jour de la semaine, avec leurs macros. */
export default function RepasScreen() {
  const bottom = useTabBarSpace();
  const day = useMealDay();
  const week = weekStart(day);
  const { data: plan } = useDbQuery((db) => getWeekPlan(db, week), week, { cacheId: 'repas' });
  const dayPlan = plan?.week === week ? plan.days.find((d) => d.day === day) : undefined;
  const weekCount = plan?.days.reduce((n, d) => n + d.count, 0) ?? 0;

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(300)} style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="display" accessibilityRole="header" style={{ flex: 1, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 }}>
            Repas
          </AppText>
          <Pressable
            onPress={() => router.push({ pathname: '/repas/actions', params: { kind: 'week', day } })}
            accessibilityRole="button"
            accessibilityLabel="Actions de la semaine"
            style={styles.iconBtn}>
            <Icon name="more" size={20} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/repas/courses', params: { day } })}
            accessibilityRole="button"
            accessibilityLabel="Liste de courses de la semaine"
            style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}>
            <View style={styles.newIcon}>
              <Icon name="cart" size={14} color={colors.text} strokeWidth={2.2} />
            </View>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
              Courses
            </AppText>
          </Pressable>
        </View>
        <WeekNav day={day} onChange={setMealDay} />
      </Animated.View>

      <DayStrip days={plan?.week === week ? plan.days : undefined} day={day} />

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}>
        {dayPlan && (
          <>
            <DaySummary d={dayPlan} />
            {MEAL_KEYS.map((m, i) => (
              <MealCard key={`${day}-${m}`} plan={dayPlan.meals[m]} day={day} index={i} />
            ))}
            {weekCount === 0 && (
              <Animated.View entering={FadeIn.delay(200).duration(300)} style={styles.hint}>
                <AppText variant="caption" style={{ textAlign: 'center', fontSize: 13 }}>
                  Semaine vide. Touche ••• pour reprendre une semaine passée, ou ajoute les aliments repas par repas.
                </AppText>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Les 7 jours de la semaine, avec les kcal prévues. */
function DayStrip({ days, day }: { days?: DayPlan[]; day: string }) {
  const today = todayKey();
  return (
    <View style={styles.strip} accessibilityRole="tablist">
      {(days ?? []).map((d) => {
        const on = d.day === day;
        return (
          <Pressable
            key={d.day}
            onPress={() => {
              if (!on) Haptics.selectionAsync();
              setMealDay(d.day);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${longDayTitle(d.day)}, ${d.count ? kcalText(d.totals) : 'rien de prévu'}`}
            style={[styles.dayCell, on && styles.dayCellOn]}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 11 }} color={on ? colors.sheetTextSecondary : colors.textTertiary}>
              {weekdayAbbr(d.day)}
            </AppText>
            <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 18, lineHeight: 22 }} color={on ? colors.onLight : colors.text}>
              {Number(d.day.slice(8))}
            </AppText>
            <AppText style={{ fontFamily: fonts.bodyMedium, fontSize: 10 }} color={on ? colors.sheetTextSecondary : colors.textMuted} numberOfLines={1}>
              {d.count ? Math.round(d.totals.kcal) : '—'}
            </AppText>
            {d.day === today && <View style={[styles.todayDot, on && { backgroundColor: colors.onLight }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function DaySummary({ d }: { d: DayPlan }) {
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.summary}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="overline">{longDayTitle(d.day)}</AppText>
          <AppText style={styles.kcal}>
            {Math.round(d.totals.kcal)}
            <AppText style={styles.kcalUnit}> kcal</AppText>
          </AppText>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: '/repas/actions', params: { kind: 'day', day: d.day } })}
          accessibilityRole="button"
          accessibilityLabel="Actions de la journée"
          style={styles.iconBtn}>
          <Icon name="more" size={20} strokeWidth={2.4} />
        </Pressable>
      </View>
      <MacroPills m={d.totals} big />
    </Animated.View>
  );
}

function MealCard({ plan, day, index }: { plan: MealPlan; day: string; index: number }) {
  const info = MEALS[plan.meal];
  const status = plan.status !== 'planned' ? STATUSES[plan.status] : null;
  const empty = plan.items.length === 0;
  const add = () => router.push({ pathname: '/repas/ajouter', params: { day, meal: plan.meal } });
  return (
    <Animated.View
      entering={FadeInDown.delay(60 + index * 50).duration(340)}
      style={[styles.card, status && { borderColor: withAlpha(status.color, 0.35) }]}>
      <View style={styles.cardHead}>
        <View style={[styles.mealIcon, status && { backgroundColor: withAlpha(status.color, 0.14) }]}>
          <Icon name={info.icon} size={18} color={status?.color ?? colors.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppText variant="title" style={{ fontSize: 17 }} numberOfLines={1}>
              {info.label}
            </AppText>
            {status && (
              <View style={[styles.badge, { backgroundColor: withAlpha(status.color, 0.14) }]}>
                <AppText style={{ fontFamily: fonts.bodyBold, fontSize: 11 }} color={status.color}>
                  {status.label}
                </AppText>
              </View>
            )}
          </View>
          <AppText variant="caption">
            {plan.items.length ? kcalText(plan.totals) : 'Rien de prévu'}
          </AppText>
        </View>
        {empty && <AddButton onPress={add} label={`Ajouter ${info.to}`} />}
        <Pressable
          onPress={() => router.push({ pathname: '/repas/actions', params: { kind: 'meal', day, meal: plan.meal } })}
          accessibilityRole="button"
          accessibilityLabel={`Actions : ${info.label}`}
          style={styles.iconBtnSmall}>
          <Icon name="more" size={18} strokeWidth={2.4} color={colors.textSecondary} />
        </Pressable>
      </View>

      {!empty && (
        <>
          <View style={{ gap: 2 }}>
            {plan.items.map((it) => (
              <ItemRow key={it.id} it={it} dim={!!status} />
            ))}
          </View>
          <View style={styles.cardFoot}>
            <MacroPills m={plan.totals} />
            <AddButton onPress={add} label={`Ajouter ${info.to}`} />
          </View>
        </>
      )}
    </Animated.View>
  );
}

function AddButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.addBtn, pressed && { backgroundColor: colors.row }]}>
      <Icon name="plus" size={14} strokeWidth={2.4} />
      <AppText variant="label">Ajouter</AppText>
    </Pressable>
  );
}

function ItemRow({ it, dim }: { it: MealItem; dim: boolean }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/repas/portion/[id]', params: { id: String(it.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`${it.food.name}, ${quantityText(it.food, it.portions)}, ${kcalText(it.macros)}`}
      accessibilityHint="Modifier la portion"
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.row }, dim && { opacity: 0.6 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyMedium" numberOfLines={1}>
          {it.food.name}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {quantityText(it.food, it.portions)}
        </AppText>
      </View>
      <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 14 }} color={colors.textSecondary}>
        {Math.round(it.macros.kcal)}
        <AppText variant="caption"> kcal</AppText>
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingHorizontal: 20, paddingTop: 12 },
  titleRow: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderDashed },
  iconBtnSmall: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  newBtn: {
    height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 16,
    borderRadius: 999, backgroundColor: colors.text,
  },
  newIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.onLight, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  dayCell: {
    flex: 1, height: 70, alignItems: 'center', justifyContent: 'center', gap: 1,
    borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  dayCellOn: { backgroundColor: colors.text, borderColor: colors.text },
  todayDot: { position: 'absolute', top: 6, right: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.late },
  body: { gap: 10, paddingHorizontal: 16 },
  summary: {
    gap: 10, padding: 16, paddingTop: 14, borderRadius: 24,
    backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
  },
  kcal: { fontFamily: fonts.displayLight, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, color: colors.text },
  kcalUnit: { fontSize: 16, color: colors.textMuted, letterSpacing: 0 },
  card: {
    gap: 8, padding: 12, borderRadius: 22,
    backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  addBtn: {
    height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 14,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed,
  },
  hint: { paddingVertical: 12, paddingHorizontal: 20 },
});
