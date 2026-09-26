import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { colors, fonts } from '@/theme/tokens';

export type AgendaView = 'liste' | 'jour' | 'semaine' | 'mois';

/** Hauteur du sélecteur (pilule 36 + marges internes + bordure). */
export const SWITCHER_H = 36 + 8 + 2;

const OPTIONS: { key: AgendaView; label: string }[] = [
  { key: 'liste', label: 'Liste' },
  { key: 'jour', label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
];

/** Sélecteur Liste / Jour / Semaine / Mois, posé en bas de l'écran au-dessus de la barre d'onglets. */
export function ViewSwitcher({ value, onChange }: { value: AgendaView; onChange: (v: AgendaView) => void }) {
  return <BottomSwitcher options={OPTIONS} value={value} onChange={onChange} />;
}

/** Pilule de choix du bas d'écran (agenda, objectifs) : mêmes tailles, même style partout. */
export function BottomSwitcher<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {options.map((o) => {
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
    padding: 4,
    backgroundColor: colors.segmented,
    borderWidth: 1,
    borderColor: '#26262A',
    borderRadius: 999,
  },
  item: { flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: colors.text },
});
