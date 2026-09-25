import { Link } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DayCard } from '@/components/agenda/day-card';
import { useItemPress } from '@/components/agenda/use-item-press';
import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { getAgendaDays, getDayStats, getLateItems } from '@/db/agenda';
import { useDbQuery } from '@/db/use-query';
import { monthName, shiftDay, todayKey, yearOf } from '@/lib/dates';
import { colors, TAB_BAR_CLEARANCE } from '@/theme/tokens';

const DAYS_BEFORE = 1;
const DAYS_AFTER = 20;
let listShown = false;

/** Vue principale : les jours défilent, chacun se déplie ou se replie. */
export function ListView({ switcher }: { switcher: React.ReactNode }) {
  const today = todayKey();
  const [openDay, setOpenDay] = useState<string | null>(today);
  const onItemPress = useItemPress();

  const { data } = useDbQuery(async (db) => {
    const [days, late, stats] = await Promise.all([
      getAgendaDays(db, shiftDay(today, -DAYS_BEFORE), shiftDay(today, DAYS_AFTER)),
      getLateItems(db),
      getDayStats(db, today),
    ]);
    return { days, late, stats };
  }, today, { cacheId: 'liste' });
  // Animation d'entrée des cartes : seulement au premier affichage de l'app, pas à chaque retour.
  const [animateIn] = useState(() => {
    const first = !listShown;
    listShown = true;
    return first;
  });
  const [toggled, setToggled] = useState(false);

  const lateCount = data?.late.length ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={{ width: 44 }} />
        <AppText variant="display" accessibilityRole="header">
          {monthName(today)} <AppText variant="display" color={colors.textTertiary}>{yearOf(today)}</AppText>
        </AppText>
        <Link href="/reglages" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Réglages" style={styles.iconBtn}>
            <Icon name="gear" size={20} color={colors.textFaint} strokeWidth={1.4} />
          </Pressable>
        </Link>
      </View>

      {switcher}

      <FlatList
        data={data?.days ?? []}
        keyExtractor={(d) => d.day}
        ListHeaderComponent={
          lateCount > 0 ? (
            <Animated.View entering={animateIn ? FadeInDown.duration(300) : undefined}>
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
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: TAB_BAR_CLEARANCE, gap: 8 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={animateIn ? FadeInDown.delay(Math.min(index, 6) * 40).duration(300) : undefined}>
            <DayCard
              day={item}
              isToday={item.day === today}
              open={openDay === item.day}
              stats={item.day === today ? data?.stats : undefined}
              onToggle={() => {
                setToggled(true);
                setOpenDay((cur) => (cur === item.day ? null : item.day));
              }}
              animate={toggled}
              onItemPress={onItemPress}
            />
          </Animated.View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 60,
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
