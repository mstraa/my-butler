import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight, ZoomIn } from 'react-native-reanimated';

import { ItemRow } from '@/components/agenda/day-card';
import { PeriodHeader } from '@/components/agenda/period-header';
import { SwipePager } from '@/components/agenda/swipe-pager';
import { useItemPress } from '@/components/agenda/use-item-press';
import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { getAgendaDays, getDayStats, getGoalRatios } from '@/db/agenda';
import { useDbQuery } from '@/db/use-query';
import { mediumDayLabel, monthGrid, monthName, monthStart, shortDayLabel, todayKey, yearOf } from '@/lib/dates';
import { colors, fonts, TAB_BAR_CLEARANCE } from '@/theme/tokens';

type Props = {
  focus: string;
  direction: -1 | 0 | 1;
  onShift: (dir: -1 | 1) => void;
  onSelect: (day: string) => void;
  onOpenDay: (day: string) => void;
  onToday: () => void;
  switcher: React.ReactNode;
};

const LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Vue Mois : jours en pastilles, résumé du jour choisi sous la grille. */
export function MonthView({ focus, direction, onShift, onSelect, onOpenDay, onToday, switcher }: Props) {
  const today = todayKey();
  const month = monthStart(focus);
  const grid = monthGrid(focus);
  const onItemPress = useItemPress();

  const { data } = useDbQuery(async (db) => {
    const [agenda, ratios] = await Promise.all([
      getAgendaDays(db, grid[0], grid[grid.length - 1]),
      getGoalRatios(db, grid[0], grid[grid.length - 1]),
    ]);
    return { key: month, agenda, ratios };
  }, month);

  const { data: stats } = useDbQuery((db) => getDayStats(db, focus), focus);

  const byDay = new Map((data?.agenda ?? []).map((d) => [d.day, d.items]));
  const selected = byDay.get(focus) ?? [];
  const nRdv = selected.filter((i) => i.kind === 'event' && !i.cancelled).length;
  const nTask = selected.filter((i) => i.kind === 'task').length;
  const nBday = selected.filter((i) => i.kind === 'birthday').length;
  const parts = [
    nRdv ? `${nRdv} rdv` : null,
    nTask ? `${nTask} tâche${nTask > 1 ? 's' : ''}` : null,
    nBday ? `${nBday} anniversaire${nBday > 1 ? 's' : ''}` : null,
  ].filter(Boolean) as string[];
  const title = `${shortDayLabel(focus)}${parts.length ? ` · ${joinFr(parts)}` : ''}`;
  const goals = stats?.goalsTotal ? ` · objectifs ${stats.goalsMet}/${stats.goalsTotal}` : '';
  const sub = `${focus === today ? "Aujourd'hui" : mediumDayLabel(focus)}${goals}`;

  return (
    <View style={{ flex: 1 }}>
      <PeriodHeader
        title={monthName(focus)}
        titleMuted={yearOf(focus)}
        prevLabel="Mois précédent"
        nextLabel="Mois suivant"
        onShift={onShift}
        onToday={monthStart(today) === month ? undefined : onToday}
      />
      {switcher}

      <SwipePager pageKey={data?.key} direction={direction} onShift={onShift}>
        <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.letters} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {LETTERS.map((l, i) => (
                <AppText key={i} variant="caption" style={styles.letter}>
                  {l}
                </AppText>
              ))}
            </View>
            <View style={styles.grid}>
              {grid.map((d, i) => {
                const inMonth = d.slice(0, 7) === month.slice(0, 7);
                const items = byDay.get(d) ?? [];
                const isToday = d === today;
                const isSel = d === focus && !isToday;
                const allGoals = d < today && (data?.ratios.get(d) ?? 0) >= 1;
                const nEvents = items.filter((x) => x.kind === 'event' && !x.cancelled).length;
                return (
                  <Animated.View key={d} entering={ZoomIn.delay(100 + i * 10).duration(300)} style={styles.cell}>
                    {inMonth ? (
                      <>
                        <Pressable
                          onPress={() => onSelect(d)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: d === focus }}
                          accessibilityLabel={`${mediumDayLabel(d)}${nEvents ? `, ${nEvents} rendez-vous` : ''}${isToday ? ", aujourd'hui" : ''}`}
                          style={[
                            styles.pill,
                            allGoals && { backgroundColor: '#2E2E33' },
                            isToday && { backgroundColor: colors.text },
                            isSel && { borderWidth: 1.5, borderColor: colors.text },
                          ]}>
                          <AppText
                            style={{ fontFamily: isToday ? fonts.bodyBold : fonts.displayMedium, fontSize: 15 }}
                            color={isToday ? colors.onLight : colors.text}>
                            {Number(d.slice(8))}
                          </AppText>
                        </Pressable>
                        <View style={styles.dots}>
                          {items.slice(0, 3).map((x) => (
                            <View
                              key={x.key}
                              style={[styles.dot, x.cancelled ? { borderWidth: 1, borderColor: colors.textTertiary } : { backgroundColor: x.color }]}
                            />
                          ))}
                        </View>
                      </>
                    ) : (
                      <View style={styles.pill}>
                        <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 15 }} color={colors.textMuted}>
                          {Number(d.slice(8))}
                        </AppText>
                      </View>
                    )}
                  </Animated.View>
                );
              })}
            </View>
          </View>

          <View style={styles.legend}>
            <Legend swatch={<View style={{ flexDirection: 'row', gap: 2 }}><View style={[styles.dot, { backgroundColor: '#4FD1D9' }]} /><View style={[styles.dot, { backgroundColor: '#FF9A3C' }]} /></View>} label="Rendez-vous" />
            <Legend swatch={<View style={[styles.dot, { borderWidth: 1, borderColor: colors.textTertiary }]} />} label="Annulé" />
            <Legend swatch={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#2E2E33' }} />} label="Objectifs atteints" />
          </View>

          <Animated.View key={focus} entering={FadeInDown.duration(350)} style={styles.summary} accessibilityLiveRegion="polite">
            <View style={styles.summaryHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="title">{title}</AppText>
                <AppText variant="caption" style={{ marginTop: 2 }}>
                  {sub}
                </AppText>
              </View>
              <Pressable onPress={() => onOpenDay(focus)} accessibilityRole="button" style={styles.openBtn}>
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>Ouvrir le jour ›</AppText>
              </Pressable>
            </View>
            <View style={{ gap: 6 }}>
              {selected.map((it, j) => (
                <Animated.View key={it.key} entering={FadeInRight.delay(80 + j * 60).duration(350)}>
                  <ItemRow item={it} onPress={onItemPress} />
                </Animated.View>
              ))}
              {selected.length === 0 && (
                <Pressable
                  onPress={() => router.push({ pathname: '/rdv/nouveau', params: { day: focus } })}
                  accessibilityRole="button"
                  style={styles.empty}>
                  <AppText variant="body" color={colors.textTertiary}>
                    Rien de prévu
                  </AppText>
                  <Icon name="plus" size={14} color={colors.textTertiary} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </SwipePager>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {swatch}
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

/** ['2 rdv', '1 tâche', '1 anniversaire'] → '2 rdv, 1 tâche et 1 anniversaire' */
const joinFr = (p: string[]) => (p.length <= 1 ? p.join('') : `${p.slice(0, -1).join(', ')} et ${p[p.length - 1]}`);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 6,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  letters: { flexDirection: 'row', height: 26, alignItems: 'center' },
  letter: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyMedium },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 50, alignItems: 'center', gap: 3 },
  pill: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginHorizontal: 20, marginTop: 10 },
  summary: {
    marginHorizontal: 16,
    marginTop: 12,
    gap: 12,
    padding: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  openBtn: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderRadius: 999,
  },
  empty: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: 14,
  },
});
