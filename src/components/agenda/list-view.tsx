import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DayCard } from '@/components/agenda/day-card';
import { useItemPress } from '@/components/agenda/use-item-press';
import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { type AgendaDay, getAgendaDays, getDayStats, getLateItems } from '@/db/agenda';
import { useDbQuery } from '@/db/use-query';
import { monthName, shiftDay, todayKey, yearOf } from '@/lib/dates';
import { colors, fonts, TAB_BAR_CLEARANCE } from '@/theme/tokens';

/*
 * Vue Liste en « roue » : le jour en haut de la liste est le jour sélectionné (ouvert).
 * En défilant, la sélection change d'un jour à l'autre et la liste s'arrête toujours
 * sur un jour. Les jours passés se chargent au fur et à mesure en remontant.
 *
 * Géométrie : chaque jour fermé occupe STEP px (carte de 92 + 8 d'espace). Tous les jours
 * au-dessus du jour sélectionné sont fermés, donc le jour n°i est ouvert quand le défilement
 * vaut i × STEP : la sélection se déduit directement du défilement, sans effet de bord.
 */
const CLOSED = 92;
const GAP = 8;
const STEP = CLOSED + GAP;
const LOAD_BEFORE = 30; // jours chargés avant aujourd'hui au départ
const LOAD_AFTER = 60;
const CHUNK = 60; // jours ajoutés quand on approche d'un bord

let listShown = false;

export function ListView({ switcher }: { switcher: React.ReactNode }) {
  const today = todayKey();
  const list = useRef<FlatList<AgendaDay>>(null);
  const [range, setRange] = useState({ from: shiftDay(today, -LOAD_BEFORE), to: shiftDay(today, LOAD_AFTER) });
  const [selected, setSelected] = useState(today);
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

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!days.length) return;
    const i = Math.min(days.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / STEP)));
    const day = days[i].day;
    if (day !== selected) {
      Haptics.selectionAsync();
      setSelected(day);
    }
  };

  const scrollToDay = (day: string, animated = true) => {
    const i = days.findIndex((d) => d.day === day);
    if (i >= 0) list.current?.scrollToOffset({ offset: i * STEP, animated });
  };

  // Positions exactes : fermés au-dessus de la sélection, hauteur mesurée pour le jour ouvert.
  const getItemLayout = (_: ArrayLike<AgendaDay> | null | undefined, index: number) => {
    if (index < selIndex) return { length: STEP, offset: index * STEP, index };
    if (index === selIndex) return { length: openHeight + GAP, offset: index * STEP, index };
    return { length: STEP, offset: selIndex * STEP + openHeight + GAP + (index - selIndex - 1) * STEP, index };
  };

  const lateCount = late?.length ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={{ width: 44 }} />
        <Pressable
          onPress={() => {
            setInteracted(true);
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
        <FlatList
          ref={list}
          data={days}
          keyExtractor={(d) => d.day}
          initialScrollIndex={selIndex}
          getItemLayout={getItemLayout}
          onScroll={onScroll}
          onScrollBeginDrag={() => setInteracted(true)}
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
            const open = item.day === selected;
            return (
              <Animated.View
                entering={animateIn ? FadeInDown.delay(Math.min(Math.abs(index - selIndex), 6) * 40).duration(300) : undefined}
                style={{ paddingBottom: GAP }}
                onLayout={open ? (e: LayoutChangeEvent) => setOpenHeight(Math.round(e.nativeEvent.layout.height) - GAP) : undefined}>
                <DayCard
                  day={item}
                  isToday={item.day === today}
                  open={open}
                  stats={open ? stats : undefined}
                  onToggle={() => {
                    setInteracted(true);
                    scrollToDay(item.day);
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
