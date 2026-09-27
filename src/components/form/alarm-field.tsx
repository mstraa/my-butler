import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { PickerField, SwitchRow } from '@/components/form/fields';
import { HOURS, MINUTES, pad, TimeGrid } from '@/components/form/time-grid';
import { Sheet } from '@/components/sheet';
import { ALL_DAYS, alarmDaysLabel, type DailyAlarm, WEEKDAY_LETTERS } from '@/lib/alarm';
import { colors, fonts } from '@/theme/tokens';

const DEFAULT: DailyAlarm = { time: '20:00', days: ALL_DAYS };

/**
 * Alarme quotidienne d'un objectif ou d'un suivi : interrupteur, heure, jours de la semaine.
 * `hint` : quand l'alarme se tait (déjà atteint, déjà noté…). `onPickTime` ouvre AlarmTimeSheet,
 * posée à la racine du formulaire (une feuille « inline » couvre son parent).
 */
export function AlarmField({
  value, onChange, onPickTime, hint,
}: {
  value: DailyAlarm | null;
  onChange: (a: DailyAlarm | null) => void;
  onPickTime: () => void;
  hint: string;
}) {
  const toggleDay = (i: number) => {
    if (!value) return;
    const days = value.days ^ (1 << i);
    if (!days) return; // au moins un jour : sinon, couper l'alarme
    Haptics.selectionAsync();
    onChange({ ...value, days });
  };

  return (
    <Animated.View layout={LinearTransition.duration(250)} style={styles.card}>
      <SwitchRow
        icon="alarm"
        label="Alarme"
        sub={value ? `${value.time} · ${alarmDaysLabel(value.days)}` : 'Sonnerie et plein écran, comme un réveil'}
        value={!!value}
        onChange={(on) => onChange(on ? DEFAULT : null)}
      />
      {value && (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <PickerField label="Heure" numeric flex={0.8} value={value.time} onPress={onPickTime} />
            <View style={{ flex: 2, gap: 6 }}>
              <AppText style={styles.label}>Jours</AppText>
              <View style={styles.days}>
                {WEEKDAY_LETTERS.map((l, i) => {
                  const on = (value.days & (1 << i)) !== 0;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => toggleDay(i)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][i]}
                      style={[styles.day, on && styles.dayOn]}>
                      <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color={on ? colors.onLight : colors.textTertiary}>
                        {l}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
          <AppText variant="caption" style={{ lineHeight: 17 }}>
            {hint}
          </AppText>
        </Animated.View>
      )}
    </Animated.View>
  );
}

export function AlarmTimeSheet({ value, onDone, onClose }: { value: string; onDone: (t: string) => void; onClose: () => void }) {
  const [h, setH] = useState(Number(value.slice(0, 2)));
  const [m, setM] = useState((Math.round(Number(value.slice(3, 5)) / 5) * 5) % 60);
  return (
    <Sheet inline onClosed={onClose} label="Heure de l'alarme">
      {(close) => (
        <>
          <View style={{ paddingHorizontal: 4 }}>
            <AppText variant="caption">Heure de l&apos;alarme</AppText>
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
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
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
