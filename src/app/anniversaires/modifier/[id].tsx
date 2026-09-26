import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BirthdayForm } from '@/components/birthday-form';
import { Screen } from '@/components/screen';
import { deleteBirthday, getBirthdayDraft, updateBirthday } from '@/db/birthdays';
import { getCategories } from '@/db/events';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { colors } from '@/theme/tokens';

export default function EditBirthdayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const birthdayId = Number(id);
  const mutate = useDbMutation();
  const { data } = useDbQuery(async (db) => {
    const [birthday, categories] = await Promise.all([getBirthdayDraft(db, birthdayId), getCategories(db)]);
    return { birthday, categories };
  }, id);

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (!data.birthday) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AppText variant="title">Anniversaire introuvable</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <AppText variant="label" color={colors.textSecondary}>
            Retour
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  const { birthday, categories } = data;
  return (
    <BirthdayForm
      key={birthday.id}
      title="Modifier l'anniversaire"
      categories={categories}
      initial={birthday}
      onSave={async (draft) => {
        await mutate((db) => updateBirthday(db, birthday.id, draft));
      }}
      onDelete={async () => {
        await mutate((db) => deleteBirthday(db, birthday.id));
      }}
    />
  );
}
