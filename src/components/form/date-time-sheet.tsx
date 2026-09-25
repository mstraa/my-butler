import { getDaysInMonth } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { type CloseSheet, Sheet } from '@/components/sheet';
import { type DayKey, mediumDayLabel, monthName, monthStart, parseDay, shiftMonth, todayKey, yearOf } from '@/lib/dates';
import { colors, fonts } from '@/theme/tokens';

/*
 * Feuille « date et heure » maison, à la place des sélecteurs Android :
 * - en haut, le jour choisi en grand et le créneau ;
 * - un calendrier qui défile mois après mois (on touche un jour) ;
 * - en bas, une réglette par heure (Début / Fin, ou une seule pour une échéance), par pas de 15 min.
 */

export type DateTimeValue = { day: DayKey; start: string; end: string | null };

type Props = {
  visible: boolean;
  /** Petit titre au-dessus de la date (« Rendez-vous », « Échéance »). */
  title: string;
  value: DateTimeValue;
  /** Journée entière : pas de réglette. */
  allDay?: boolean;
  /** Libellé de la réglette unique (quand `value.end` est null). */
  timeLabel?: string;
  onDone: (v: DateTimeValue) => void;
  onClose: () => void;
};

const STEP = 15;
const MAX = 24 * 60 - STEP; // 23:45
const CELL = 46;
const MONTH_HEAD = 44;
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
/** Durées rapides : la fin = début + durée. */
const DURATIONS = [
  { min: 15, label: '15 min' },
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 h' },
  { min: 90, label: '1 h 30' },
  { min: 120, label: '2 h' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function DateTimeSheet(props: Props) {
  const { height: winH } = useWindowDimensions();
  if (!props.visible) return null;
  return (
    <Sheet
      inline
      draggable={false}
      onClosed={props.onClose}
      label={props.title}
      style={{ height: Math.min(winH * 0.88, 760), gap: 0 }}>
      {(close) => <SheetBody {...props} close={close} />}
    </Sheet>
  );
}

type Month = { key: DayKey; offset: number; days: number; rows: number; top: number; height: number };

/** Mois affichés : un an avant aujourd'hui → deux ans après (élargi si la date choisie est hors plage). */
function buildMonths(selected: DayKey): Month[] {
  const base = monthStart(todayKey());
  const sel = monthStart(selected);
  let from = shiftMonth(base, -12);
  let to = shiftMonth(base, 24);
  if (sel < from) from = shiftMonth(sel, -2);
  if (sel > to) to = shiftMonth(sel, 12);
  const out: Month[] = [];
  let top = 0;
  for (let k = from; k <= to; k = shiftMonth(k, 1)) {
    const offset = (parseDay(k).getDay() + 6) % 7; // lundi en premier
    const days = getDaysInMonth(parseDay(k));
    const rows = Math.ceil((offset + days) / 7);
    const height = MONTH_HEAD + rows * CELL;
    out.push({ key: k, offset, days, rows, top, height });
    top += height;
  }
  return out;
}

function SheetBody({ title, value, allDay, timeLabel = 'Heure', onDone, close }: Props & { close: CloseSheet }) {
  const today = todayKey();
  const [day, setDay] = useState(value.day);
  const [start, setStart] = useState(toMin(value.start));
  const [end, setEnd] = useState(value.end === null ? null : toMin(value.end));
  const [months] = useState(() => buildMonths(value.day));
  const list = useRef<FlatList<Month>>(null);
  const initialIndex = Math.max(0, months.findIndex((m) => m.key === monthStart(value.day)));

  const pick = (k: DayKey) => {
    if (k === day) return;
    Haptics.selectionAsync();
    setDay(k);
  };
  const goToday = () => {
    pick(today);
    const i = months.findIndex((m) => m.key === monthStart(today));
    if (i >= 0) list.current?.scrollToIndex({ index: i, animated: true });
  };

  // Déplacer le début garde la durée ; une fin avant le début passe au lendemain.
  const changeStart = (m: number) => {
    if (end !== null) {
      const dur = (end - start + 1440) % 1440 || 60;
      setEnd((m + dur) % 1440);
    }
    setStart(m);
  };
  const nextDay = end !== null && end <= start;
  const duration = end === null ? null : (end - start + 1440) % 1440;
  const applyDuration = (min: number) => {
    Haptics.selectionAsync();
    setEnd((start + min) % 1440);
  };

  const slot = allDay
    ? 'Toute la journée'
    : end === null
      ? `à ${toHhmm(start)}`
      : `${toHhmm(start)} → ${toHhmm(end)}${nextDay ? ' (lendemain)' : ''}`;

  return (
    <View style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="caption" color={colors.textTertiary}>
              {title}
            </AppText>
            <AppText style={styles.bigDate} numberOfLines={1}>
              {cap(mediumDayLabel(day))}
            </AppText>
            <AppText variant="bodyMedium" color={colors.textSecondary} style={{ fontSize: 15 }}>
              {slot}
            </AppText>
          </View>
          {day !== today && (
            <Pressable onPress={goToday} accessibilityRole="button" style={styles.todayChip}>
              <AppText variant="label" color={colors.textSecondary}>
                Aujourd&apos;hui
              </AppText>
            </Pressable>
          )}
        </View>

        <View style={styles.weekdays}>
          {WEEKDAYS.map((w, i) => (
            <AppText key={i} variant="caption" color={colors.textMuted} style={styles.weekday}>
              {w}
            </AppText>
          ))}
        </View>

        <FlatList
          ref={list}
          data={months}
          keyExtractor={(m) => m.key}
          extraData={day}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: months[i].height, offset: months[i].top, index: i })}
          initialNumToRender={3}
          windowSize={5}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          renderItem={({ item }) => <MonthBlock month={item} selected={day} today={today} onPick={pick} />}
        />

        {!allDay && (
          <View style={styles.sliders}>
            {end !== null && (
              <View style={styles.durations}>
                {DURATIONS.map((o) => {
                  const on = duration === o.min;
                  return (
                    <Pressable
                      key={o.min}
                      onPress={() => applyDuration(o.min)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Durée ${o.label}`}
                      style={[styles.durChip, on && styles.durChipOn]}>
                      <AppText
                        style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 13 }}
                        color={on ? colors.onLight : colors.textSecondary}>
                        {o.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <TimeSlider
              label={end === null ? timeLabel : 'Début'}
              value={start}
              onChange={changeStart}
              fill="right"
            />
            {end !== null && (
              <TimeSlider label="Fin" value={end} onChange={setEnd} fill="left" suffix={nextDay ? '+1' : undefined} />
            )}
          </View>
        )}

        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onDone({ day, start: toHhmm(start), end: end === null ? null : toHhmm(end) });
            close();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.done, pressed && { opacity: 0.85 }]}>
          <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
            Valider
          </AppText>
        </Pressable>
    </View>
  );
}

function MonthBlock({
  month, selected, today, onPick,
}: {
  month: Month;
  selected: DayKey;
  today: DayKey;
  onPick: (k: DayKey) => void;
}) {
  const prefix = month.key.slice(0, 8);
  const cells: (DayKey | null)[] = [];
  for (let i = 0; i < month.rows * 7; i++) {
    const n = i - month.offset + 1;
    cells.push(n >= 1 && n <= month.days ? `${prefix}${pad(n)}` : null);
  }
  return (
    <View style={{ height: month.height }}>
      <AppText variant="label" color={colors.textSecondary} style={styles.monthTitle}>
        {monthName(month.key)} {yearOf(month.key)}
      </AppText>
      <View style={styles.grid}>
        {cells.map((k, i) => {
          if (!k) return <View key={i} style={styles.cell} />;
          const on = k === selected;
          const isToday = k === today;
          return (
            <Pressable
              key={i}
              onPress={() => onPick(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={styles.cell}>
              <View style={[styles.dayCircle, isToday && !on && styles.todayRing, on && styles.dayOn]}>
                <AppText
                  style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 15 }}
                  color={on ? colors.onLight : k < today ? colors.textMuted : colors.text}>
                  {Number(k.slice(8, 10))}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const THUMB = 86;

/** Réglette d'heure : on touche ou on glisse n'importe où sur la piste, pas de 15 min. */
function TimeSlider({
  label, value, onChange, fill, suffix,
}: {
  label: string;
  value: number;
  onChange: (m: number) => void;
  /** Côté rempli : à droite du curseur pour un début, à gauche pour une fin. */
  fill: 'left' | 'right';
  suffix?: string;
}) {
  const [w, setW] = useState(0);
  const usable = Math.max(1, w - THUMB);
  const x = useSharedValue(0);
  const last = useSharedValue(value);
  const dragging = useSharedValue(false);

  useEffect(() => {
    last.set(value);
    if (!dragging.get()) x.set((value / MAX) * usable);
  }, [value, usable, last, dragging, x]);

  const emit = (m: number) => {
    Haptics.selectionAsync();
    onChange(m);
  };

  const move = (px: number) => {
    'worklet';
    const p = Math.min(usable, Math.max(0, px - THUMB / 2));
    x.set(p);
    const m = Math.round(((p / usable) * MAX) / STEP) * STEP;
    if (m !== last.get()) {
      last.set(m);
      scheduleOnRN(emit, m);
    }
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      dragging.set(true);
      move(e.x);
    })
    .onUpdate((e) => move(e.x))
    .onFinalize(() => {
      dragging.set(false);
      x.set(withTiming((last.get() / MAX) * usable, { duration: 120 }));
    });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const fillStyle = useAnimatedStyle(() =>
    fill === 'left'
      ? { left: 0, width: x.get() + THUMB / 2 }
      : { left: x.get() + THUMB / 2, right: 0 },
  );

  return (
    <View style={styles.sliderRow}>
      <AppText variant="label" color={colors.textSecondary} style={{ width: 52 }}>
        {label}
      </AppText>
      <GestureDetector gesture={pan}>
        <View
          style={styles.sliderArea}
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: toHhmm(value) }}>
          <View style={styles.track} />
          <Animated.View style={[styles.track, styles.trackFill, fillStyle]} />
          <Animated.View style={[styles.thumb, thumbStyle]}>
            <AppText style={styles.thumbText}>
              {toHhmm(value)}
              {suffix ? <AppText style={[styles.thumbText, { color: colors.textTertiary }]}> {suffix}</AppText> : null}
            </AppText>
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 4, paddingBottom: 12 },
  bigDate: { fontFamily: fonts.displayLight, fontSize: 32, lineHeight: 38, letterSpacing: -0.5, color: colors.text },
  todayChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    marginBottom: 2,
  },
  weekdays: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.row,
  },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.bodySemiBold },
  monthTitle: { height: MONTH_HEAD, paddingTop: 16, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: CELL, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.text, borderRadius: 20, overflow: 'hidden' },
  todayRing: { borderWidth: 1, borderColor: colors.textTertiary },
  sliders: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.row },
  durations: { flexDirection: 'row', gap: 6, paddingBottom: 4 },
  durChip: {
    flex: 1,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durChipOn: { backgroundColor: colors.text, borderColor: colors.text },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderArea: { flex: 1, height: 48, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: colors.row },
  trackFill: { backgroundColor: colors.text },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: 36,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.text,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  done: {
    height: 52,
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
