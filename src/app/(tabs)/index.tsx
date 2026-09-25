import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { ComingSoon } from '@/components/coming-soon';
import { DayCard } from '@/components/day-card';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { type AgendaView, ViewSwitcher } from '@/components/view-switcher';
import { getAgendaDays, getDayStats, getLateItems, toggleTaskDone } from '@/db/agenda';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { monthName, shiftDay, todayKey, yearOf } from '@/lib/dates';
import { categoryColors, colors, TAB_BAR_CLEARANCE } from '@/theme/tokens';

const DAYS_BEFORE = 1;
const DAYS_AFTER = 20;

export default function AgendaScreen() {
  const today = todayKey();
  const [view, setView] = useState<AgendaView>('liste');
  const [openDay, setOpenDay] = useState<string | null>(today);
  const mutate = useDbMutation();

  const { data } = useDbQuery(
    async (db) => {
      const [days, late, stats] = await Promise.all([
        getAgendaDays(db, shiftDay(today, -DAYS_BEFORE), shiftDay(today, DAYS_AFTER)),
        getLateItems(db),
        getDayStats(db, today),
      ]);
      return { days, late, stats };
    },
    today,
  );

  const lateCount = data?.late.length ?? 0;
  const header = useMemo(
    () => (
      <View>
        {lateCount > 0 && (
          <Animated.View entering={FadeInDown.duration(400)}>
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
      </View>
    ),
    [lateCount],
  );

  return (
    <Screen>
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

      <ViewSwitcher value={view} onChange={setView} />

      {view === 'liste' ? (
        <FlatList
          data={data?.days ?? []}
          keyExtractor={(d) => d.day}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: TAB_BAR_CLEARANCE, gap: 8 }}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 70).duration(450)}>
              <DayCard
                day={item}
                isToday={item.day === today}
                open={openDay === item.day}
                stats={item.day === today ? data?.stats : undefined}
                onToggle={() => setOpenDay((cur) => (cur === item.day ? null : item.day))}
                onItemPress={(it) => {
                  if (it.kind === 'task') mutate((db) => toggleTaskDone(db, it.id));
                }}
              />
            </Animated.View>
          )}
        />
      ) : (
        <View style={{ paddingTop: 8 }}>
          <ComingSoon
            icon="calendar"
            color={categoryColors.work}
            title={`Vue ${view}`}
            text="Cette vue arrive à l'étape suivante, avec le balayage gauche/droite pour changer de période."
          />
        </View>
      )}
    </Screen>
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
