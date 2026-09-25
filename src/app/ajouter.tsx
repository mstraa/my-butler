import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { addEliquid, addToGoal, getDayStats, setWokeAt } from '@/db/agenda';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { mediumDayLabel, todayKey } from '@/lib/dates';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

type Tile = { label: string; icon: IconName; color: string };

const TILES: Tile[] = [
  { label: 'Rendez-vous', icon: 'calendar', color: categoryColors.work },
  { label: 'Tâche', icon: 'task', color: categoryColors.friends },
  { label: 'Dépense', icon: 'wallet', color: categoryColors.groceries },
  { label: 'Objectif', icon: 'target', color: categoryColors.health },
  { label: 'Lever / coucher', icon: 'moon', color: categoryColors.sport },
  { label: 'E-liquide', icon: 'drop', color: categoryColors.work },
  { label: "Envie d'achat", icon: 'heart', color: categoryColors.family },
  { label: 'Anniversaire', icon: 'cake', color: categoryColors.birthday },
  { label: 'Note du jour', icon: 'note', color: colors.textSecondary },
];

/** Feuille « Ajouter » ouverte par le bouton + : tous les types, et la saisie rapide. */
export default function AddSheet() {
  const insets = useSafeAreaInsets();
  const today = todayKey();
  const mutate = useDbMutation();
  const { data: stats } = useDbQuery((db) => getDayStats(db, today), today);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);

  const show = (text: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setToast((t) => ({ text, n: (t?.n ?? 0) + 1 }));
  };

  const fruits = stats?.fruits;
  const quick = [
    {
      label: '+1 fruit/légume',
      value: fruits ? `Fruits ${fruits.value}/${fruits.target}` : 'Fruits',
      press: async () => {
        const v = await mutate((db) => addToGoal(db, 'fruits', today, 1));
        show(v === null ? "Pas d'objectif « fruits »" : `Fruits ${v}/${fruits?.target ?? '?'}`);
      },
    },
    {
      label: '+0,5 ml',
      value: `E-liquide ${fmtMl(stats?.eliquidMl ?? 0)}`,
      press: async () => {
        const ml = await mutate((db) => addEliquid(db, today, 0.5));
        show(`${fmtMl(ml)} aujourd'hui`);
      },
    },
    {
      label: 'Levé maintenant',
      value: stats?.wokeAt ? `Levé ${stats.wokeAt}` : 'Pas encore noté',
      press: async () => {
        const d = new Date();
        const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        await mutate((db) => setWokeAt(db, today, hhmm));
        show(`Levé à ${hhmm}`);
      },
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Animated.View entering={FadeIn.duration(300)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Fermer" onPress={() => router.back()} style={styles.veil} />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.springify().damping(24).stiffness(220)}
        accessibilityViewIsModal
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <AppText variant="display" style={{ fontFamily: fonts.displayMedium, fontSize: 28 }}>
            Ajouter
          </AppText>
          <AppText variant="caption" style={{ fontSize: 13 }}>
            pour {mediumDayLabel(today)}
          </AppText>
        </View>

        <View style={styles.grid}>
          {TILES.map((t, i) => (
            <Animated.View key={t.label} entering={ZoomIn.delay(180 + i * 45).duration(350)} style={styles.tileWrap}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace({ pathname: '/a-venir', params: { titre: t.label } })}
                style={({ pressed }) => [styles.tile, pressed && { backgroundColor: '#2A2A2F' }]}>
                <View style={[styles.tileIcon, { backgroundColor: withAlpha(t.color, 0.13) }]}>
                  <Icon name={t.icon} size={16} color={t.color} />
                </View>
                <AppText variant="label" style={{ textAlign: 'center' }}>
                  {t.label}
                </AppText>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <Animated.View entering={FadeInDown.delay(600).duration(400)} style={{ gap: 10 }}>
          <View style={styles.quickHead}>
            <AppText variant="label" color={colors.textSecondary}>
              Saisie rapide
            </AppText>
            {toast && (
              <Animated.View key={toast.n} entering={FadeInDown.duration(250)} style={styles.toast} accessibilityLiveRegion="polite">
                <Icon name="check" size={12} color={colors.success} strokeWidth={2.6} />
                <AppText variant="caption" color={colors.success} style={{ fontFamily: fonts.bodySemiBold }}>
                  {toast.text}
                </AppText>
              </Animated.View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {quick.map((q) => (
              <Pressable
                key={q.label}
                onPress={q.press}
                accessibilityRole="button"
                style={({ pressed }) => [styles.quick, pressed && { transform: [{ scale: 0.96 }] }]}>
                <AppText variant="label">{q.label}</AppText>
                <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 12 }} color={colors.textTertiary}>
                  {q.value}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const fmtMl = (ml: number) => `${String(ml).replace('.', ',')} ml`;

const styles = StyleSheet.create({
  veil: { flex: 1, backgroundColor: colors.veil },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 16,
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A40' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tileWrap: { width: '31.9%' },
  tile: {
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
    borderRadius: 20,
    backgroundColor: colors.row,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  quickHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, minHeight: 20 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  quick: {
    flex: 1,
    minWidth: 0,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 18,
    backgroundColor: '#232327',
  },
});
