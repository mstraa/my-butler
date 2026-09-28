import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import type { TrackerDay, TrackerKind } from '@/db/tracking';
import { weekdayShort } from '@/lib/dates';
import { circularMean, clockOffset, fmtClock, fmtShort } from '@/lib/tracker-format';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/*
 * Graphique des 7 jours d'un suivi, selon son type :
 * - durée    : histogramme, repère d'objectif en pointillés ;
 * - volume   : tubes qui se remplissent ;
 * - quantité : sucettes avec le nombre dans la pastille (les pas : barres, nombre écrit dedans) ;
 * - heure    : points placés autour de l'heure moyenne (plus tôt en haut) ;
 * - sommeil  : une barre par nuit, du coucher (en bas) au lever (en haut), sur un axe horaire.
 * Le dernier jour (jour affiché) est en couleur pleine.
 */

type Props = {
  kind: TrackerKind;
  unit: string;
  step: number;
  days: TrackerDay[];
  color: string;
  goal: number | null;
  label: string;
};

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
/** Place à droite du graphique des heures pour l'étiquette de la moyenne. */
const TIME_INSET = 44;
/** Place à gauche du graphique du sommeil pour les heures de l'axe. */
const SLEEP_AXIS = 42;

export function TrackerChart(p: Props) {
  const isSteps = p.kind === 'quantity' && p.unit === 'pas';
  const body =
    p.kind === 'sleep' ? <SleepChart {...p} />
    : p.kind === 'time' ? <TimeChart {...p} />
    : isSteps ? <StepsChart {...p} />
    : p.kind === 'quantity' ? <PopChart {...p} />
    : p.kind === 'volume' ? <TubeChart {...p} />
    : <BarChart {...p} />;
  return (
    <View style={{ gap: 6 }}>
      <View accessibilityRole="image" accessibilityLabel={p.label}>
        {body}
      </View>
      <Weekdays days={p.days} left={p.kind === 'sleep' ? SLEEP_AXIS : 0} right={p.kind === 'time' ? TIME_INSET : 0} />
    </View>
  );
}

function Weekdays({ days, left, right }: { days: TrackerDay[]; left: number; right: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingLeft: left, paddingRight: right }}>
      {days.map((d, i) => (
        <AppText
          key={d.day}
          variant="caption"
          style={{ flex: 1, textAlign: 'center', fontSize: 11, fontFamily: i === 6 ? fonts.bodyBold : fonts.body }}
          color={i === 6 ? colors.text : colors.textTertiary}>
          {weekdayShort(d.day).charAt(0).toUpperCase()}
        </AppText>
      ))}
    </View>
  );
}

/** Haut de l'échelle : un peu au-dessus du maximum (et de l'objectif). */
const scaleMax = (days: TrackerDay[], goal: number | null, floor: number) =>
  Math.max(floor, goal ? goal * 1.25 : 0, ...days.map((d) => (d.value ?? 0) * 1.1));

/** Hauteur animée (0 → valeur) partagée par les colonnes. */
function useGrow(target: number, delay: number) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.set(withDelay(delay, withTiming(target, { duration: 420, easing: ease })));
  }, [h, target, delay]);
  return h;
}

/** Repère de l'objectif : trait en pointillés seul (la valeur est dans la légende sous le graphique). */
function GoalLine({ goal, max, height, offset = 0 }: { goal: number | null; max: number; height: number; offset?: number }) {
  if (!goal) return null;
  return <View pointerEvents="none" style={[styles.goal, styles.goalLine, { bottom: (goal / max) * height + offset }]} />;
}

/* ——— Durée : histogramme ——— */

function BarChart({ days, color, goal, unit, step, kind }: Props) {
  const height = 90;
  const max = scaleMax(days, goal, unit === 'min' ? 30 : 60);
  return (
    <View style={[styles.row, styles.baseline, { height }]}>
      {days.map((d, i) => (
        <Bar key={d.day} ratio={(d.value ?? 0) / max} height={height} color={i === 6 ? color : withAlpha(color, 0.4)} delay={i * 40} />
      ))}
      <GoalLine goal={goal} max={max} height={height} />
    </View>
  );
}

function Bar({ ratio, height, color, delay }: { ratio: number; height: number; color: string; delay: number }) {
  const r = Math.max(0, Math.min(1, ratio));
  const h = useGrow(r * height, delay);
  const style = useAnimatedStyle(() => ({ height: Math.max(r > 0 ? 3 : 0, h.get()) }));
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />
    </View>
  );
}

/* ——— Pas : barres, nombre écrit dedans à la verticale ——— */

/** 8432 → « 8 432 » (espace fine insécable). */
const fmtThousands = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
/** Largeur réservée au nombre couché. */
const STEP_LABEL = 52;

function StepsChart({ days, color, goal, step }: Props) {
  const height = 128;
  const max = scaleMax(days, goal, step * 3);
  return (
    <View style={[styles.row, styles.baseline, { height }]}>
      {days.map((d, i) => (
        <StepBar
          key={d.day}
          ratio={(d.value ?? 0) / max}
          height={height}
          color={color}
          strong={i === 6}
          delay={i * 40}
          text={d.value ? fmtThousands(d.value) : ''}
        />
      ))}
      <GoalLine goal={goal} max={max} height={height} />
    </View>
  );
}

function StepBar({
  ratio, height, color, strong, delay, text,
}: { ratio: number; height: number; color: string; strong: boolean; delay: number; text: string }) {
  const r = Math.max(0, Math.min(1, ratio));
  const barH = r * height;
  const h = useGrow(barH, delay);
  const bar = useAnimatedStyle(() => ({ height: Math.max(r > 0 ? 3 : 0, h.get()) }));
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(delay + 220, withTiming(1, { duration: 240, easing: ease })));
  }, [o, delay]);
  const fade = useAnimatedStyle(() => ({ opacity: o.get() }));
  // Le nombre tient dans la barre ? Sinon il se pose juste au-dessus.
  const inside = barH >= text.length * 6.5 + 12;
  const fill = strong ? color : withAlpha(color, 0.4);
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View style={[styles.bar, { backgroundColor: fill }, bar]} />
      {!!text && (
        <Animated.View pointerEvents="none" style={[styles.vLabel, { bottom: inside ? 6 : barH + 4 }, fade]}>
          <AppText
            style={styles.vText}
            color={inside ? (strong ? colors.onLight : colors.text) : colors.textSecondary}
            numberOfLines={1}>
            {text}
          </AppText>
        </Animated.View>
      )}
    </View>
  );
}

/* ——— Volume : tubes ——— */

function TubeChart({ days, color, goal, kind, unit, step }: Props) {
  const height = 84;
  const max = scaleMax(days, goal, step * 4);
  return (
    <View style={[styles.row, { height }]}>
      {days.map((d, i) => (
        <Tube key={d.day} ratio={(d.value ?? 0) / max} height={height} color={color} strong={i === 6} delay={i * 40} />
      ))}
      <GoalLine goal={goal} max={max} height={height} />
    </View>
  );
}

function Tube({ ratio, height, color, strong, delay }: { ratio: number; height: number; color: string; strong: boolean; delay: number }) {
  const r = Math.max(0, Math.min(1, ratio));
  const h = useGrow(r * (height - 4), delay);
  const style = useAnimatedStyle(() => ({ height: h.get() }));
  return (
    <View style={[styles.tube, { height, borderColor: strong ? withAlpha(color, 0.55) : colors.border }]}>
      <Animated.View style={[styles.liquid, { backgroundColor: strong ? color : withAlpha(color, 0.4) }, style]}>
        <View style={[styles.surface, { backgroundColor: strong ? '#FFFFFF55' : '#FFFFFF22' }]} />
      </Animated.View>
    </View>
  );
}

/* ——— Quantité : sucettes ——— */

function PopChart({ days, color, goal, kind, unit, step }: Props) {
  const height = 96;
  const dot = 26;
  const max = scaleMax(days, goal, step * 3);
  return (
    <View style={[styles.row, styles.baseline, { height }]}>
      {days.map((d, i) => (
        <Pop
          key={d.day}
          value={d.value}
          ratio={(d.value ?? 0) / max}
          room={height - dot}
          dot={dot}
          color={color}
          strong={i === 6}
          delay={i * 40}
          text={d.value ? fmtShort({ kind, unit, step }, d.value) : ''}
        />
      ))}
      {/* Repère au niveau du centre des pastilles. */}
      <GoalLine goal={goal} max={max} height={height - dot} offset={dot / 2} />
    </View>
  );
}

function Pop({
  value, ratio, room, dot, color, strong, delay, text,
}: { value: number | null; ratio: number; room: number; dot: number; color: string; strong: boolean; delay: number; text: string }) {
  const r = Math.max(0, Math.min(1, ratio));
  const h = useGrow(r * room, delay);
  const stem = useAnimatedStyle(() => ({ height: h.get() }));
  if (!value) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 }}>
        <View style={[styles.emptyDot, { borderColor: strong ? withAlpha(color, 0.6) : colors.borderDashed }]} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={[styles.pop, { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: strong ? color : withAlpha(color, 0.3) }]}>
        <AppText style={styles.popText} color={strong ? colors.onLight : colors.text} numberOfLines={1} adjustsFontSizeToFit>
          {text}
        </AppText>
      </View>
      <Animated.View style={[styles.stem, { backgroundColor: strong ? color : withAlpha(color, 0.4) }, stem]} />
    </View>
  );
}

/* ——— Heure : points autour de la moyenne ——— */

function TimeChart({ days, color }: Props) {
  const height = 96;
  const known = days.map((d) => d.value).filter((v): v is number => v !== null);
  const mean = known.length ? circularMean(known) : 0;
  const offsets = known.map((v) => clockOffset(v, mean));
  // Échelle symétrique autour de la moyenne : au moins ± 30 min.
  const span = Math.max(30, ...offsets.map(Math.abs)) * 1.15;
  const y = (v: number) => ((clockOffset(v, mean) + span) / (2 * span)) * (height - 14) + 7;
  return (
    <View style={{ height }}>
      {known.length > 0 && (
        <View pointerEvents="none" style={[styles.goal, { top: height / 2 - 8, height: 16 }]}>
          <View style={styles.goalLine} />
          <AppText style={[styles.goalLabel, { transform: [{ translateY: 0 }] }]}>{fmtClock(mean)}</AppText>
        </View>
      )}
      <View style={[styles.row, { height, paddingRight: TIME_INSET }]}>
        {days.map((d, i) => (
          <View key={d.day} style={{ flex: 1, height, alignItems: 'center' }}>
            <View style={[styles.track, { height }]} />
            {d.value !== null && <TimeDot top={y(d.value)} color={i === 6 ? color : withAlpha(color, 0.45)} strong={i === 6} delay={i * 40} label={fmtClock(d.value)} />}
          </View>
        ))}
      </View>
    </View>
  );
}

function TimeDot({ top, color, strong, delay, label }: { top: number; color: string; strong: boolean; delay: number; label: string }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(delay, withTiming(1, { duration: 320, easing: ease })));
  }, [o, delay]);
  const style = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ scale: 0.4 + 0.6 * o.get() }] }));
  const size = strong ? 14 : 10;
  return (
    <Animated.View style={[{ position: 'absolute', top: top - size / 2, alignItems: 'center' }, style]}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
      {strong && (
        <AppText style={[styles.timeLabel, { left: (size - 44) / 2, top: top < 30 ? size + 2 : -16 }]} color={colors.text}>
          {label}
        </AppText>
      )}
    </Animated.View>
  );
}

/* ——— Sommeil : du coucher au lever ——— */

/** Minutes depuis midi : la nuit reste d'un seul tenant (23:00 → 660, 07:00 → 1140). */
const fromNoon = (m: number) => (((m - 720) % 1440) + 1440) % 1440;

function SleepChart({ days, color }: Props) {
  const height = 176;
  const pad = 22; // place des heures au-dessus et au-dessous des barres
  const nights = days.map((d) => {
    const s = d.slept ?? null;
    const w = d.woke ?? null;
    const bottom = s !== null ? fromNoon(s) : null;
    let top = w !== null ? fromNoon(w) : null;
    if (bottom !== null && top !== null && top < bottom) top += 1440;
    return { day: d.day, slept: s, woke: w, bottom, top };
  });
  const lows = nights.map((n) => n.bottom ?? n.top).filter((v): v is number => v !== null);
  const highs = nights.map((n) => n.top ?? n.bottom).filter((v): v is number => v !== null);
  // Axe à l'heure pleine autour des nuits, au moins deux heures (22:00 → 08:00 à défaut).
  let lo = lows.length ? Math.floor(Math.min(...lows) / 60) * 60 : 600;
  let hi = highs.length ? Math.ceil(Math.max(...highs) / 60) * 60 : 1200;
  if (hi - lo < 120) {
    lo -= 60;
    hi += 60;
  }
  const y = (v: number) => pad + ((hi - v) / (hi - lo)) * (height - 2 * pad);
  const ticks = [hi, (lo + hi) / 2, lo];

  return (
    <View style={{ flexDirection: 'row', height }}>
      <View style={{ width: SLEEP_AXIS }}>
        {ticks.map((t) => (
          <AppText key={t} style={[styles.axisLabel, { top: y(t) - 8 }]} color={colors.textTertiary}>
            {fmtClock(t + 720)}
          </AppText>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {ticks.map((t) => (
          <View key={t} pointerEvents="none" style={[styles.grid, { top: y(t) }]} />
        ))}
        <View style={[styles.row, { height, alignItems: 'stretch' }]}>
          {nights.map((n, i) => (
            <View key={n.day} style={[styles.nightCol, i === 6 && { backgroundColor: withAlpha(colors.text, 0.06) }]}>
              {n.bottom !== null && n.top !== null ? (
                <NightBar top={y(n.top)} bottom={y(n.bottom)} chart={height} color={color} delay={i * 40} woke={n.woke!} slept={n.slept!} />
              ) : n.bottom !== null || n.top !== null ? (
                <NightDot at={y((n.bottom ?? n.top)!)} color={color} delay={i * 40} label={fmtClock((n.slept ?? n.woke)!)} below={n.bottom !== null} />
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function NightBar({
  top, bottom, chart, color, delay, slept, woke,
}: { top: number; bottom: number; chart: number; color: string; delay: number; slept: number; woke: number }) {
  const len = Math.max(6, bottom - top);
  const h = useGrow(len, delay);
  const bar = useAnimatedStyle(() => ({ height: h.get() }));
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(delay + 200, withTiming(1, { duration: 240, easing: ease })));
  }, [o, delay]);
  const fade = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <>
      <Animated.View style={[styles.nightLabel, { top: bottom - len - 17 }, fade]}>
        <AppText style={styles.nightText} color={color}>{fmtClock(woke)}</AppText>
      </Animated.View>
      {/* Ancrée au coucher : la barre pousse vers le lever. */}
      <Animated.View style={[styles.nightBar, { bottom: chart - bottom, backgroundColor: color }, bar]} />
      <Animated.View style={[styles.nightLabel, { top: bottom + 2 }, fade]}>
        <AppText style={styles.nightText} color={color}>{fmtClock(slept)}</AppText>
      </Animated.View>
    </>
  );
}

function NightDot({ at, color, delay, label, below }: { at: number; color: string; delay: number; label: string; below: boolean }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withDelay(delay, withTiming(1, { duration: 320, easing: ease })));
  }, [o, delay]);
  const fade = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]}>
      <View style={[styles.nightDot, { top: at - 5, backgroundColor: color }]} />
      <View style={[styles.nightLabel, { top: below ? at + 7 : at - 22 }]}>
        <AppText style={styles.nightText} color={color}>{label}</AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  baseline: { borderBottomWidth: 1, borderBottomColor: colors.border },
  bar: { borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  goal: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  goalLine: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.textTertiary },
  goalLabel: {
    paddingHorizontal: 4, fontFamily: fonts.displayMedium, fontSize: 11, color: colors.textSecondary,
    backgroundColor: colors.surfaceRaised, transform: [{ translateY: -8 }],
  },
  tube: { flex: 1, justifyContent: 'flex-end', padding: 2, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  liquid: { borderRadius: 7, overflow: 'hidden' },
  surface: { height: 3, marginHorizontal: 3, marginTop: 2, borderRadius: 2 },
  pop: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  popText: { fontFamily: fonts.displayMedium, fontSize: 11 },
  stem: { width: 2, borderRadius: 1 },
  emptyDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  track: { position: 'absolute', width: 1, backgroundColor: colors.borderSoft },
  vLabel: { position: 'absolute', left: 0, right: 0, height: STEP_LABEL, alignItems: 'center', justifyContent: 'center' },
  vText: { width: STEP_LABEL, fontFamily: fonts.displayMedium, fontSize: 11, transform: [{ rotate: '-90deg' }] },
  axisLabel: { position: 'absolute', left: 0, fontFamily: fonts.displayMedium, fontSize: 11, fontVariant: ['tabular-nums'] },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.borderSoft },
  nightCol: { flex: 1, alignItems: 'center', borderRadius: 8 },
  nightBar: { position: 'absolute', width: 14, borderRadius: 4 },
  nightDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  nightLabel: { position: 'absolute', left: -12, right: -12, alignItems: 'center' },
  nightText: { fontFamily: fonts.displayMedium, fontSize: 11, fontVariant: ['tabular-nums'] },
  timeLabel: { position: 'absolute', width: 44, textAlign: 'center', fontFamily: fonts.displayMedium, fontSize: 11 },
});
