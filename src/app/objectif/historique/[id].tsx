import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import {
  addToGoalEntry, fmtGoal, getGoalHistory, type GoalHistory, type HistoryPeriod, setPeriodValue,
} from '@/db/goals';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { type DayKey, parseDay, shiftDay, todayKey, weekDays, weekRangeLabel } from '@/lib/dates';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

const STREAK = categoryColors.friends;
const UNIT = { day: 'j', week: 'sem.', month: 'mois' } as const;
const PER = { day: 'Chaque jour', week: 'Chaque semaine', month: 'Chaque mois' } as const;
const DOT = 14;
const GAP = 4;
const ROW_LABELS = ['L', '', 'M', '', 'V', '', 'D'];

/**
 * Historique d'un objectif (ouvert depuis la vue Liste) :
 * - un graphe de ronds façon contributions GitHub, depuis la création de l'objectif ;
 * - toucher un rond choisit la période, qu'on remplit en dessous (Fait, +1, valeur, minutes).
 */
export default function GoalHistorySheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { height } = useWindowDimensions();
  const { data: g } = useDbQuery((db) => getGoalHistory(db, Number(id)), id);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Sheet label="Historique de l'objectif" draggable={false} style={{ maxHeight: Math.min(height * 0.9, 820), gap: 0 }}>
        {(close) =>
          g === undefined ? null : !g ? (
            <AppText variant="title" style={{ padding: 16 }}>
              Objectif introuvable
            </AppText>
          ) : (
            <Body g={g} onClose={() => close()} />
          )
        }
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Body({ g, onClose }: { g: GoalHistory; onClose: () => void }) {
  const [selected, setSelected] = useState<DayKey>(g.periods[0]?.start ?? todayKey());
  const past = g.periods.filter((p) => !p.current);
  const metPast = past.filter((p) => p.met).length;
  const rate = past.length ? Math.round((metPast / past.length) * 100) : null;
  const target = g.kind === 'bool' ? '' : ` · ${fmtGoal(g.target)}${g.unit ? ` ${g.unit}` : ''}`;
  const sel = g.periods.find((p) => p.start === selected) ?? g.periods[0];

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: withAlpha(g.color, 0.13) }]}>
          <Icon name={g.icon} size={18} color={g.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="title" numberOfLines={1}>
            {g.title}
          </AppText>
          <AppText variant="caption" numberOfLines={1}>
            {PER[g.period]}
            {target}
          </AppText>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.headBtn}>
          <Icon name="x" size={16} color={colors.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat label="Série en cours" value={g.streak} unit={UNIT[g.period]} flame />
        <Stat label="Meilleure série" value={g.best} unit={UNIT[g.period]} />
        <Stat label="Réussite" value={rate ?? 0} unit={rate === null ? '' : '%'} sub={`${metPast} / ${past.length}`} />
      </View>

      <View style={styles.graphCard}>
        <Graph g={g} selected={sel?.start} onSelect={(d) => {
          Haptics.selectionAsync();
          setSelected(d);
        }} />
        <View style={styles.legend}>
          <AppText variant="caption" style={{ fontSize: 11 }}>
            depuis le {format(parseDay(g.since), 'd MMM yyyy', { locale: fr })}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <AppText variant="caption" style={{ fontSize: 11 }}>
              Moins
            </AppText>
            {[0, 0.3, 0.7, 1].map((r) => (
              <View key={r} style={[styles.legendDot, { backgroundColor: fillFor(g.color, r) }]} />
            ))}
            <AppText variant="caption" style={{ fontSize: 11 }}>
              Plus
            </AppText>
          </View>
        </View>
      </View>

      {sel && <Fill key={sel.start} g={g} p={sel} />}
    </ScrollView>
  );
}

/** Couleur d'un rond selon l'avancement (0 → gris ; puis 3 intensités ; atteint → plein). */
function fillFor(color: string, ratio: number) {
  if (ratio <= 0) return colors.row;
  if (ratio >= 1) return color;
  return withAlpha(color, ratio < 0.5 ? 0.3 : 0.6);
}

/**
 * Graphe de ronds, le plus récent à droite.
 * Jour : une colonne par semaine, une ligne par jour (L → D). Semaine / mois : une seule ligne.
 */
function Graph({ g, selected, onSelect }: { g: GoalHistory; selected?: DayKey; onSelect: (d: DayKey) => void }) {
  const scroll = useRef<ScrollView>(null);
  const byStart = new Map(g.periods.map((p) => [p.start, p]));
  const ratio = (p: HistoryPeriod) => (g.kind === 'bool' ? (p.value >= 1 ? 1 : 0) : p.value / g.target);
  const today = todayKey();

  // Colonnes : semaines (objectif du jour) ou périodes (semaine / mois), de la plus ancienne à la plus récente.
  const columns: DayKey[][] = [];
  if (g.period === 'day') {
    for (let w = weekDays(g.since)[0]; w <= today; w = shiftDay(w, 7)) columns.push(weekDays(w));
  } else {
    for (const p of [...g.periods].reverse()) columns.push([p.start]);
  }

  const dot = (d: DayKey) => {
    const p = byStart.get(d);
    if (!p) return <View key={d} style={styles.dotEmpty} />; // avant la création ou à venir
    const on = d === selected;
    return (
      <Pressable
        key={d}
        onPress={() => onSelect(d)}
        hitSlop={2}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${labelOf(g, p)}, ${p.met ? 'atteint' : `${fmtGoal(p.value)} sur ${fmtGoal(g.target)}`}`}
        style={[
          styles.dot,
          { backgroundColor: fillFor(g.color, ratio(p)) },
          p.current && !p.met && { borderWidth: 1.5, borderColor: g.color, backgroundColor: fillFor(g.color, ratio(p)) },
          on && styles.dotOn,
        ]}
      />
    );
  };

  // Étiquette de mois au-dessus d'une colonne : quand le mois change (et sur la première colonne).
  const abbr = (d: DayKey) => format(parseDay(d), 'MMM', { locale: fr }).replace('.', '');
  const monthLabel = (col: DayKey[], i: number) => {
    if (g.period === 'month') return abbr(col[0]).charAt(0).toUpperCase();
    const first = g.period === 'day' ? col.find((d) => d.slice(8) === '01') : col[0].slice(0, 7) !== columns[i - 1]?.[0].slice(0, 7) ? col[0] : undefined;
    if (first) return abbr(first);
    return i === 0 ? abbr(col[col.length - 1]) : '';
  };

  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {g.period === 'day' && (
        <View style={{ paddingTop: 18, gap: GAP }}>
          {ROW_LABELS.map((l, i) => (
            <AppText key={i} variant="caption" style={{ height: DOT, fontSize: 10, lineHeight: DOT }}>
              {l}
            </AppText>
          ))}
        </View>
      )}
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <View style={{ flexDirection: 'row', gap: GAP }}>
          {columns.map((col, i) => (
            <View key={col[0]} style={{ gap: GAP, width: g.period === 'month' ? 22 : DOT, alignItems: 'center' }}>
              <AppText variant="caption" numberOfLines={1} style={styles.monthLabel}>
                {monthLabel(col, i)}
              </AppText>
              {col.map(dot)}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Remplir la période choisie : le contrôle dépend de la sorte d'objectif. */
function Fill({ g, p }: { g: GoalHistory; p: HistoryPeriod }) {
  const mutate = useDbMutation();
  const [text, setText] = useState('');
  const today = todayKey();
  const day = p.end < today ? p.end : today; // jour où s'ajoute la saisie
  const add = (delta: number) => {
    Haptics.selectionAsync();
    mutate((db) => addToGoalEntry(db, g.id, day, delta, g.period));
  };
  const set = (v: number) => {
    Haptics.selectionAsync();
    mutate((db) => setPeriodValue(db, g.id, p, v));
  };
  const left = g.target - p.value;
  const unit = g.kind === 'duration' ? 'min' : g.unit;

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.fill}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="overline">Remplir</AppText>
          <AppText variant="bodyStrong" style={{ fontSize: 16, marginTop: 2 }}>
            {labelOf(g, p)}
          </AppText>
        </View>
        <AppText style={{ fontFamily: fonts.displayLight, fontSize: 26 }} color={p.met ? colors.success : colors.text}>
          {g.kind === 'bool' ? (p.met ? 'fait' : '—') : fmtGoal(p.value)}
          {g.kind !== 'bool' && (
            <AppText style={{ fontFamily: fonts.displayLight, fontSize: 15 }} color={colors.textMuted}>
              {' '}/ {fmtGoal(g.target)}
              {unit ? ` ${unit}` : ''}
            </AppText>
          )}
        </AppText>
      </View>

      {g.kind === 'bool' && (
        <Pressable
          onPress={() => set(p.met ? 0 : 1)}
          accessibilityRole="checkbox"
          accessibilityLabel="Fait"
          accessibilityState={{ checked: p.met }}
          style={[styles.big, p.met ? { backgroundColor: colors.text } : { borderWidth: 1, borderColor: colors.borderDashed }]}>
          <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={p.met ? colors.onLight : '#D4D4D8'}>
            Fait
          </AppText>
        </Pressable>
      )}

      {g.kind === 'counter' && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => add(-1)}
            disabled={p.value <= 0}
            accessibilityRole="button"
            accessibilityLabel="Retirer 1"
            style={[styles.big, styles.ghost, { flex: 1 }, p.value <= 0 && { opacity: 0.4 }]}>
            <Icon name="minus" size={18} strokeWidth={2} />
          </Pressable>
          <Pressable onPress={() => add(1)} accessibilityRole="button" accessibilityLabel="Ajouter 1" style={[styles.big, styles.primary, { flex: 2 }]}>
            <Icon name="plus" size={18} color={colors.onLight} strokeWidth={2.2} />
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
              Ajouter 1
            </AppText>
          </Pressable>
        </View>
      )}

      {(g.kind === 'value' || g.kind === 'duration') && (
        <>
          {g.kind === 'duration' && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[5, 15, 30, 60].map((m) => (
                <Pressable key={m} onPress={() => add(m)} accessibilityRole="button" style={styles.chip}>
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>+{m < 60 ? `${m} min` : '1 h'}</AppText>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              value={text}
              onChangeText={(t) => setText(t.replace(/[^\d,.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder={g.kind === 'duration' ? 'Minutes' : `Ex. ${fmtGoal(Math.max(1, Math.round(g.target / 4)))}`}
              placeholderTextColor={colors.textTertiary}
              cursorColor={colors.text}
              accessibilityLabel={g.kind === 'duration' ? 'Minutes à ajouter' : 'Valeur à ajouter'}
              style={styles.input}
            />
            <Pressable
              onPress={() => {
                const n = Number(text.replace(',', '.'));
                if (!(n > 0)) return;
                add(n);
                setText('');
              }}
              accessibilityRole="button"
              style={[styles.big, styles.primary, { paddingHorizontal: 18 }]}>
              <Icon name="plus" size={18} color={colors.onLight} strokeWidth={2.2} />
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
                Ajouter
              </AppText>
            </Pressable>
          </View>
        </>
      )}

      {g.kind !== 'bool' && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {!p.met ? (
            <Pressable onPress={() => set(g.target)} accessibilityRole="button" hitSlop={8}>
              <AppText variant="label" color={colors.textSecondary}>
                Marquer atteint (reste {fmtGoal(left)})
              </AppText>
            </Pressable>
          ) : (
            <View />
          )}
          {p.value > 0 && (
            <Pressable onPress={() => set(0)} accessibilityRole="button" hitSlop={8}>
              <AppText variant="label" color={colors.textTertiary}>
                Remettre à 0
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
}

function Stat({ label, value, unit, sub, flame }: { label: string; value: number; unit: string; sub?: string; flame?: boolean }) {
  return (
    <View style={styles.stat}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {flame && <Icon name="flame" size={12} color={value ? STREAK : colors.textMuted} strokeWidth={2} />}
        <AppText variant="caption" numberOfLines={1} style={{ fontSize: 11 }}>
          {label}
        </AppText>
      </View>
      <AppText style={styles.statNum} color={flame && value ? STREAK : colors.text}>
        {value}
        <AppText style={styles.statUnit}> {unit}</AppText>
      </AppText>
      {sub && <AppText variant="caption" style={{ fontSize: 11 }}>{sub}</AppText>}
    </View>
  );
}

function labelOf(g: GoalHistory, p: HistoryPeriod) {
  if (g.period === 'week') return `Semaine du ${weekRangeLabel(p.start)}`;
  if (g.period === 'month') {
    const s = format(parseDay(p.start), 'MMMM yyyy', { locale: fr });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const s = format(parseDay(p.start), 'EEEE d MMMM', { locale: fr });
  return (p.current ? "Aujourd'hui · " : '') + s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 14 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  stat: { flex: 1, gap: 2, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.row, borderRadius: 16 },
  statNum: { fontFamily: fonts.displayLight, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  statUnit: { fontFamily: fonts.displayLight, fontSize: 14, color: colors.textTertiary },
  graphCard: { gap: 10, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.row, borderRadius: 20 },
  monthLabel: { height: 14, fontSize: 10, lineHeight: 14, width: 40, textAlign: 'left', alignSelf: 'flex-start' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  dotEmpty: { width: DOT, height: DOT },
  dotOn: { borderWidth: 2, borderColor: colors.text },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  fill: { gap: 12, marginTop: 10, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.row, borderRadius: 20 },
  big: { height: 48, flexDirection: 'row', gap: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ghost: { borderWidth: 1, borderColor: colors.borderDashed },
  primary: { backgroundColor: colors.text },
  chip: { flex: 1, height: 36, borderRadius: 999, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 17,
  },
});
