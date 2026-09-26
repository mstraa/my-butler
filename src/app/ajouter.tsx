import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { addEliquid, addToGoal, getDayStats, setWokeAt } from '@/db/agenda';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { mediumDayLabel, todayKey } from '@/lib/dates';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

type Tile = { label: string; icon: IconName; color: string; href?: '/rdv/nouveau' | '/tache/nouvelle' | '/anniversaires/nouveau' | '/depense/nouvelle' | '/objectif/nouveau' };

const TILES: Tile[] = [
  { label: 'Rendez-vous', icon: 'calendar', color: categoryColors.work, href: '/rdv/nouveau' },
  { label: 'Tâche', icon: 'task', color: categoryColors.friends, href: '/tache/nouvelle' },
  { label: 'Dépense', icon: 'wallet', color: categoryColors.groceries, href: '/depense/nouvelle' },
  { label: 'Objectif', icon: 'target', color: categoryColors.health, href: '/objectif/nouveau' },
  { label: 'Lever / coucher', icon: 'moon', color: categoryColors.sport },
  { label: 'E-liquide', icon: 'drop', color: categoryColors.work },
  { label: "Envie d'achat", icon: 'heart', color: categoryColors.family },
  { label: 'Anniversaire', icon: 'cake', color: categoryColors.birthday, href: '/anniversaires/nouveau' },
  { label: 'Note du jour', icon: 'note', color: colors.textSecondary },
];

/** Feuille « Ajouter » ouverte par le bouton + : tous les types, et la saisie rapide. */
export default function AddSheet() {
  const insets = useSafeAreaInsets();
  const today = todayKey();
  // Jour visé par les créations (jour choisi dans l'agenda) ; la saisie rapide reste sur aujourd'hui.
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : today;
  const mutate = useDbMutation();
  const { data: stats } = useDbQuery((db) => getDayStats(db, today), today);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);

  /* Animation : p va de 0 (fermée) à 1 (ouverte) ; drag = glissement du doigt vers le bas. */
  const p = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(600);
  const closing = useSharedValue(false);

  useEffect(() => {
    p.set(withTiming(1, { duration: 280, easing: ease }));
  }, [p]);

  /** Referme la feuille (200 ms), puis quitte l'écran ou ouvre la suite. */
  const close = (then: () => void = () => router.back()) => {
    if (closing.get()) return;
    closing.set(true);
    p.set(withTiming(0, { duration: 200, easing: easeIn }, (finished) => {
      if (finished) scheduleOnRN(then);
    }));
  };

  const navigation = useNavigation();
  // Bouton retour d'Android : même fermeture animée.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Un écran ouvert par-dessus (ex. l'édition) gère son propre retour.
      if (!navigation.isFocused()) return false;
      close();
      return true;
    });
    return () => sub.remove();
  });

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-16, 16])
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (drag.get() > height.get() * 0.25 || e.velocityY > 800) {
        scheduleOnRN(close);
      } else {
        drag.set(withTiming(0, { duration: 200, easing: ease }));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - p.get()) * height.get() + drag.get() }],
  }));
  const veilStyle = useAnimatedStyle(() => ({
    opacity: p.get() * (1 - Math.min(drag.get() / Math.max(height.get(), 1), 1)),
  }));

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
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
        <Pressable accessibilityLabel="Fermer" onPress={() => close()} style={styles.veil} />
      </Animated.View>

      <GestureDetector gesture={pan}>
      <Animated.View
        accessibilityViewIsModal
        onLayout={(e) => {
          height.set(e.nativeEvent.layout.height);
        }}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }, sheetStyle]}>
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <AppText variant="display" style={{ fontFamily: fonts.displayMedium, fontSize: 28 }}>
            Ajouter
          </AppText>
          <AppText variant="caption" style={{ fontSize: 13 }}>
            pour {mediumDayLabel(day)}
          </AppText>
        </View>

        <View style={styles.grid}>
          {TILES.map((t) => (
            <View key={t.label} style={styles.tileWrap}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  close(() =>
                    t.href ? router.replace({ pathname: t.href, params: { day } }) : router.replace({ pathname: '/a-venir', params: { titre: t.label } }),
                  )
                }
                style={({ pressed }) => [styles.tile, pressed && { backgroundColor: '#2A2A2F' }]}>
                <View style={[styles.tileIcon, { backgroundColor: withAlpha(t.color, 0.13) }]}>
                  <Icon name={t.icon} size={16} color={t.color} />
                </View>
                <AppText variant="label" style={{ textAlign: 'center' }}>
                  {t.label}
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          <View style={styles.quickHead}>
            <AppText variant="label" color={colors.textSecondary}>
              Saisie rapide{day !== today ? ' · aujourd’hui' : ''}
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
        </View>
      </Animated.View>
      </GestureDetector>
    </View>
  );
}

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const easeIn = Easing.bezier(0.4, 0, 1, 1);

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
  // 3 tuiles par ligne quelle que soit la largeur : une base de 30 % en laisse passer 3 (pas 4),
  // puis elles s'étirent pour remplir la ligne. Une largeur fixe (31,9 %) débordait à 390 px.
  tileWrap: { flexGrow: 1, flexBasis: '30%' },
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
