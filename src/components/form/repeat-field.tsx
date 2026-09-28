import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Chip, FieldLabel } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import { ALL_DAYS, WEEKDAY_LETTERS } from '@/lib/alarm';
import { type DayKey, parseDay, todayKey } from '@/lib/dates';
import {
  type GoalRepeat, isActiveOn, nextActive, periodStartOf, repeatLabel, type RepeatUnit, shiftPeriod,
} from '@/lib/goal-repeat';
import { colors, fonts } from '@/theme/tokens';

const UNITS: { value: RepeatUnit; label: string }[] = [
  { value: 'day', label: 'Jours' },
  { value: 'week', label: 'Semaines' },
  { value: 'month', label: 'Mois' },
];
const STARTS: Record<RepeatUnit, [string, string]> = {
  day: ["Aujourd'hui", 'Demain'],
  week: ['Cette semaine', 'La suivante'],
  month: ['Ce mois-ci', 'Le suivant'],
};
const MAX_EVERY = 12;
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** « lun. 30 sept. », « sem. du 6 oct. », « novembre ». */
function whenLabel(unit: RepeatUnit, d: DayKey) {
  if (unit === 'day') return format(parseDay(d), 'EEE d MMM', { locale: fr });
  if (unit === 'week') return `sem. du ${format(parseDay(d), 'd MMM', { locale: fr })}`;
  return format(parseDay(d), 'MMMM', { locale: fr });
}

/**
 * Période personnalisée d'un objectif : l'unité (jours, semaines, mois), puis
 * certains jours de la semaine (objectif du jour) ou une période sur N, et quand ça commence.
 */
export function RepeatField({
  unit, value, onChange,
}: {
  unit: RepeatUnit;
  value: GoalRepeat;
  onChange: (unit: RepeatUnit, r: GoalRepeat) => void;
}) {
  const today = todayKey();
  const set = (patch: Partial<GoalRepeat>) => onChange(unit, { ...value, ...patch });
  const byDays = unit === 'day' && value.every === 1;

  const toggleDay = (i: number) => {
    // Choisir des jours de la semaine remplace « tous les N jours ».
    const days = (value.every > 1 ? ALL_DAYS : value.days) ^ (1 << i);
    if (!days) return; // au moins un jour
    Haptics.selectionAsync();
    set({ days, every: 1 });
  };
  const setEvery = (every: number) => {
    Haptics.selectionAsync();
    // « Tous les N jours » remplace les jours de la semaine ; on repart de la période en cours.
    set({ every, days: every > 1 ? ALL_DAYS : value.days, from: every !== value.every ? periodStartOf(unit, today) : value.from });
  };

  const startsNow = isActiveOn(unit, value, today);
  const upcoming = nextActive(unit, value, today, 3);

  return (
    <Animated.View layout={LinearTransition.duration(250)} entering={FadeIn.duration(200)} style={styles.card}>
      <View style={{ gap: 8 }}>
        <FieldLabel>Rythme</FieldLabel>
        <View style={styles.chips}>
          {UNITS.map((u) => (
            <Chip
              key={u.value}
              label={u.label}
              selected={unit === u.value}
              onPress={() => {
                if (u.value === unit) return;
                Haptics.selectionAsync();
                onChange(u.value, { ...value, days: ALL_DAYS, from: periodStartOf(u.value, today) });
              }}
            />
          ))}
        </View>
      </View>

      {unit === 'day' && (
        <View style={{ gap: 6 }}>
          <AppText style={styles.label}>Certains jours de la semaine</AppText>
          <View style={styles.days}>
            {WEEKDAY_LETTERS.map((l, i) => {
              const on = byDays && (value.days & (1 << i)) !== 0;
              return (
                <Pressable
                  key={i}
                  onPress={() => toggleDay(i)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={DAY_NAMES[i]}
                  style={[styles.day, on && styles.dayOn]}>
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color={on ? colors.onLight : colors.textTertiary}>
                    {l}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.stepRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText style={styles.label}>{unit === 'day' ? 'Ou un jour sur N' : 'Fréquence'}</AppText>
          <AppText variant="bodyStrong" style={{ fontSize: 15, marginTop: 2 }}>
            {value.every > 1 || unit !== 'day' ? repeatLabel(unit, { ...value, days: ALL_DAYS }) : '—'}
          </AppText>
        </View>
        <StepBtn icon="minus" label="Moins souvent" disabled={value.every <= 1} onPress={() => setEvery(value.every - 1)} />
        <AppText style={styles.stepNum} accessibilityLiveRegion="polite">
          {value.every}
        </AppText>
        <StepBtn icon="plus" label="Plus espacé" disabled={value.every >= MAX_EVERY} onPress={() => setEvery(value.every + 1)} />
      </View>

      {value.every > 1 && (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 6 }}>
          <AppText style={styles.label}>Commence</AppText>
          <View style={styles.chips}>
            {STARTS[unit].map((label, k) => (
              <Chip
                key={label}
                label={label}
                selected={k === 0 ? startsNow : !startsNow && isActiveOn(unit, value, shiftPeriod(unit, today, 1))}
                onPress={() => {
                  Haptics.selectionAsync();
                  set({ from: shiftPeriod(unit, today, k) });
                }}
              />
            ))}
          </View>
        </Animated.View>
      )}

      <AppText variant="caption" style={{ lineHeight: 17 }}>
        Prochaines fois : {upcoming.map((d) => whenLabel(unit, d)).join(', ')}. Les périodes de repos ne cassent pas la série.
      </AppText>
    </Animated.View>
  );
}

function StepBtn({ icon, label, onPress, disabled }: { icon: 'plus' | 'minus'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.step, disabled && { opacity: 0.35 }, pressed && { transform: [{ scale: 0.92 }] }]}>
      <Icon name={icon} size={18} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textTertiary },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  day: {
    flex: 1,
    height: 44,
    maxWidth: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: colors.text, borderColor: colors.text },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.borderDashed, alignItems: 'center', justifyContent: 'center' },
  stepNum: { minWidth: 28, textAlign: 'center', fontFamily: fonts.displayLight, fontSize: 24, color: colors.text },
});
