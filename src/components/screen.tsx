import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { colors } from '@/theme/tokens';

/** Fond sombre + marges de sécurité en haut. */
export function Screen({ style, children, ...rest }: ViewProps) {
  return (
    <SafeAreaView edges={['top']} style={[styles.screen, style]} {...rest}>
      {children}
    </SafeAreaView>
  );
}

/** En-tête d'un écran secondaire : retour + titre. */
export function BackHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        style={styles.iconBtn}>
        <Icon name="back" />
      </Pressable>
      <AppText variant="display" style={{ flex: 1, fontSize: 26 }} numberOfLines={1}>
        {title}
      </AppText>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
