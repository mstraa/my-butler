import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { TextField } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import type { FoodDraft } from '@/db/meals';
import { fmtNum, numText, parseNum } from '@/lib/meal-format';
import { colors, fonts } from '@/theme/tokens';

type Props = {
  title: string;
  initial: FoodDraft;
  onSave: (d: FoodDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const NUM_FIELDS = ['portionsPerContainer', 'kcal', 'protein', 'carbs', 'fat'] as const;
type NumField = (typeof NUM_FIELDS)[number];

export const EMPTY_FOOD: FoodDraft = {
  name: '', portionLabel: '', containerLabel: '', portionsPerContainer: null, kcal: null, protein: null, carbs: null, fat: null,
};

/** Formulaire « Nouvel aliment » / « Modifier l'aliment » : portion, contenant, macros d'une portion. */
export function FoodForm({ title, initial, onSave, onDelete }: Props) {
  const [name, setName] = useState(initial.name);
  const [portionLabel, setPortionLabel] = useState(initial.portionLabel);
  const [containerLabel, setContainerLabel] = useState(initial.containerLabel);
  const [nums, setNums] = useState<Record<NumField, string>>(() => ({
    portionsPerContainer: numText(initial.portionsPerContainer),
    kcal: numText(initial.kcal),
    protein: numText(initial.protein),
    carbs: numText(initial.carbs),
    fat: numText(initial.fat),
  }));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsed = Object.fromEntries(NUM_FIELDS.map((k) => [k, parseNum(nums[k])])) as Record<NumField, number | null>;
  const badNum = NUM_FIELDS.some((k) => Number.isNaN(parsed[k]));
  const nameError = !name.trim() ? "Donne un nom à l'aliment." : null;
  // Sans kcal saisies : estimation depuis les macros (4 kcal/g de protéines et glucides, 9 de lipides).
  const hasMacros = parsed.protein !== null || parsed.carbs !== null || parsed.fat !== null;
  const kcalGuess = hasMacros && !badNum ? (parsed.protein ?? 0) * 4 + (parsed.carbs ?? 0) * 4 + (parsed.fat ?? 0) * 9 : null;

  const setNum = (k: NumField) => (t: string) => setNums((c) => ({ ...c, [k]: t.replace(/[^\d,.]/g, '') }));

  const save = async () => {
    if (nameError || badNum || parsed.portionsPerContainer === 0) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        portionLabel: portionLabel.trim(),
        containerLabel: containerLabel.trim(),
        portionsPerContainer: parsed.portionsPerContainer,
        kcal: parsed.kcal ?? (kcalGuess !== null ? Math.round(kcalGuess) : null),
        protein: parsed.protein,
        carbs: parsed.carbs,
        fat: parsed.fat,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setSaving(false);
      showDialog("Impossible d'enregistrer", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.iconBtn}>
          <Icon name="x" />
        </Pressable>
        <AppText variant="display" numberOfLines={1} style={{ flex: 1, fontSize: 24 }}>
          {title}
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
          <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 6 }}>
            <TextField label="Nom" value={name} onChangeText={setName} placeholder="Ex. Riz basmati" autoFocus={!initial.name} big />
            {showErrors && nameError && <ErrorText>{nameError}</ErrorText>}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(300)} style={styles.section}>
            <AppText variant="overline">Portion</AppText>
            <TextField
              label="Une portion, c'est…"
              value={portionLabel}
              onChangeText={setPortionLabel}
              placeholder="Ex. 80 g, 1 pot, 2 tranches"
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(300)} style={styles.section}>
            <AppText variant="overline">Contenant acheté</AppText>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 3 }}>
                <TextField label="Contenant" value={containerLabel} onChangeText={setContainerLabel} placeholder="Ex. Sachet 1 kg" />
              </View>
              <View style={{ flex: 2 }}>
                <TextField
                  label="Portions dedans"
                  value={nums.portionsPerContainer}
                  onChangeText={setNum('portionsPerContainer')}
                  keyboardType="decimal-pad"
                  placeholder="Ex. 12,5"
                  style={styles.numInput}
                />
              </View>
            </View>
            {showErrors && (Number.isNaN(parsed.portionsPerContainer) || parsed.portionsPerContainer === 0) ? (
              <ErrorText>Nombre de portions illisible.</ErrorText>
            ) : (
              <AppText variant="caption">
                Sert à la liste de courses : 1 kg de riz en portions de 80 g, c&apos;est 12,5 portions.
              </AppText>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(300)} style={styles.section}>
            <AppText variant="overline">Macros d&apos;une portion</AppText>
            <View style={styles.grid}>
              <MacroField
                label="Calories (kcal)"
                value={nums.kcal}
                onChange={setNum('kcal')}
                placeholder={kcalGuess !== null ? `≈ ${fmtNum(kcalGuess, 0)}` : '0'}
              />
              <MacroField label="Protéines (g)" value={nums.protein} onChange={setNum('protein')} />
              <MacroField label="Glucides (g)" value={nums.carbs} onChange={setNum('carbs')} />
              <MacroField label="Lipides (g)" value={nums.fat} onChange={setNum('fat')} />
            </View>
            {showErrors && badNum && !Number.isNaN(parsed.portionsPerContainer) && <ErrorText>Une valeur est illisible.</ErrorText>}
            {kcalGuess !== null && parsed.kcal === null && (
              <AppText variant="caption">Calories laissées vides : estimées depuis les macros.</AppText>
            )}
          </Animated.View>

          {onDelete && (
            <Animated.View entering={FadeIn.delay(240).duration(300)}>
              <Pressable
                onPress={() =>
                  showDialog('Supprimer cet aliment ?', 'Il disparaît du catalogue. Les repas où il est déjà prévu le gardent.', [
                    { text: 'Garder', style: 'cancel' },
                    {
                      text: 'Supprimer',
                      style: 'destructive',
                      onPress: async () => {
                        await onDelete();
                        router.back();
                      },
                    },
                  ])
                }
                accessibilityRole="button"
                style={styles.ghostBtn}>
                <Icon name="trash" size={16} color={colors.textSecondary} />
                <AppText variant="label" color={colors.textSecondary}>
                  Supprimer
                </AppText>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MacroField({
  label, value, onChange, placeholder = '0',
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={{ width: '48%', flexGrow: 1 }}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        style={styles.numInput}
      />
    </View>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="caption" color="#FF6B6B" accessibilityLiveRegion="polite">
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { height: 40, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 22 },
  section: { gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  numInput: { fontFamily: fonts.displayMedium, fontSize: 18 },
  ghostBtn: {
    height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed,
  },
});
