import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import { WishForm } from '@/components/wish-form';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { deleteWish, getWish, updateWish } from '@/db/wishes';
import { colors } from '@/theme/tokens';

/** Modifier une envie (crayon de l'aperçu, ou appui long sur sa carte). */
export default function EditWishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wishId = Number(id);
  const mutate = useDbMutation();
  const { data: wish } = useDbQuery((db) => getWish(db, wishId), id);

  if (wish === undefined) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!wish) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AppText variant="title">Envie introuvable</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <AppText variant="label" color={colors.textSecondary}>
            Retour
          </AppText>
        </Pressable>
      </Screen>
    );
  }
  return (
    <WishForm
      key={wish.id}
      title="Modifier l'envie"
      initial={wish}
      createdAt={wish.createdAt}
      onSave={async (d) => {
        await mutate((db) => updateWish(db, wish.id, d));
      }}
      onDelete={async () => {
        await mutate((db) => deleteWish(db, wish.id));
      }}
    />
  );
}
