import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { type FlatList, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  interpolateColor,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { DayCard } from '@/components/agenda/day-card';
import { useItemPress } from '@/components/agenda/use-item-press';
import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { type AgendaDay, getAgendaDays, getDayStats, getLateItems } from '@/db/agenda';
import { useDbQuery } from '@/db/use-query';
import { monthName, shiftDay, todayKey, yearOf } from '@/lib/dates';
import { colors, fonts, TAB_BAR_CLEARANCE } from '@/theme/tokens';

/*
 * Vue Liste en « roue » :
 * - aujourd'hui est toujours ouvert ;
 * - en défilant, rien ne s'ouvre : un cadre suit le jour visé (le 2e visible, la veille
 *   restant affichée au-dessus) et la liste s'arrête toujours sur un jour ;
 * - à l'arrêt, toucher le jour sélectionné l'ouvre ; il reste ouvert jusqu'à la fermeture
 *   de l'app.
 *
 * Géométrie : un jour fermé occupe STEP px (carte de 92 + 8 d'espace), un jour ouvert sa
 * hauteur mesurée. `tops` donne la position de chaque jour ; les arrêts du défilement
 * (snapToOffsets) sont ces positions.
 */
const CLOSED = 92;
const GAP = 8;
const STEP = CLOSED + GAP;
const OPEN_ESTIMATE = 260; // hauteur supposée d'un jour ouvert avant sa mesure
const LOAD_BEFORE = 30;
const LOAD_AFTER = 60;
const CHUNK = 60;
const ABOVE = 1; // jours visibles au-dessus du jour sélectionné

/** Jours ouverts à la main : gardés tant que l'app tourne (remis à zéro à la fermeture). */
const openedDays = new Set<string>();
let listShown = false;

export function ListView({ switcher }: { switcher: React.ReactNode }) {
  const today = todayKey();
  const list = useRef<FlatList<AgendaDay>>(null);
  const [range, setRange] = useState({ from: shiftDay(today, -LOAD_BEFORE), to: shiftDay(today, LOAD_AFTER) });
  const [selected, setSelected] = useState(today);
  const [opened, setOpened] = useState(() => new Set(openedDays));
  const [heights, setHeights] = useState<Record<string, number>>({});
  const onItemPress = useItemPress();

  const { data } = useDbQuery(
    (db) => getAgendaDays(db, range.from, range.to),
    `${range.from}|${range.to}`,
    { cacheId: 'liste' },
  );
  const { data: late } = useDbQuery(getLateItems, '', { cacheId: 'retards' });
  const { data: todayStats } = useDbQuery((db) => getDayStats(db, today), today, { cacheId: 'stats-jour' });

  const [animateIn] = useState(() => {
    const first = !listShown;
    listShown = true;
    return first;
  });

  const days = data ?? [];
  const isOpen = (day: string) => day === today || opened.has(day);

  // Position de chaque jour dans la liste (et longueur totale en dernière case).
  const tops: number[] = [0];
  for (const d of days) {
    const h = isOpen(d.day) ? (heights[d.day] ?? OPEN_ESTIMATE) + GAP : STEP;
    tops.push(tops[tops.length - 1] + h);
  }
  const topsSV = useSharedValue<number[]>([]);
  topsSV.set(tops);

  const scrollY = useSharedValue(0);
  const lastFocal = useSharedValue(-1);

  /** Index du jour sélectionné pour un défilement donné (le jour au-dessus est en haut). */
  const indexAt = (y: number) => {
    let k = 0;
    while (k < tops.length - 2 && tops[k + 1] <= y + 1) k++;
    return Math.min(days.length - 1, k + ABOVE);
  };

  const tick = () => Haptics.selectionAsync();
  const settle = (y: number) => {
    const d = days[indexAt(y)]?.day;
    if (d) setSelected(d);
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
      const f = Math.round(focalPosition(topsSV.get(), e.contentOffset.y));
      if (f !== lastFocal.get()) {
        if (lastFocal.get() !== -1) scheduleOnRN(tick); // un « cran » de la roue
        lastFocal.set(f);
      }
    },
    onEndDrag: (e) => scheduleOnRN(settle, e.contentOffset.y),
    onMomentumEnd: (e) => scheduleOnRN(settle, e.contentOffset.y),
  });

  const scrollToDay = (day: string) => {
    const i = days.findIndex((d) => d.day === day);
    if (i < 0) return;
    setSelected(day);
    list.current?.scrollToOffset({ offset: tops[Math.max(0, i - ABOVE)], animated: true });
  };

  const openDay = (day: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openedDays.add(day);
    setOpened(new Set(openedDays));
  };

  const getItemLayout = (_: ArrayLike<AgendaDay> | null | undefined, index: number) => ({
    length: tops[index + 1] - tops[index],
    offset: tops[index],
    index,
  });

  const todayIndex = days.findIndex((d) => d.day === today);
  const lateCount = late?.length ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={{ width: 44 }} />
        <Pressable
          onPress={() => scrollToDay(today)}
          disabled={selected === today}
          accessibilityRole={selected === today ? 'header' : 'button'}
          accessibilityHint={selected === today ? undefined : "Revenir à aujourd'hui"}
          style={{ alignItems: 'center' }}>
          <AppText variant="display">
            {monthName(selected)} <AppText variant="display" color={colors.textTertiary}>{yearOf(selected)}</AppText>
          </AppText>
          {selected !== today && (
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 11 }} color={colors.textSecondary}>
              Aujourd&apos;hui ›
            </AppText>
          )}
        </Pressable>
        <Link href="/reglages" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Réglages" style={styles.iconBtn}>
            <Icon name="gear" size={20} color={colors.textFaint} strokeWidth={1.4} />
          </Pressable>
        </Link>
      </View>

      {switcher}

      {lateCount > 0 && (
        <Animated.View entering={animateIn ? FadeInDown.duration(300) : undefined} style={{ paddingHorizontal: 12 }}>
          <Link href="/en-retard" asChild>
            <Pressable accessibilityRole="button" style={styles.late}>
              <View style={styles.lateDot} />
              <AppText variant="bodyStrong" color={colors.late} style={{ flex: 1 }}>
                {lateCount} en retard
              </AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                échéance passée ›
              </AppText>
            </Pressable>
          </Link>
        </Animated.View>
      )}

      {days.length > 0 && (
        <Animated.FlatList
          ref={list}
          data={days}
          keyExtractor={(d) => d.day}
          extraData={opened}
          initialScrollIndex={Math.max(0, (todayIndex < 0 ? 0 : todayIndex) - ABOVE)}
          getItemLayout={getItemLayout}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          snapToOffsets={tops.slice(0, -1)}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          // En remontant : on ajoute des jours passés sans que la liste saute.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onStartReached={() => setRange((r) => ({ ...r, from: shiftDay(r.from, -CHUNK) }))}
          onStartReachedThreshold={3}
          onEndReached={() => setRange((r) => ({ ...r, to: shiftDay(r.to, CHUNK) }))}
          onEndReachedThreshold={3}
          windowSize={9}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: TAB_BAR_CLEARANCE + 200 }}
          renderItem={({ item, index }) => {
            const open = isOpen(item.day);
            return (
              <Animated.View
                entering={animateIn ? FadeInDown.delay(Math.min(Math.abs(index - todayIndex + ABOVE), 6) * 40).duration(300) : undefined}
                style={{ paddingBottom: GAP }}
                onLayout={
                  open
                    ? (e: LayoutChangeEvent) => {
                        const h = Math.round(e.nativeEvent.layout.height) - GAP;
                        if (heights[item.day] !== h) setHeights((m) => ({ ...m, [item.day]: h }));
                      }
                    : undefined
                }>
                {!open && <FocusFrame index={index} scrollY={scrollY} tops={topsSV} />}
                <FocusDayCard
                  index={index}
                  scrollY={scrollY}
                  tops={topsSV}
                  day={item}
                  isToday={item.day === today}
                  open={open}
                  stats={item.day === today ? todayStats : undefined}
                  onToggle={() => {
                    if (open) return;
                    // Jour sélectionné : on l'ouvre. Autre jour : on le fait venir à la sélection.
                    if (item.day === selected) openDay(item.day);
                    else scrollToDay(item.day);
                  }}
                  animate
                  onItemPress={onItemPress}
                />
              </Animated.View>
            );
          }}
        />
      )}
    </View>
  );
}

/** Position « continue » du jour visé pour un défilement y (ex. 12,4 = entre le 12e et le 13e). */
function focalPosition(tops: number[], y: number) {
  'worklet';
  if (tops.length < 2) return 0;
  let k = 0;
  while (k < tops.length - 2 && tops[k + 1] <= y) k++;
  const span = tops[k + 1] - tops[k] || 1;
  return k + Math.min(1, Math.max(0, (y - tops[k]) / span)) + ABOVE;
}

/** Proximité d'un jour avec le repère : 1 pile dessus, 0 à un jour ou plus. */
function useFocus(index: number, scrollY: SharedValue<number>, tops: SharedValue<number[]>) {
  return useDerivedValue(() => Math.max(0, 1 - Math.abs(focalPosition(tops.get(), scrollY.get()) - index)));
}

type FocusProps = { index: number; scrollY: SharedValue<number>; tops: SharedValue<number[]> };

/** Cadre lumineux qui suit le jour visé pendant le défilement. */
function FocusFrame({ index, scrollY, tops }: FocusProps) {
  const focus = useFocus(index, scrollY, tops);
  const style = useAnimatedStyle(() => ({ opacity: focus.get() }));
  return <Animated.View pointerEvents="none" style={[styles.focusFrame, style]} />;
}

/** Carte de jour dont le chiffre s'éclaire en passant sous le repère. */
function FocusDayCard({ index, scrollY, tops, ...props }: React.ComponentProps<typeof DayCard> & FocusProps) {
  const focus = useFocus(index, scrollY, tops);
  const numberStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focus.get(), [0, 1], [colors.textMuted, colors.text]),
  }));
  return <DayCard {...props} numberStyle={numberStyle} />;
}

const styles = StyleSheet.create({
  focusFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CLOSED,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(244,244,242,0.28)',
    backgroundColor: 'rgba(244,244,242,0.035)',
    zIndex: 1,
  },
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  late: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.lateBg,
    borderWidth: 1,
    borderColor: colors.lateBorder,
  },
  lateDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.late },
});
