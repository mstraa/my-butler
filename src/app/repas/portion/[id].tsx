import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { MacroPills, PortionStepper } from '@/components/meal-parts';
import { Sheet } from '@/components/sheet';
import { deleteMealItem, foodMacros, getMealItem, type MealItem, updateMealItem } from '@/db/meals';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dateFieldLabel } from '@/lib/dates';
import { kcalText, MEALS, quantityText } from '@/lib/meal-format';
import { colors, fonts } from '@/theme/tokens';

/** Portions d'un aliment dans un repas : modifier, retirer. */
export default function PortionSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: item, loadedKey } = useDbQuery((db) => getMealItem(db, Number(id)), id);
  if (!item || loadedKey !== id) return null;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <PortionEditor item={item} />
    </KeyboardAvoidingView>
  );
}

function PortionEditor({ item }: { item: MealItem }) {
  const mutate = useDbMutation();
  const [n, setN] = useState(item.portions);
  const m = foodMacros(item.food, n);
  return (
    <Sheet label={`Portions de ${item.food.name}`}>
      {(close) => (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="caption">
                {MEALS[item.meal].label} · {dateFieldLabel(item.day)}
              </AppText>
              <AppText variant="title">{item.food.name}</AppText>
              <AppText variant="caption">{quantityText(item.food, n)}</AppText>
            </View>
            {!item.food.archived && (
              <Pressable
                onPress={() => close(() => router.replace({ pathname: '/repas/aliment/[id]', params: { id: String(item.food.id) } }))}
                accessibilityRole="button"
                accessibilityLabel="Modifier l'aliment"
                style={styles.iconBtn}>
                <Icon name="edit" size={18} />
              </Pressable>
            )}
          </View>
          <PortionStepper value={n} onChange={setN} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
            <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 18 }}>{kcalText(m)}</AppText>
            <MacroPills m={m} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Retiré après la fermeture : sinon l'écran se vide avant la fin de l'animation.
                close(() => {
                  router.back();
                  mutate((db) => deleteMealItem(db, item.id));
                });
              }}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: '#232327' }]}>
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color="#D4D4D8">
                Retirer
              </AppText>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (n !== item.portions) await mutate((db) => updateMealItem(db, item.id, n));
                close();
              }}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.text }]}>
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
                Enregistrer
              </AppText>
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.row },
  btn: { flex: 1, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
