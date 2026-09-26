import * as Haptics from 'expo-haptics';
import { Link, router } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type FlatList, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { DayCard } from '@/components/agenda/day-card';
import { useItemPress } from '@/components/agenda/use-item-press';
import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { type AgendaDay, getAgendaDays, getDayStats, getLateItems } from '@/db/agenda';
import { useDbQuery } from '@/db/use-query';
import { useTabBarSpace } from '@/components/tab-bar';
import { monthName, shiftDay, todayKey, yearOf } from '@/lib/dates';
import { setSelectedDay } from '@/lib/selected-day';
import { colors, fonts } from '@/theme/tokens';

/*
 * Vue Liste :
 * - aujourd'hui est ouvert au départ ; toucher n'importe quel jour l'ouvre ou le referme,
 *   et ces choix sont gardés jusqu'à la fermeture de l'app ;
 * - défilement libre, avec un petit « cran » haptique à chaque jour qui passe ;
 * - on peut remonter dans le passé sans limite (chargement par paquets).
 *
 * Géométrie : un jour fermé occupe STEP px (carte de 92 + 8 d'espace), un jour ouvert sa
 * hauteur mesurée ; `tops` donne la position de chaque jour.
 */
const CLOSED = 92;
const GAP = 8;
const STEP = CLOSED + GAP;
const OPEN_ESTIMATE = 260; // hauteur supposée d'un jour ouvert avant sa mesure
const LOAD_BEFORE = 30;
const LOAD_AFTER = 60;
const CHUNK = 60;

/** Jours ouverts / fermés à la main : gardés tant que l'app tourne (remis à zéro à la fermeture). */
const openedDays = new Set<string>();
const closedDays = new Set<string>(); // pour aujourd'hui, ouvert par défaut
/** Jours ouverts à la main, du plus ancien au plus récent : le dernier est la cible du bouton +. */
const openOrder: string[] = [];
let listShown = false;

export function ListView() {
  const bottomSpace = useTabBarSpace();
  const today = todayKey();
  const list = useRef<FlatList<AgendaDay>>(null);
  const [range, setRange] = useState({ from: shiftDay(today, -LOAD_BEFORE), to: shiftDay(today, LOAD_AFTER) });
  const [opened, setOpened] = useState(() => new Set(openedDays));
  const [closed, setClosed] = useState(() => new Set(closedDays));
  // Le bouton + vise le dernier jour ouvert (sinon aujourd'hui).
  useEffect(() => {
    setSelectedDay(openOrder.at(-1) ?? null);
  }, []);
  const [justOpened, setJustOpened] = useState<string | null>(null); // seul jour dont l'ouverture s'anime
  const [heights, setHeights] = useState<Record<string, number>>({});
  // Premier jour visible (titre du mois) et éloignement d'aujourd'hui : mis à jour seulement
  // quand l'un des deux change, pour ne pas refaire l'affichage à chaque jour qui passe.
  const [top, setTop] = useState({ day: shiftDay(today, -1), away: false });
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
  const isOpen = (day: string) => (day === today ? !closed.has(day) : opened.has(day));

  // Position de chaque jour dans la liste (et longueur totale en dernière case).
  const tops: number[] = [0];
  for (const d of days) {
    const h = isOpen(d.day) ? (heights[d.day] ?? OPEN_ESTIMATE) + GAP : STEP;
    tops.push(tops[tops.length - 1] + h);
  }
  const topsSV = useSharedValue<number[]>([]);
  useLayoutEffect(() => {
    topsSV.set(tops);
  });
  const lastIndex = useSharedValue(-1);

  const todayIndex = days.findIndex((d) => d.day === today);

  // Un jour vient de passer en haut de la liste : petit cran haptique, et en-tête à jour.
  const onDayPassed = (i: number) => {
    Haptics.selectionAsync();
    const d = days[i]?.day;
    if (!d) return;
    const away = todayIndex >= 0 && Math.abs(i + 1 - todayIndex) > 3;
    if (d.slice(0, 7) !== top.day.slice(0, 7) || away !== top.away) setTop({ day: d, away });
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const t = topsSV.get();
      const y = e.contentOffset.y + 30; // un jour « passe » quand il a presque quitté le haut
      let k = 0;
      while (k < t.length - 2 && t[k + 1] <= y) k++;
      if (k !== lastIndex.get()) {
        if (lastIndex.get() !== -1) scheduleOnRN(onDayPassed, k);
        lastIndex.set(k);
      }
    },
  });

  const toggleDay = (day: string) => {
    const open = isOpen(day);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (day === today) {
      if (open) closedDays.add(day);
      else closedDays.delete(day);
      setClosed(new Set(closedDays));
    } else {
      if (open) openedDays.delete(day);
      else openedDays.add(day);
      setOpened(new Set(openedDays));
    }
    const i = openOrder.indexOf(day);
    if (i >= 0) openOrder.splice(i, 1);
    if (!open) openOrder.push(day);
    setSelectedDay(openOrder.at(-1) ?? null);
    setJustOpened(open ? null : day);
  };

  /** Appui long sur un jour : ajouter directement à cette date. */
  const addTo = (day: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/ajouter', params: { day } });
  };

  const goToday = () => {
    if (todayIndex >= 0) list.current?.scrollToOffset({ offset: tops[Math.max(0, todayIndex - 1)], animated: true });
  };
  const awayFromToday = top.away;
  const topDay = top.day;

  const getItemLayout = (_: ArrayLike<AgendaDay> | null | undefined, index: number) => ({
    length: tops[index + 1] - tops[index],
    offset: tops[index],
    index,
  });

  const lateCount = late?.length ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Link href="/anniversaires" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Anniversaires" style={styles.iconBtn}>
            <Icon name="cake" size={20} color={colors.textFaint} strokeWidth={1.4} />
          </Pressable>
        </Link>
        <Pressable
          onPress={goToday}
          disabled={!awayFromToday}
          accessibilityRole={awayFromToday ? 'button' : 'header'}
          accessibilityHint={awayFromToday ? "Revenir à aujourd'hui" : undefined}
          style={{ alignItems: 'center' }}>
          <AppText variant="display">
            {monthName(topDay)} <AppText variant="display" color={colors.textTertiary}>{yearOf(topDay)}</AppText>
          </AppText>
          {awayFromToday && (
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
          extraData={[opened, closed, justOpened]}
          initialScrollIndex={Math.max(0, (todayIndex < 0 ? 0 : todayIndex) - 1)}
          getItemLayout={getItemLayout}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          // En remontant : on ajoute des jours passés sans que la liste saute.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onStartReached={() => setRange((r) => ({ ...r, from: shiftDay(r.from, -CHUNK) }))}
          onStartReachedThreshold={3}
          onEndReached={() => setRange((r) => ({ ...r, to: shiftDay(r.to, CHUNK) }))}
          onEndReachedThreshold={3}
          windowSize={9}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: bottomSpace }}
          renderItem={({ item, index }) => {
            const open = isOpen(item.day);
            return (
              <Animated.View
                entering={animateIn ? FadeInDown.delay(Math.min(Math.abs(index - todayIndex + 1), 6) * 40).duration(300) : undefined}
                style={{ paddingBottom: GAP }}
                onLayout={
                  open
                    ? (e: LayoutChangeEvent) => {
                        const h = Math.round(e.nativeEvent.layout.height) - GAP;
                        if (heights[item.day] !== h) setHeights((m) => ({ ...m, [item.day]: h }));
                      }
                    : undefined
                }>
                <DayCard
                  day={item}
                  isToday={item.day === today}
                  open={open}
                  stats={item.day === today ? todayStats : undefined}
                  onToggle={() => toggleDay(item.day)}
                  onLongPress={() => addTo(item.day)}
                  animate={item.day === justOpened}
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

const styles = StyleSheet.create({
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
