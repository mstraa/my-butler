import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { createContext, type Ref, use } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFabTone } from '@/components/fab-tone';
import { Icon, type IconName } from '@/components/icon';
import { getSelectedDay } from '@/lib/selected-day';
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

/**
 * Espace à laisser en bas d'un écran pour qu'une carte s'arrête au-dessus de la barre
 * flottante : marge du bas + hauteur de la barre (60) + 16 px d'air.
 */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return tabBarTop(insets.bottom) + 16 + use(BottomExtraContext);
}

/** Hauteur, depuis le bas de l'écran, du haut de la barre flottante. */
export const tabBarTop = (insetBottom: number) => Math.max(insetBottom, 12) + 8 + 60;

/** Place en plus occupée au-dessus de la barre (ex. le sélecteur de vue de l'agenda). */
export const BottomExtraContext = createContext(0);

/** Conteneur flottant : pilule d'onglets à gauche, bouton + à droite. */
export function FloatingTabBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const dark = useFabTone() === 'dark';
  const pathname = usePathname();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View style={styles.pill}>{children}</View>
      {/* Bouton + des maquettes : blanc sur fond noir, sombre au-dessus d'une feuille blanche. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ajouter"
        onPressIn={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        onPress={() => {
          // Onglet Dépenses : le + ouvre directement la saisie d'une dépense.
          if (pathname === '/depenses') return router.push('/depense/nouvelle');
          // Sur l'agenda (Jour / Mois), on ajoute au jour choisi.
          const day = pathname === '/' ? getSelectedDay() : null;
          router.push(day ? { pathname: '/ajouter', params: { day } } : '/ajouter');
        }}
        style={({ pressed }) => [
          styles.fab,
          dark && styles.fabDark,
          pressed && { transform: [{ scale: 0.94 }] },
        ]}>
        <Icon name="plus" size={24} strokeWidth={2} color={dark ? colors.text : colors.onLight} />
      </Pressable>
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
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  fabDark: { backgroundColor: colors.onLight },
});
