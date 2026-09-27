import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { HOURS, MINUTES, pad, TimeGrid } from '@/components/form/time-grid';
import { Sheet } from '@/components/sheet';
import { getTracker, setSleepTime, setTrackerValue } from '@/db/tracking';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { mediumDayLabel } from '@/lib/dates';
import { colors, fonts } from '@/theme/tokens';

// Sommeil : des heures plausibles d'abord, dans l'ordre de la nuit.
const HOURS_WOKE = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const HOURS_SLEPT = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Heure notée dans un suivi : type « heure » (ex. lever), ou coucher / lever d'un suivi « sommeil » (`field`).
 * Heures puis minutes, à toucher.
 */
export default function TrackerTimeSheet() {
  const { id, day, value, field } = useLocalSearchParams<{ id: string; day: string; value?: string; field?: 'slept' | 'woke' }>();
  const mutate = useDbMutation();
  const { data: tracker } = useDbQuery((db) => getTracker(db, Number(id)), id);
  const now = new Date();
  const init = value ? Number(value) : field === 'woke' ? 7 * 60 : field === 'slept' ? 23 * 60 : now.getHours() * 60 + now.getMinutes();
  const hours = field === 'woke' ? HOURS_WOKE : field === 'slept' ? HOURS_SLEPT : HOURS;
  const [h, setH] = useState(Math.floor(init / 60) % 24);
  const [m, setM] = useState((Math.round((init % 60) / 5) * 5) % 60);

  const save = (v: number | null) =>
    mutate((db) => (field ? setSleepTime(db, Number(id), day, field, v) : setTrackerValue(db, Number(id), day, v)));
  const label = field === 'woke' ? `Levé le ${mediumDayLabel(day)}` : field === 'slept' ? `Couché la nuit du ${mediumDayLabel(day)}` : `${tracker?.name ?? 'Heure'} · ${mediumDayLabel(day)}`;

  return (
    <Sheet label={field === 'woke' ? 'Heure de lever' : field === 'slept' ? 'Heure de coucher' : tracker?.name ?? 'Heure'}>
      {(close) => (
        <>
          <View style={{ paddingHorizontal: 4 }}>
            <AppText variant="caption">
              {label}
            </AppText>
            <AppText style={styles.big}>
              {pad(h)}:{pad(m)}
            </AppText>
          </View>
          <TimeGrid label="Heure" items={hours} value={h} onPick={setH} />
          <TimeGrid label="Minutes" items={MINUTES} value={m} onPick={setM} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {value ? (
              <Pressable
                onPress={async () => {
                  await save(null);
                  close();
                }}
                accessibilityRole="button"
                style={[styles.btn, { backgroundColor: '#232327' }]}>
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color="#D4D4D8">
                  Effacer
                </AppText>
              </Pressable>
            ) : null}
            <Pressable
              onPress={async () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await save(h * 60 + m);
                close();
              }}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.text }]}>
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
                Enregistrer
              </AppText>
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  big: { fontFamily: fonts.displayThin, fontSize: 56, lineHeight: 60, letterSpacing: -1.5, color: colors.text },
  btn: { flex: 1, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
