import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { colors, fonts } from '@/theme/tokens';

type Props = {
  title: string;
  /** Partie du titre en gris (ex. l'année). */
  titleMuted?: string;
  subtitle?: string;
  prevLabel: string;
  nextLabel: string;
  onShift: (dir: -1 | 1) => void;
  /** Revenir à aujourd'hui (affiché seulement si on s'en est éloigné). */
  onToday?: () => void;
};

/** En-tête des vues Jour / Semaine / Mois : flèche, titre centré, flèche. */
export function PeriodHeader({ title, titleMuted, subtitle, prevLabel, nextLabel, onShift, onToday }: Props) {
  return (
    <View style={styles.header}>
      <Arrow dir={-1} label={prevLabel} onPress={() => onShift(-1)} />
      <Pressable
        onPress={onToday}
        disabled={!onToday}
        accessibilityRole={onToday ? 'button' : 'header'}
        accessibilityHint={onToday ? "Revenir à aujourd'hui" : undefined}
        style={styles.center}>
        <Animated.View key={title} entering={FadeInDown.duration(300)} style={{ alignItems: 'center' }}>
          <AppText variant="display" style={{ fontSize: subtitle ? 24 : 26, lineHeight: subtitle ? 28 : 32 }} numberOfLines={1}>
            {title}
            {titleMuted ? <AppText variant="display" color={colors.textTertiary}>{` ${titleMuted}`}</AppText> : null}
          </AppText>
          {!!subtitle && (
            <AppText variant="caption" numberOfLines={1}>
              {subtitle}
            </AppText>
          )}
          {onToday && (
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 11 }} color={colors.textSecondary}>
              Aujourd&apos;hui ›
            </AppText>
          )}
        </Animated.View>
      </Pressable>
      <Arrow dir={1} label={nextLabel} onPress={() => onShift(1)} />
    </View>
  );
}

function Arrow({ dir, label, onPress }: { dir: -1 | 1; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.arrow, pressed && { backgroundColor: colors.segmented }]}>
      <View style={{ transform: [{ scaleX: dir }] }}>
        <Icon name="chevronRight" size={20} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  arrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
