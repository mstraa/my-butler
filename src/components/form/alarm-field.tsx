import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PickerField, SwitchRow } from '@/components/form/fields';
import { HOURS, MINUTES, pad, TimeGrid } from '@/components/form/time-grid';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { ALL_DAYS, alarmsLabel, type DailyAlarm, WEEKDAY_LETTERS } from '@/lib/alarm';
import { colors, fonts } from '@/theme/tokens';

const DEFAULT: DailyAlarm = { time: '20:00', days: ALL_DAYS };
/** Assez pour un matin, un midi, un soir… sans remplir la limite d'alarmes d'Android. */
const MAX_ALARMS = 6;
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Une heure après `time` (nouvelle alarme ajoutée sous la précédente). */
const hourAfter = (time: string) => `${pad((Number(time.slice(0, 2)) + 1) % 24)}${time.slice(2)}`;

/**
 * Alarmes quotidiennes d'un objectif ou d'un suivi : interrupteur, puis une ligne par alarme (heure, jours)
 * et « Ajouter une alarme ». `hint` : quand elles se taisent (déjà atteint, déjà noté…).
 * `onPickTime(i)` ouvre AlarmTimeSheet pour l'alarme i, posée à la racine du formulaire (une feuille « inline » couvre son parent).
 */
export function AlarmsField({
  value, onChange, onPickTime, hint,
}: {
  value: DailyAlarm[];
  onChange: (a: DailyAlarm[]) => void;
  onPickTime: (index: number) => void;
  hint: string;
}) {
  const update = (i: number, a: DailyAlarm) => onChange(value.map((x, j) => (j === i ? a : x)));
  const toggleDay = (i: number, day: number) => {
    const days = value[i].days ^ (1 << day);
    if (!days) return; // au moins un jour : sinon, retirer l'alarme
    Haptics.selectionAsync();
    update(i, { ...value[i], days });
  };
  const remove = (i: number) => {
    Haptics.selectionAsync();
    onChange(value.filter((_, j) => j !== i));
  };
  const add = () => {
    const last = value[value.length - 1];
    onChange([...value, last ? { time: hourAfter(last.time), days: last.days } : DEFAULT]);
    onPickTime(value.length);
  };

  return (
    <Animated.View layout={LinearTransition.duration(250)} style={styles.card}>
      <SwitchRow
        icon="alarm"
        label={value.length > 1 ? 'Alarmes' : 'Alarme'}
        sub={value.length ? alarmsLabel(value) : 'Sonnerie et plein écran, comme un réveil'}
        value={value.length > 0}
        onChange={(on) => onChange(on ? [DEFAULT] : [])}
      />
      {value.length > 0 && (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 12 }}>
          {value.map((a, i) => (
            <Animated.View
              key={i}
              entering={FadeIn.duration(200)}
              layout={LinearTransition.duration(250)}
              style={[{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }, i > 0 && styles.next]}>
              <PickerField label="Heure" numeric flex={0.8} value={a.time} onPress={() => onPickTime(i)} />
              <View style={{ flex: 2, gap: 6 }}>
                <View style={styles.daysHead}>
                  <AppText style={styles.label}>Jours</AppText>
                  <Pressable
                    onPress={() => remove(i)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Retirer l'alarme de ${a.time}`}>
                    <Icon name="x" size={15} color={colors.textTertiary} strokeWidth={2} />
                  </Pressable>
                </View>
                <View style={styles.days}>
                  {WEEKDAY_LETTERS.map((l, day) => {
                    const on = (a.days & (1 << day)) !== 0;
                    return (
                      <Pressable
                        key={day}
                        onPress={() => toggleDay(i, day)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${DAY_NAMES[day]}, alarme de ${a.time}`}
                        style={[styles.day, on && styles.dayOn]}>
                        <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color={on ? colors.onLight : colors.textTertiary}>
                          {l}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Animated.View>
          ))}
          {value.length < MAX_ALARMS && (
            <Pressable
              onPress={add}
              accessibilityRole="button"
              style={({ pressed }) => [styles.add, pressed && { borderColor: colors.textSecondary }]}>
              <Icon name="plus" size={16} color={colors.textSecondary} strokeWidth={2} />
              <AppText variant="label" color={colors.textSecondary}>
                Ajouter une alarme
              </AppText>
            </Pressable>
          )}
          <AppText variant="caption" style={{ lineHeight: 17 }}>
            {hint}
          </AppText>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Feuille d'heure (grilles heures / minutes) : alarme par défaut, `title` pour un autre usage (début, fin d'un rdv). */
export function AlarmTimeSheet({
  value, onDone, onClose, title = "Heure de l'alarme",
}: {
  value: string;
  onDone: (t: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const [h, setH] = useState(Number(value.slice(0, 2)));
  const [m, setM] = useState((Math.round(Number(value.slice(3, 5)) / 5) * 5) % 60);
  return (
    <Sheet inline onClosed={onClose} label={title}>
      {(close) => (
        <>
          <View style={{ paddingHorizontal: 4 }}>
            <AppText variant="caption">{title}</AppText>
            <AppText style={styles.big}>
              {pad(h)}:{pad(m)}
            </AppText>
          </View>
          <TimeGrid label="Heure" items={HOURS} value={h} onPick={setH} />
          <TimeGrid label="Minutes" items={MINUTES} value={m} onPick={setM} />
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onDone(`${pad(h)}:${pad(m)}`);
              close();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.done, pressed && { opacity: 0.85 }]}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
              Valider
            </AppText>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
  },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textTertiary },
  daysHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  next: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  add: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderDashed,
  },
  day: {
    flex: 1,
    height: 48,
    maxWidth: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: { backgroundColor: colors.text, borderColor: colors.text },
  big: { fontFamily: fonts.displayThin, fontSize: 56, lineHeight: 60, letterSpacing: -1.5, color: colors.text },
  done: { height: 50, borderRadius: 999, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
});
