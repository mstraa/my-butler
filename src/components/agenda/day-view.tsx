import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { PeriodHeader } from '@/components/agenda/period-header';
import { SwipePager } from '@/components/agenda/swipe-pager';
import { useItemPress } from '@/components/agenda/use-item-press';
import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { type AgendaItem, getAgendaDays, getDayStats } from '@/db/agenda';
import { useDbQuery } from '@/db/use-query';
import { dayOf, longDayTitle, minutesOf, monthName, timeOf, todayKey, weekDays, weekdayShort } from '@/lib/dates';
import { useNow } from '@/lib/use-now';
import { colors, fonts, TAB_BAR_CLEARANCE, withAlpha } from '@/theme/tokens';

type Props = {
  focus: string;
  direction: -1 | 0 | 1;
  onShift: (dir: -1 | 1) => void;
  onPickDay: (day: string) => void;
  onToday: () => void;
  switcher: React.ReactNode;
};

/** Vue Jour : bande de la semaine + timeline du jour sur une feuille blanche. */
export function DayView({ focus, direction, onShift, onPickDay, onToday, switcher }: Props) {
  const today = todayKey();
  const now = useNow();
  const week = weekDays(focus);
  const onItemPress = useItemPress();

  const { data } = useDbQuery(async (db) => {
    const [days, stats] = await Promise.all([getAgendaDays(db, week[0], week[6]), getDayStats(db, focus)]);
    return { key: focus, days, stats };
  }, focus);

  const day = data?.days.find((d) => d.day === focus);
  const items = day?.items ?? [];
  const nRdv = items.filter((i) => i.kind === 'event' && !i.cancelled).length;
  const nTask = items.filter((i) => i.kind === 'task').length;
  const summary = [
    nRdv ? `${nRdv} rdv` : null,
    nTask ? `${nTask} tâche${nTask > 1 ? 's' : ''}` : null,
    data?.stats.goalsTotal ? `${data.stats.goalsMet}/${data.stats.goalsTotal} objectifs` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const sub = `${monthName(focus).toLowerCase()}${focus === today ? " · aujourd'hui" : ''}`;

  return (
    <View style={{ flex: 1 }}>
      <PeriodHeader
        title={longDayTitle(focus)}
        subtitle={sub}
        prevLabel="Jour précédent"
        nextLabel="Jour suivant"
        onShift={onShift}
        onToday={focus !== today ? onToday : undefined}
      />
      {switcher}

      <View style={styles.strip}>
        {week.map((d) => {
          const on = d === focus;
          const first = data?.days.find((x) => x.day === d)?.items.find((i) => !i.cancelled);
          return (
            <Pressable
              key={d}
              onPress={() => onPickDay(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${longDayTitle(d)}${d === today ? ", aujourd'hui" : ''}`}
              style={[styles.stripDay, on && styles.stripDayOn]}>
              <AppText variant="caption" color={on ? '#4A4A4F' : colors.textTertiary}>
                {cap(weekdayShort(d).replace('.', ''))}
              </AppText>
              <AppText
                style={{ fontFamily: on ? fonts.bodyBold : fonts.bodySemiBold, fontSize: 17 }}
                color={on ? colors.onLight : colors.text}>
                {Number(d.slice(8, 10))}
              </AppText>
              <View style={[styles.stripDot, { backgroundColor: on ? colors.onLight : first ? first.color : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>

      <SwipePager pageKey={data?.key} direction={direction} onShift={onShift}>
        <Animated.View
          entering={direction === 0 ? SlideInDown.springify().damping(22).stiffness(200) : undefined}
          style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <AppText variant="title" color={colors.sheetText} style={{ fontSize: 22 }}>
              {focus === today ? 'Ma journée' : 'La journée'}
            </AppText>
            <AppText variant="caption" color={colors.sheetTextSecondary} style={{ fontSize: 13 }}>
              {summary}
            </AppText>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE, paddingTop: 4 }}>
            {data && (
              <Timeline
                items={items}
                wokeAt={data.stats.wokeAt}
                now={now}
                isToday={focus === today}
                isPast={focus < today}
                onItemPress={onItemPress}
                onAdd={() => router.push({ pathname: '/rdv/nouveau', params: { day: focus } })}
              />
            )}
          </ScrollView>
        </Animated.View>
      </SwipePager>
    </View>
  );
}

type NodeState = 'past' | 'current' | 'future' | 'cancelled' | 'task' | 'taskDone' | 'birthday';

function Timeline({
  items, wokeAt, now, isToday, isPast, onItemPress, onAdd,
}: {
  items: AgendaItem[];
  wokeAt: string | null;
  now: string;
  isToday: boolean;
  isPast: boolean;
  onItemPress: (i: AgendaItem) => void;
  onAdd: () => void;
}) {
  const nowMin = minutesOf(timeOf(now));

  const stateOf = (it: AgendaItem): NodeState => {
    if (it.kind === 'birthday') return 'birthday';
    if (it.kind === 'task') return it.done ? 'taskDone' : 'task';
    if (it.cancelled) return 'cancelled';
    if (isPast) return 'past';
    if (!isToday || it.allDay || !it.start) return 'future';
    const s = minutesOf(timeOf(it.start));
    const e = it.end && dayOf(it.end) === dayOf(it.start) ? minutesOf(timeOf(it.end)) : s + 60;
    if (nowMin >= e) return 'past';
    if (nowMin >= s) return 'current';
    return 'future';
  };

  const remaining = (it: AgendaItem) => {
    if (!it.start) return '';
    const e = it.end ? minutesOf(timeOf(it.end)) : minutesOf(timeOf(it.start)) + 60;
    const m = e - nowMin;
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
  };

  return (
    <View style={{ paddingHorizontal: 20 }}>
      {(items.length > 0 || wokeAt) && <View style={styles.rail} />}
      <View style={{ gap: 10 }}>
        {wokeAt && (
          <Row delay={150} node={<DoneNode />}>
            <View style={[styles.card, styles.cardLight]}>
              <AppText variant="bodyStrong" color={colors.sheetTextSecondary} style={{ fontSize: 15, flex: 1 }}>
                Levé
              </AppText>
              <AppText variant="number" color={colors.sheetTextSecondary} style={{ fontSize: 14 }}>
                {wokeAt}
              </AppText>
            </View>
          </Row>
        )}
        {items.map((it, i) => {
          const st = stateOf(it);
          return (
            <Row key={it.key} delay={250 + i * 80} node={<Node state={st} color={it.color} />}>
              <ItemCard item={it} state={st} remaining={st === 'current' ? remaining(it) : ''} onPress={() => onItemPress(it)} />
            </Row>
          );
        })}
      </View>

      {items.length === 0 && (
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.empty}>
          <AppText variant="bodyMedium" color={colors.sheetTextSecondary}>
            Rien de prévu
          </AppText>
          <Pressable onPress={onAdd} accessibilityRole="button" style={styles.emptyBtn}>
            <Icon name="plus" size={16} color={colors.sheetText} strokeWidth={2} />
            <AppText variant="label" color={colors.sheetText}>
              Ajouter un rendez-vous
            </AppText>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

function Row({ delay, node, children }: { delay: number; node: React.ReactNode; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(450)} style={{ flexDirection: 'row', gap: 16 }}>
      <View style={{ width: 16, paddingTop: 16, alignItems: 'center' }}>{node}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </Animated.View>
  );
}

function ItemCard({ item, state, remaining, onPress }: { item: AgendaItem; state: NodeState; remaining: string; onPress: () => void }) {
  const time = item.kind === 'task' ? (item.time ? `avant ${item.time.slice(1)}` : '') : item.time || (item.allDay ? 'journée' : '');

  if (state === 'current') {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={[styles.card, styles.cardCurrent]}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.cardTop}>
            <AppText variant="bodyStrong" style={{ fontFamily: fonts.bodyBold, fontSize: 17, flex: 1 }} numberOfLines={1}>
              {item.title}
            </AppText>
            <AppText variant="number" style={{ fontSize: 14 }}>
              {time}
            </AppText>
          </View>
          {(item.location || item.end) && (
            <AppText variant="caption" color={colors.textSecondary} style={{ fontSize: 13 }}>
              {[item.location, item.end ? `jusqu'à ${timeOf(item.end)}` : null].filter(Boolean).join(' · ')}
            </AppText>
          )}
          <AppText variant="caption" style={{ marginTop: 2 }}>
            en cours · {remaining} restantes
          </AppText>
        </View>
      </Pressable>
    );
  }

  const isTask = state === 'task' || state === 'taskDone';
  const cancelled = state === 'cancelled';
  const muted = cancelled || state === 'taskDone' || state === 'past';
  return (
    <Pressable
      onPress={onPress}
      disabled={item.kind === 'birthday'}
      accessibilityRole={isTask ? 'checkbox' : 'button'}
      accessibilityState={isTask ? { checked: item.done } : undefined}
      style={[
        styles.card,
        isTask ? styles.cardTask : state === 'birthday' ? { backgroundColor: withAlpha(item.color, 0.1) } : styles.cardLight,
        cancelled && styles.cardCancelled,
      ]}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.cardTop}>
          <AppText
            variant="bodyStrong"
            numberOfLines={1}
            color={muted ? '#6B6B70' : colors.sheetText}
            style={[{ fontSize: 15, flex: 1 }, (cancelled || state === 'taskDone') && { textDecorationLine: 'line-through' }]}>
            {item.title}
          </AppText>
          <AppText variant="number" color={colors.sheetTextSecondary} style={{ fontSize: 14 }}>
            {cancelled ? 'annulé' : time}
          </AppText>
        </View>
        {!cancelled && state !== 'birthday' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!isTask && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />}
            <AppText variant="caption" color={colors.sheetTextSecondary}>
              {isTask ? (item.done ? 'Tâche faite' : 'Tâche') : [item.location, item.end ? `→ ${timeOf(item.end)}` : null].filter(Boolean).join(' · ') || 'Rendez-vous'}
            </AppText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Node({ state, color }: { state: NodeState; color: string }) {
  if (state === 'past') return <DoneNode />;
  if (state === 'current') return <PulseNode color={color} />;
  if (state === 'task' || state === 'taskDone')
    return (
      <View style={[styles.node, { borderRadius: 5, borderWidth: 2, borderColor: colors.sheetText, backgroundColor: state === 'taskDone' ? colors.sheetText : '#fff' }]}>
        {state === 'taskDone' && <Icon name="check" size={10} color="#fff" strokeWidth={4} />}
      </View>
    );
  if (state === 'birthday') return <View style={[styles.node, { backgroundColor: color }]} />;
  return (
    <View
      style={[styles.node, { backgroundColor: '#fff', borderWidth: 2, borderColor: '#C4C4CA', borderStyle: state === 'cancelled' ? 'dashed' : 'solid' }]}
    />
  );
}

function DoneNode() {
  return (
    <View style={[styles.node, { backgroundColor: colors.sheetText }]}>
      <Icon name="check" size={10} color="#fff" strokeWidth={4} />
    </View>
  );
}

function PulseNode({ color }: { color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1800 }), -1, false);
  }, [p]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - p.value), transform: [{ scale: 1 + p.value * 1.4 }] }));
  return (
    <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: color }, halo]} />
      <View style={[styles.node, { backgroundColor: color, borderWidth: 3, borderColor: '#fff' }]} />
    </View>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12 },
  stripDay: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 18 },
  stripDayOn: { backgroundColor: colors.text },
  stripDot: { width: 4, height: 4, borderRadius: 2 },
  sheet: {
    flex: 1,
    paddingTop: 10,
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8' },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  rail: { position: 'absolute', left: 27, top: 18, bottom: 24, width: 2, backgroundColor: colors.sheetBorder },
  node: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  card: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cardLight: { backgroundColor: '#F4F4F5' },
  cardTask: { backgroundColor: '#FFF7DB' },
  cardCancelled: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D4D4D8' },
  cardCurrent: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.sheetText,
    shadowColor: colors.sheetText,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
  },
});
