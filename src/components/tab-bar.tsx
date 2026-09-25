import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import type { Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { colors } from '@/theme/tokens';

type TabIconButtonProps = TabTriggerSlotProps & {
  icon: IconName;
  label: string;
  ref?: Ref<View>;
};

/** Un onglet rond de la barre pilule (plein et clair quand il est actif). */
export function TabIconButton({ icon, label, isFocused, onPress, ...props }: TabIconButtonProps) {
  return (
    <Pressable
      {...props}
      onPress={(e) => {
        if (!isFocused) Haptics.selectionAsync();
        onPress?.(e);
      }}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={[styles.tab, isFocused && styles.tabActive]}>
      <Icon name={icon} color={isFocused ? colors.onLight : colors.textSecondary} />
    </Pressable>
  );
}

/** Conteneur flottant : pilule d'onglets à gauche, bouton + à droite. */
export function FloatingTabBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View style={styles.pill}>{children}</View>
      {/* Anneau sombre autour du bouton : il reste visible sur fond noir comme sur la feuille blanche. */}
      <View style={styles.fabRing}>
        <Link href="/ajouter" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter"
            onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}>
            <Icon name="plus" size={26} strokeWidth={2.4} color={colors.onLight} />
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.5,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 12 },
  elevation: 12,
} as const;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
    backgroundColor: colors.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    ...shadow,
  },
  tab: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.text },
  fabRing: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: colors.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
