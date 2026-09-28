import { Pressable, StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/form/fields';
import { Icon, type IconName } from '@/components/icon';
import { colors, pickerColors, withAlpha } from '@/theme/tokens';

/** Icônes proposées pour les objectifs et les suivis, avec leur nom lu par le lecteur d'écran. */
const ICONS: [IconName, string][] = [
  ['target', 'cible'], ['task', 'tâche'], ['flame', 'flamme'], ['star', 'étoile'], ['heart', 'cœur'],
  ['health', 'santé'], ['pulse', 'pouls'], ['sport', 'haltère'], ['bike', 'vélo'], ['steps', 'pas'],
  ['fruit', 'fruit'], ['drop', 'goutte'], ['glass', 'verre'], ['coffee', 'café'], ['pill', 'médicament'],
  ['tooth', 'dent'], ['moon', 'lune'], ['bed', 'lit'], ['sun', 'soleil'], ['timer', 'chrono'],
  ['clock', 'horloge'], ['book', 'livre'], ['note', 'note'], ['bulb', 'idée'], ['code', 'code'],
  ['music', 'musique'], ['chat', 'discussion'], ['leaf', 'feuille'], ['sprout', 'pousse'], ['paw', 'animal'],
  ['smile', 'sourire'], ['euro', 'argent'], ['scale', 'balance'], ['smoke', 'cigarette'],
];

/** Choix de l'icône et de la couleur (formulaires d'objectif et de suivi). */
export function IconColorPicker({
  icon, color, onIcon, onColor,
}: {
  icon: string | null;
  color: string;
  onIcon: (icon: IconName) => void;
  onColor: (color: string) => void;
}) {
  return (
    <>
      <FieldLabel>Icône et couleur</FieldLabel>
      <View style={styles.icons} accessibilityRole="radiogroup" accessibilityLabel="Icône">
        {ICONS.map(([ic, label]) => {
          const on = icon === ic;
          return (
            <Pressable
              key={ic}
              onPress={() => onIcon(ic)}
              accessibilityRole="radio"
              accessibilityLabel={`Icône ${label}`}
              accessibilityState={{ checked: on }}
              style={[styles.iconChoice, { backgroundColor: on ? withAlpha(color, 0.18) : colors.surface }, on && { borderColor: color }]}>
              <Icon name={ic} size={18} color={on ? color : colors.textSecondary} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel="Couleur">
        {pickerColors.map(([c, label]) => {
          const on = color === c;
          return (
            <Pressable
              key={c}
              onPress={() => onColor(c)}
              accessibilityRole="radio"
              accessibilityLabel={`Couleur ${label}`}
              accessibilityState={{ checked: on }}
              style={[styles.swatchRing, on && { borderColor: c }]}>
              <View style={[styles.swatch, { backgroundColor: c }]} />
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatchRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
});
