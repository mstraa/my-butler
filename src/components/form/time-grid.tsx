import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { colors, fonts } from '@/theme/tokens';

export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
export const pad = (n: number) => String(n).padStart(2, '0');

/** Grille de valeurs à toucher (heures, minutes), comme dans les feuilles d'heure. */
export function TimeGrid({ label, items, value, onPick }: { label: string; items: number[]; value: number; onPick: (v: number) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="overline" style={{ paddingHorizontal: 4 }}>
        {label}
      </AppText>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {items.map((v) => {
          const on = v === value;
          return (
            <Pressable
              key={v}
              onPress={() => {
                Haptics.selectionAsync();
                onPick(v);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.cell, on && { backgroundColor: colors.text }]}>
              <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 16 }} color={on ? colors.onLight : colors.text}>
                {pad(v)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: '15.2%', flexGrow: 1, height: 44, borderRadius: 14, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
});
