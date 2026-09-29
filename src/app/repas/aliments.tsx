import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { FoodLine, SearchField } from '@/components/meal-parts';
import { BackHeader, Screen } from '@/components/screen';
import { listFoods } from '@/db/meals';
import { useDbQuery } from '@/db/use-query';
import { matchesQuery } from '@/lib/meal-format';
import { colors } from '@/theme/tokens';

/** Catalogue des aliments : portion, contenant et macros de chacun. */
export default function FoodsScreen() {
  const { data: foods } = useDbQuery(listFoods, '', { cacheId: 'aliments' });
  const [q, setQ] = useState('');
  const shown = (foods ?? []).filter((f) => matchesQuery(f.name, q));
  return (
    <Screen>
      <BackHeader
        title="Aliments"
        right={
          <Pressable
            onPress={() => router.push({ pathname: '/repas/aliment/nouveau', params: q.trim() ? { name: q.trim() } : {} })}
            accessibilityRole="button"
            accessibilityLabel="Nouvel aliment"
            style={styles.addBtn}>
            <Icon name="plus" size={20} color={colors.onLight} strokeWidth={2.4} />
          </Pressable>
        }
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <SearchField value={q} onChange={setQ} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(f) => String(f.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 40 }}
        renderItem={({ item }) => (
          <FoodLine
            food={item}
            hint="Modifier l'aliment"
            onPress={() => router.push({ pathname: '/repas/aliment/[id]', params: { id: String(item.id) } })}
          />
        )}
        ListEmptyComponent={
          foods ? (
            <View style={styles.empty}>
              <Icon name="leaf" size={28} color={colors.textMuted} strokeWidth={1.6} />
              <AppText variant="bodyStrong" color={colors.textSecondary}>
                {q.trim() ? 'Aucun aliment trouvé' : 'Aucun aliment pour l’instant'}
              </AppText>
              <AppText variant="caption" style={{ textAlign: 'center', fontSize: 13 }}>
                Un aliment décrit une portion, le contenant acheté et ses macros.
              </AppText>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { width: 44, height: 44, borderRadius: 22, marginRight: 8, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 24, marginTop: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: 22,
  },
});
