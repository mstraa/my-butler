import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { colors, fonts } from '@/theme/tokens';

export type AgendaView = 'liste' | 'jour' | 'semaine' | 'mois';

const OPTIONS: { key: AgendaView; label: string }[] = [
  { key: 'liste', label: 'Liste' },
  { key: 'jour', label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
];

/** Sélecteur Liste / Jour / Semaine / Mois, sous l'en-tête des vues de l'agenda. */
export function ViewSwitcher({ value, onChange }: { value: AgendaView; onChange: (v: AgendaView) => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {OPTIONS.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.item, on && styles.itemOn]}>
            <AppText
              style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 13 }}
              color={on ? colors.onLight : colors.textSecondary}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    backgroundColor: colors.segmented,
    borderWidth: 1,
    borderColor: '#26262A',
    borderRadius: 999,
  },
  item: { flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: colors.text },
});
