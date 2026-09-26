import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { FieldLabel, TextField } from '@/components/form/fields';
import { Icon, type IconName } from '@/components/icon';
import {
  type CategoryDraft, countCategoryUses, createCategory, deleteCategory, getCategory, updateCategory,
} from '@/db/categories';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

const ICONS: IconName[] = [
  'note', 'work', 'friends', 'home', 'health', 'cart', 'sport', 'cake', 'wallet', 'heart',
  'gift', 'glass', 'book', 'pill', 'fruit', 'drop', 'moon', 'sun', 'phone', 'video', 'pin', 'target',
];
const COLORS = Object.values(categoryColors);

/** Nouvelle catégorie (`id` = « nouvelle ») ou modification d'une catégorie, depuis les Réglages. */
export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = id === 'nouvelle' ? null : Number(id);
  const { data } = useDbQuery(async (db) => (categoryId === null ? null : getCategory(db, categoryId)), id);

  if (categoryId !== null && data === undefined) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (categoryId !== null && !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AppText variant="title">Catégorie introuvable</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <AppText variant="label" color={colors.textSecondary}>
            Retour
          </AppText>
        </Pressable>
      </SafeAreaView>
    );
  }
  return (
    <CategoryForm
      key={id}
      categoryId={categoryId}
      initial={data ? { name: data.name, color: data.color, icon: data.icon } : { name: '', color: COLORS[0], icon: 'note' }}
    />
  );
}

function CategoryForm({ categoryId, initial }: { categoryId: number | null; initial: CategoryDraft }) {
  const db = useSQLiteContext();
  const mutate = useDbMutation();
  const [d, setD] = useState<CategoryDraft>(initial);
  const [showError, setShowError] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<CategoryDraft>) => setD((c) => ({ ...c, ...patch }));
  const nameError = !d.name.trim() ? 'Donne un nom à la catégorie.' : null;

  const save = async () => {
    if (nameError) {
      setShowError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      await mutate((x) => (categoryId === null ? createCategory(x, d) : updateCategory(x, categoryId, d)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setSaving(false);
      showDialog("Impossible d'enregistrer", e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = async () => {
    if (categoryId === null) return;
    const uses = await countCategoryUses(db, categoryId);
    showDialog(
      `Supprimer « ${initial.name} » ?`,
      uses > 0
        ? `${uses} élément${uses > 1 ? 's' : ''} (dépenses, rendez-vous, tâches…) passe${uses > 1 ? 'nt' : ''} sans catégorie.`
        : "Aucun élément n'y est rangé.",
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await mutate((x) => deleteCategory(x, categoryId));
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.iconBtn}>
          <Icon name="x" />
        </Pressable>
        <AppText variant="display" numberOfLines={1} style={{ flex: 1, fontSize: 24 }}>
          {categoryId === null ? 'Nouvelle catégorie' : 'Catégorie'}
        </AppText>
        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.7 }]}>
          <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
            Enregistrer
          </AppText>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 6 }}>
            <TextField
              label="Nom"
              big
              value={d.name}
              onChangeText={(name) => set({ name })}
              placeholder="Ex. Loisirs"
              autoFocus={!initial.name}
            />
            {showError && nameError && (
              <AppText variant="caption" color="#FF6B6B" accessibilityLiveRegion="polite">
                {nameError}
              </AppText>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(30).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Couleur</FieldLabel>
            <View style={styles.wrap}>
              {COLORS.map((c) => {
                const on = d.color === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => set({ color: c })}
                    accessibilityRole="radio"
                    accessibilityLabel={`Couleur ${c}`}
                    accessibilityState={{ checked: on }}
                    style={[styles.swatchRing, on && { borderColor: c }]}>
                    <View style={[styles.swatch, { backgroundColor: c }]} />
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Icône</FieldLabel>
            <View style={styles.wrap}>
              {ICONS.map((ic) => {
                const on = d.icon === ic;
                return (
                  <Pressable
                    key={ic}
                    onPress={() => set({ icon: ic })}
                    accessibilityRole="radio"
                    accessibilityLabel={`Icône ${ic}`}
                    accessibilityState={{ checked: on }}
                    style={[styles.iconChoice, { backgroundColor: on ? withAlpha(d.color, 0.18) : colors.surface }, on && { borderColor: d.color }]}>
                    <Icon name={ic} size={18} color={on ? d.color : colors.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {categoryId !== null && (
            <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.ghostBtn}>
              <Icon name="trash" size={16} color={colors.textSecondary} />
              <AppText variant="label" color={colors.textSecondary}>
                Supprimer
              </AppText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatchRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  ghostBtn: {
    height: 48,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDashed,
  },
});
