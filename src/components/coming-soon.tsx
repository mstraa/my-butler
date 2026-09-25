import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { colors, withAlpha } from '@/theme/tokens';

/** Bloc d'attente pour les écrans pas encore construits. */
export function ComingSoon({ icon, color, title, text }: { icon: IconName; color: string; title: string; text: string }) {
  return (
    <View style={styles.card}>
      <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.13) }]}>
        <Icon name={icon} color={color} />
      </View>
      <AppText variant="title">{title}</AppText>
      <AppText variant="body" color={colors.textTertiary} style={{ lineHeight: 20 }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    padding: 20,
    gap: 10,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
