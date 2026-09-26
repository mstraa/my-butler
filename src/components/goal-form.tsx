import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { Chip, FieldLabel, TextField } from '@/components/form/fields';
import { Icon, type IconName } from '@/components/icon';
import { GOAL_COLORS } from '@/db/agenda';
import type { GoalDraft, GoalKind, GoalPeriod } from '@/db/goals';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: 'day', label: 'Chaque jour' },
  { value: 'week', label: 'Chaque semaine' },
  { value: 'month', label: 'Chaque mois' },
];
const KINDS: { value: GoalKind; label: string; hint: string }[] = [
  { value: 'counter', label: 'Compteur', hint: '+1 à chaque fois' },
  { value: 'value', label: 'Valeur', hint: 'Un nombre à saisir (pas, km…)' },
  { value: 'duration', label: 'Durée', hint: 'Des minutes, avec chrono' },
  { value: 'bool', label: 'Oui / non', hint: 'Fait ou pas' },
];
const ICONS: IconName[] = ['target', 'fruit', 'steps', 'book', 'sport', 'pill', 'drop', 'moon', 'heart', 'health', 'note', 'clock'];
const COLORS = [...GOAL_COLORS, categoryColors.personal];

type Props = {
  title: string;
  initial: GoalDraft;
  onSave: (d: GoalDraft) => Promise<void>;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
};

/** Formulaire « Nouvel objectif » / « Modifier l'objectif ». */
export function GoalForm({ title, initial, onSave, onArchive, onDelete }: Props) {
  const [d, setD] = useState<GoalDraft>(initial);
  // Cible vide pour un nouvel objectif (target 0) : l'exemple s'affiche en gris.
  const [targetText, setTargetText] = useState(initial.kind === 'bool' || !initial.target ? '' : String(initial.target).replace('.', ','));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<GoalDraft>) => setD((c) => ({ ...c, ...patch }));

  const target = Number(targetText.replace(',', '.'));
  const titleError = !d.title.trim() ? "Donne un nom à l'objectif." : null;
  const targetError = d.kind !== 'bool' && !(target > 0) ? 'Indique une cible supérieure à 0.' : null;
  const color = d.color ?? COLORS[0];

  const save = async () => {
    if (titleError || targetError) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...d, target: d.kind === 'bool' ? 1 : target, unit: d.kind === 'duration' ? 'min' : d.unit, color });
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
          <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 6 }}>
            <TextField
              label="Objectif"
              big
              value={d.title}
              onChangeText={(t) => set({ title: t })}
              placeholder="Ex. Boire 1,5 L d'eau"
              autoFocus={!initial.title}
            />
            {showErrors && titleError && <ErrorText>{titleError}</ErrorText>}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(20).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Période</FieldLabel>
            <View style={styles.chips}>
              {PERIODS.map((p) => (
                <Chip key={p.value} label={p.label} selected={d.period === p.value} onPress={() => set({ period: p.value })} />
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(40).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Type</FieldLabel>
            <View style={styles.kinds} accessibilityRole="radiogroup">
              {KINDS.map((k) => {
                const on = d.kind === k.value;
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => set({ kind: k.value })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[styles.kind, on && styles.kindOn]}>
                    <AppText variant="bodyStrong" style={{ fontSize: 15 }}>
                      {k.label}
                    </AppText>
                    <AppText variant="caption" color={on ? colors.textSecondary : colors.textTertiary}>
                      {k.hint}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {d.kind !== 'bool' && (
            <Animated.View entering={FadeIn.duration(200)} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={d.kind === 'duration' ? 'Cible (minutes)' : 'Cible'}
                    value={targetText}
                    onChangeText={(t) => setTargetText(t.replace(/[^\d,.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder={d.kind === 'value' ? '8000' : d.kind === 'duration' ? '20' : '5'}
                    style={{ fontFamily: fonts.displayMedium, fontSize: 17 }}
                  />
                </View>
                {d.kind !== 'duration' && (
                  <View style={{ flex: 1.4 }}>
                    <TextField
                      label="Unité (facultatif)"
                      value={d.unit}
                      onChangeText={(unit) => set({ unit })}
                      placeholder={d.kind === 'value' ? 'pas, km, verres…' : 'séances, fruits…'}
                    />
                  </View>
                )}
              </View>
              {showErrors && targetError && <ErrorText>{targetError}</ErrorText>}
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(60).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Icône et couleur</FieldLabel>
            <View style={styles.icons}>
              {ICONS.map((ic) => {
                const on = d.icon === ic;
                return (
                  <Pressable
                    key={ic}
                    onPress={() => set({ icon: ic })}
                    accessibilityRole="radio"
                    accessibilityLabel={`Icône ${ic}`}
                    accessibilityState={{ checked: on }}
                    style={[styles.iconChoice, { backgroundColor: on ? withAlpha(color, 0.18) : colors.surface }, on && { borderColor: color }]}>
                    <Icon name={ic} size={18} color={on ? color : colors.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.colors}>
              {COLORS.map((c) => {
                const on = color === c;
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

          {(onArchive || onDelete) && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              {onArchive && (
                <Pressable
                  onPress={() =>
                    showDialog("Mettre l'objectif en pause ?", "Il disparaît des écrans ; son historique est gardé.", [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: 'Mettre en pause',
                        onPress: async () => {
                          await onArchive();
                          router.back();
                        },
                      },
                    ])
                  }
                  accessibilityRole="button"
                  style={styles.ghostBtn}>
                  <AppText variant="label" color={colors.textSecondary}>
                    Mettre en pause
                  </AppText>
                </Pressable>
              )}
              {onDelete && (
                <Pressable
                  onPress={() =>
                    showDialog('Supprimer cet objectif ?', 'Son historique est supprimé aussi.', [
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
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  saveBtn: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 2,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  kindOn: { borderColor: colors.text, backgroundColor: colors.row },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatchRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  ghostBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDashed,
  },
});
