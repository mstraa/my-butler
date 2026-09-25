import { router } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { type CarouselHandle, PeriodCarousel } from '@/components/agenda/period-carousel';
import { PeriodHeader } from '@/components/agenda/period-header';
import { useItemPress } from '@/components/agenda/use-item-press';
import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { useTabBarSpace } from '@/components/tab-bar';
import { type AgendaItem, getAgendaDays, getGoalRatios, getWeekGoals } from '@/db/agenda';
import { useDbQuery } from '@/db/use-query';
import {
  dayOf, isoWeek, minutesOf, timeOf, todayKey, weekDays, weekdayShort, weekFromIndex, weekIndex, weekRangeLabel,
} from '@/lib/dates';
import { useNow } from '@/lib/use-now';
import { colors, fonts, withAlpha } from '@/theme/tokens';

type Props = {
  focus: string;
  onShift: (dir: -1 | 1) => void;
  onPickDay: (day: string) => void;
  onToday: () => void;
};

const HOUR = 34; // hauteur d'une heure dans la grille
const HOURS_COL = 28;
// Grille de hauteur fixe : 8 h – 20 h par défaut. Si un rdv commence plus tôt ou finit
// plus tard, la plage s'élargit et les heures se resserrent pour tenir dans la même hauteur.
const DAY_START = 8;
const DAY_END = 20;
const HEAD_H = 66;
const GRID_H = (DAY_END - DAY_START) * HOUR;
const CARD_H = HEAD_H + 1 + GRID_H + 2;

type Block = { item: AgendaItem; top: number; height: number; lane: number; lanes: number };

/** Vue Semaine : grille horaire des 7 jours, qui suit le doigt d'une semaine à l'autre. */
export function WeekView({ focus, onShift, onPickDay, onToday }: Props) {
  const today = todayKey();
  const carousel = useRef<CarouselHandle>(null);
  const days = weekDays(focus);

  return (
    <View style={{ flex: 1 }}>
      <PeriodHeader
        title={weekRangeLabel(focus)}
        subtitle={`Semaine ${isoWeek(focus)}`}
        prevLabel="Semaine précédente"
        nextLabel="Semaine suivante"
        onShift={(dir) => carousel.current?.slide(dir)}
        onToday={days.includes(today) ? undefined : onToday}
      />

      <View style={{ height: CARD_H }}>
        <PeriodCarousel
          ref={carousel}
          index={weekIndex(focus)}
          onShift={onShift}
          renderPage={(i) => <WeekPage weekStart={weekFromIndex(i)} onPickDay={onPickDay} />}
        />
      </View>

      <WeekGoals weekStart={days[0]} />
    </View>
  );
}

/** « Objectifs de la semaine », même carte que le résumé du jour de la vue Mois. */
function WeekGoals({ weekStart }: { weekStart: string }) {
  const today = todayKey();
  const bottomSpace = useTabBarSpace();
  const days = weekDays(weekStart);
  const { data: goals } = useDbQuery((db) => getWeekGoals(db, days[0], days[6], today), days[0], { cacheId: 'objectifs-semaine' });

  return (
    <Animated.View key={weekStart} entering={FadeIn.duration(150)} style={[styles.summary, { marginBottom: bottomSpace }]}>
      <View style={styles.summaryHead}>
        <AppText variant="title" style={{ flex: 1 }}>
          Objectifs de la semaine
        </AppText>
        <Pressable onPress={() => router.navigate('/objectifs')} accessibilityRole="button" style={styles.openBtn}>
          <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>Voir ›</AppText>
        </Pressable>
      </View>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
        {goals?.map((g) => (
          <View key={g.id} style={styles.goalRow}>
            <View style={[styles.goalIcon, { backgroundColor: withAlpha(g.color, 0.13) }]}>
              <Icon name="target" size={16} color={g.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <AppText variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
                  {g.title}
                </AppText>
                <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 15 }}>
                  {g.valueText} <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 15 }} color={colors.textTertiary}>/ {g.targetText}</AppText>
                </AppText>
              </View>
              <View style={styles.goalTrack}>
                <View style={[styles.goalFill, { width: `${Math.round(g.ratio * 100)}%`, backgroundColor: g.color }]} />
              </View>
            </View>
          </View>
        ))}
        {goals && goals.length === 0 && (
          <AppText variant="body" color={colors.textTertiary}>
            Aucun objectif pour l&apos;instant.
          </AppText>
        )}
      </ScrollView>
    </Animated.View>
  );
}

/** Une semaine : en-têtes des jours + grille horaire. Chaque page charge ses données. */
function WeekPage({ weekStart, onPickDay }: { weekStart: string; onPickDay: (day: string) => void }) {
  const today = todayKey();
  const now = useNow();
  const days = weekDays(weekStart);
  const onItemPress = useItemPress();

  const { data } = useDbQuery(async (db) => {
    const [agenda, ratios] = await Promise.all([getAgendaDays(db, days[0], days[6]), getGoalRatios(db, days[0], days[6])]);
    return { agenda, ratios };
  }, days[0], { cacheId: 'semaine' });

  // Plage horaire : 8 h – 20 h, élargie si un rdv en sort (la hauteur visible ne change pas).
  let minH = DAY_START;
  let maxH = DAY_END;
  for (const d of data?.agenda ?? []) {
    for (const it of d.items) {
      if (it.allDay || !it.start || it.kind === 'birthday') continue;
      const s = minutesOf(timeOf(it.start));
      const e = endMinutes(it);
      minH = Math.min(minH, Math.floor(s / 60));
      maxH = Math.max(maxH, Math.min(24, Math.ceil(e / 60)));
    }
  }
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const hourH = GRID_H / hours.length; // hauteur d'une heure pour cette semaine
  const nowTop = ((minutesOf(timeOf(now)) - minH * 60) / 60) * hourH;
  const showNow = days.includes(dayOf(now)) && nowTop >= 0 && nowTop <= GRID_H;

  return (
        <View style={styles.card}>
          {/* En-têtes des jours */}
          <View style={styles.headRow}>
            <View style={{ width: HOURS_COL }} />
            {days.map((d, i) => {
              const isToday = d === today;
              const ratio = data?.ratios.get(d) ?? 0;
              const allDay = data?.agenda[i]?.items.filter((it) => it.allDay || it.kind === 'birthday') ?? [];
              return (
                <Pressable
                  key={d}
                  onPress={() => onPickDay(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`${weekdayShort(d)} ${Number(d.slice(8))}, objectifs ${Math.round(ratio * 100)} %${isToday ? ", aujourd'hui" : ''}`}
                  style={[styles.headCell, isToday && { backgroundColor: colors.text }]}>
                  <AppText variant="caption" style={{ fontSize: 11 }} color={isToday ? '#4A4A4F' : colors.textTertiary}>
                    {weekdayShort(d).charAt(0).toUpperCase()}
                  </AppText>
                  <AppText
                    style={{ fontFamily: isToday ? fonts.displayMedium : fonts.displayMedium, fontSize: 16 }}
                    color={isToday ? colors.onLight : colors.text}>
                    {Number(d.slice(8))}
                  </AppText>
                  <View style={[styles.track, { backgroundColor: isToday ? '#C4C4CA' : colors.border }]}>
                    <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: isToday ? colors.onLight : colors.text }]} />
                  </View>
                  <View style={styles.allDayDots}>
                    {allDay.slice(0, 3).map((it) => (
                      <View key={it.key} style={[styles.allDayDot, { backgroundColor: isToday ? colors.onLight : it.color }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Grille horaire */}
          <View>
            <View style={{ flexDirection: 'row', height: GRID_H }}>
              <View style={{ width: HOURS_COL }}>
                {hours.map((h) => (
                  <AppText key={h} style={[styles.hourLabel, { height: hourH }]}>
                    {h}
                  </AppText>
                ))}
              </View>
              {days.map((d, i) => {
                const isToday = d === today;
                const blocks = layoutDay(data?.agenda[i]?.items ?? [], minH, hourH);
                return (
                  <View key={d} style={[styles.col, isToday && { backgroundColor: '#1F1F23' }]}>
                    {hours.map((h) => (
                      <View key={h} style={[styles.hourLine, { height: hourH }]} />
                    ))}
                    {blocks.map((b, j) => (
                      <Animated.View
                        key={b.item.key}
                        
                        style={{
                          position: 'absolute',
                          top: b.top,
                          height: b.height,
                          left: `${(b.lane / b.lanes) * 100}%`,
                          width: `${100 / b.lanes}%`,
                          paddingHorizontal: 1,
                        }}>
                        <EventBlock block={b} onPress={() => onItemPress(b.item)} />
                      </Animated.View>
                    ))}
                    {isToday && showNow && (
                      <Animated.View pointerEvents="none" style={[styles.nowLine, { top: nowTop }]}>
                        <View style={styles.nowDot} />
                      </Animated.View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
  );
}

function EventBlock({ block, onPress }: { block: Block; onPress: () => void }) {
  const it = block.item;
  const isTask = it.kind === 'task';
  const look = it.cancelled
    ? { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: '#4A4A50' }
    : isTask
      ? { borderWidth: 1, borderColor: withAlpha(it.color, 0.6), backgroundColor: withAlpha(it.color, 0.08) }
      : { backgroundColor: withAlpha(it.color, 0.18) };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${it.title}, ${it.time}${it.cancelled ? ', annulé' : ''}`}
      style={[styles.block, look, it.done && { opacity: 0.5 }]}>
      <AppText
        numberOfLines={block.height > 40 ? 2 : 1}
        style={[
          { fontFamily: fonts.bodySemiBold, fontSize: 10, lineHeight: 12 },
          (it.cancelled || it.done) && { textDecorationLine: 'line-through' },
        ]}
        color={it.cancelled ? colors.textTertiary : it.color}>
        {it.title}
      </AppText>
    </Pressable>
  );
}

function endMinutes(it: AgendaItem) {
  const s = minutesOf(timeOf(it.start));
  if (it.kind === 'task') return s + 30;
  if (it.end && dayOf(it.end) === dayOf(it.start!)) return Math.max(minutesOf(timeOf(it.end)), s + 20);
  if (it.end) return 24 * 60;
  return s + 60;
}

/** Place les éléments horaires d'un jour ; ceux qui se chevauchent se partagent la largeur. */
function layoutDay(items: AgendaItem[], minH: number, hourH: number): Block[] {
  const timed = items
    .filter((it) => !it.allDay && it.start && it.kind !== 'birthday')
    .map((it) => ({ it, s: minutesOf(timeOf(it.start)), e: endMinutes(it) }))
    .sort((a, b) => a.s - b.s);
  const out: Block[] = [];
  let group: { it: AgendaItem; s: number; e: number; lane: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) {
      out.push({
        item: g.it,
        top: ((g.s - minH * 60) / 60) * hourH + 1,
        height: Math.max(((g.e - g.s) / 60) * hourH - 2, 14),
        lane: g.lane,
        lanes,
      });
    }
    group = [];
  };
  for (const t of timed) {
    if (t.s >= groupEnd && group.length) flush();
    const laneEnds: number[] = [];
    for (const g of group) laneEnds[g.lane] = Math.max(laneEnds[g.lane] ?? 0, g.e);
    let lane = laneEnds.findIndex((end) => end <= t.s);
    if (lane === -1) lane = laneEnds.length;
    group.push({ ...t, lane });
    groupEnd = Math.max(groupEnd, t.e);
  }
  if (group.length) flush();
  return out;
}

const styles = StyleSheet.create({
  summary: {
    flexShrink: 1,
    minHeight: 110,
    marginHorizontal: 16,
    marginTop: 12,
    gap: 12,
    padding: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openBtn: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderRadius: 999,
  },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  goalTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  goalFill: { height: 4, borderRadius: 2 },
  card: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    overflow: 'hidden',
  },
  headRow: { height: HEAD_H, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  headCell: { flex: 1, alignItems: 'center', gap: 3, marginHorizontal: 2, paddingTop: 6, paddingBottom: 5, borderRadius: 14 },
  track: { width: 18, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2 },
  allDayDots: { flexDirection: 'row', gap: 2, height: 4 },
  allDayDot: { width: 4, height: 4, borderRadius: 2 },
  hourLabel: {
    paddingTop: 2,
    paddingLeft: 6,
    fontFamily: fonts.displayMedium,
    fontSize: 10,
    color: colors.textTertiary,
  },
  col: { flex: 1, borderLeftWidth: 1, borderLeftColor: colors.row },
  hourLine: { borderBottomWidth: 1, borderBottomColor: colors.row },
  block: { flex: 1, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 3, overflow: 'hidden' },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.text },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text },
});
