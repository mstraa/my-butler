import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  type FlatList,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  interpolateColor,
  LinearTransition,
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
 * Vue Liste en « roue » : le jour sélectionné est le 2e visible (la veille reste visible
 * au-dessus). Pendant le défilement, tous les jours sont fermés et la liste glisse librement ;
 * elle s'arrête toujours sur un jour, et ce jour ne s'ouvre qu'après une courte pause.
 *
 * Géométrie : chaque jour fermé occupe STEP px (carte de 92 + 8 d'espace). Au repos, le jour
 * n°i est sélectionné quand le défilement vaut (i − 1) × STEP. Ouvrir ou fermer un jour ne
 * change que ce qui est en dessous : rien ne bouge au-dessus, donc pas de saut.
 */
const CLOSED = 92;
const GAP = 8;
const STEP = CLOSED + GAP;
const LOAD_BEFORE = 30; // jours chargés avant aujourd'hui au départ
const LOAD_AFTER = 60;
const CHUNK = 60; // jours ajoutés quand on approche d'un bord
const OPEN_DELAY = 70; // courte pause avant d'ouvrir le jour, une fois la liste arrêtée
const ABOVE = 1; // nombre de jours visibles au-dessus du jour sélectionné

let listShown = false;

export function ListView({ switcher }: { switcher: React.ReactNode }) {
  const today = todayKey();
  const list = useRef<FlatList<AgendaDay>>(null);
  const [range, setRange] = useState({ from: shiftDay(today, -LOAD_BEFORE), to: shiftDay(today, LOAD_AFTER) });
  const [selected, setSelected] = useState(today);
  const [openDay, setOpenDay] = useState<string | null>(today);
  const scrollY = useSharedValue(0); // défilement, suivi sur le fil d'animation
  const lastIndex = useSharedValue(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openHeight, setOpenHeight] = useState(260);
  const [interacted, setInteracted] = useState(false);
  const onItemPress = useItemPress();

  const { data } = useDbQuery(
    (db) => getAgendaDays(db, range.from, range.to),
    `${range.from}|${range.to}`,
    { cacheId: 'liste' },
  );
  const { data: late } = useDbQuery(getLateItems, '', { cacheId: 'retards' });
  const { data: stats } = useDbQuery((db) => getDayStats(db, selected), selected, { cacheId: 'stats-jour' });

  // Animation d'entrée des cartes : seulement au premier affichage de l'app.
  const [animateIn] = useState(() => {
    const first = !listShown;
    listShown = true;
    return first;
  });

  const days = data ?? [];
  const selIndex = Math.max(0, days.findIndex((d) => d.day === selected));
  const openIndex = openDay ? days.findIndex((d) => d.day === openDay) : -1;

  const dayAtOffset = (y: number) => {
    const i = Math.min(days.length - 1, Math.max(0, Math.round(y / STEP) + ABOVE));
    return days[i]?.day;
  };
  const cancelOpen = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  /** Après une pause : le jour sous le repère devient la sélection et s'ouvre. */
  const openAfterPause = (day: string | undefined, delay = OPEN_DELAY) => {
    cancelOpen();
    if (!day) return;
    timer.current = setTimeout(() => {
      setSelected(day);
      setOpenDay(day);
    }, delay);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const tick = () => Haptics.selectionAsync(); // un « cran » de la roue
  const onDragStart = () => {
    cancelOpen();
    setInteracted(true);
    setOpenDay(null); // tout se ferme pendant le défilement : la liste glisse sans à-coups
  };
  const onSettled = (y: number) => openAfterPause(dayAtOffset(y));

  // Tout le suivi du défilement tourne sur le fil d'animation : aucun rendu React par image.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
      const i = Math.round(e.contentOffset.y / STEP);
      if (i !== lastIndex.get()) {
        if (lastIndex.get() !== -1) scheduleOnRN(tick);
        lastIndex.set(i);
      }
    },
    onBeginDrag: () => scheduleOnRN(onDragStart),
    onEndDrag: (e) => scheduleOnRN(onSettled, e.contentOffset.y),
    onMomentumBegin: () => scheduleOnRN(cancelOpen),
    onMomentumEnd: (e) => scheduleOnRN(onSettled, e.contentOffset.y),
  });

  const scrollToDay = (day: string) => {
    const i = days.findIndex((d) => d.day === day);
    if (i < 0) return;
    cancelOpen();
    setInteracted(true);
    setOpenDay(null);
    list.current?.scrollToOffset({ offset: Math.max(0, i - ABOVE) * STEP, animated: true });
    openAfterPause(day, 320);
  };

  // Positions exactes : jours fermés partout, sauf le jour ouvert (hauteur mesurée).
  const getItemLayout = (_: ArrayLike<AgendaDay> | null | undefined, index: number) => {
    if (openIndex < 0 || index <= openIndex) {
      return { length: index === openIndex ? openHeight + GAP : STEP, offset: index * STEP, index };
    }
    return { length: STEP, offset: openIndex * STEP + openHeight + GAP + (index - openIndex - 1) * STEP, index };
  };

  const lateCount = late?.length ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={{ width: 44 }} />
        <Pressable
          onPress={() => {
            scrollToDay(today);
          }}
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
          // Les jours sous celui qui s'ouvre / se ferme glissent au lieu de sauter.
          itemLayoutAnimation={LinearTransition.duration(220)}
          data={days}
          keyExtractor={(d) => d.day}
          initialScrollIndex={Math.max(0, selIndex - ABOVE)}
          getItemLayout={getItemLayout}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          snapToInterval={STEP}
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
            const open = item.day === openDay;
            return (
              <Animated.View
                entering={animateIn ? FadeInDown.delay(Math.min(Math.abs(index - selIndex + ABOVE), 6) * 40).duration(300) : undefined}
                style={{ paddingBottom: GAP }}
                onLayout={open ? (e: LayoutChangeEvent) => setOpenHeight(Math.round(e.nativeEvent.layout.height) - GAP) : undefined}>
                {!open && <FocusFrame index={index} scrollY={scrollY} />}
                <FocusDayCard
                  index={index}
                  scrollY={scrollY}
                  day={item}
                  isToday={item.day === today}
                  open={open}
                  stats={open ? stats : undefined}
                  onToggle={() => {
                    if (!open) scrollToDay(item.day);
                  }}
                  animate={interacted}
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

/** Proximité d'un jour avec le repère de la roue : 1 pile dessus, 0 à un jour ou plus. */
function useFocus(index: number, scrollY: SharedValue<number>) {
  return useDerivedValue(() => Math.max(0, 1 - Math.abs(scrollY.get() / STEP + ABOVE - index)));
}

/** Cadre lumineux qui suit le jour visé pendant le défilement. */
function FocusFrame({ index, scrollY }: { index: number; scrollY: SharedValue<number> }) {
  const focus = useFocus(index, scrollY);
  const style = useAnimatedStyle(() => ({ opacity: focus.get() }));
  return <Animated.View pointerEvents="none" style={[styles.focusFrame, style]} />;
}

/** Carte de jour dont le chiffre s'éclaire en passant sous le repère. */
function FocusDayCard({
  index, scrollY, ...props
}: React.ComponentProps<typeof DayCard> & { index: number; scrollY: SharedValue<number> }) {
  const focus = useFocus(index, scrollY);
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
