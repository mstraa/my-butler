import { format, getDaysInMonth } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { Chip, FieldLabel, OptionSheet, PickerField, TextField } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import { type BirthdayDraft, buyBefore, nextOccurrence } from '@/db/birthdays';
import type { Category } from '@/db/events';
import { parseDay, todayKey } from '@/lib/dates';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const REMIND_TIMES = ['08:00', '09:00', '10:00', '12:00', '18:00', '20:00'].map((t) => ({ value: t, label: t }));
const BUY_DAYS = [1, 3, 7, 14];

type Props = {
  title: string;
  initial: BirthdayDraft;
  categories: Category[];
  onSave: (d: BirthdayDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
};

/** Formulaire « Nouvel anniversaire » / « Modifier l'anniversaire » (maquette HF-NouvelAnniversaire). */
export function BirthdayForm({ title, initial, categories, onSave, onDelete }: Props) {
  const [d, setD] = useState<BirthdayDraft>(initial);
  const [dayText, setDayText] = useState(initial.day ? String(initial.day).padStart(2, '0') : '');
  const [yearText, setYearText] = useState(initial.year ? String(initial.year) : '');
  const [idea, setIdea] = useState('');
  const [sheet, setSheet] = useState<'month' | 'time' | 'buy' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const set = (patch: Partial<BirthdayDraft>) => setD((cur) => ({ ...cur, ...patch }));
  const thisYear = Number(todayKey().slice(0, 4));

  const day = Number(dayText);
  const year = yearText ? Number(yearText) : null;
  // Un 29 février reste possible (année bissextile de référence).
  const maxDay = getDaysInMonth(new Date(2024, d.month - 1, 1));
  const nameError = !d.name.trim() ? 'Indique un nom.' : null;
  const dayError = !Number.isInteger(day) || day < 1 || day > maxDay ? `Jour entre 1 et ${maxDay}.` : null;
  const yearError = year !== null && (year < 1900 || year > thisYear) ? 'Année invalide.' : null;
  const age = year && !yearError ? thisYear - year : null;
  const next = !dayError ? nextOccurrence(d.month, day) : null;

  const addIdea = () => {
    if (!idea.trim()) return;
    set({ ideas: [...d.ideas, { title: idea.trim() }] });
    setIdea('');
  };

  const save = async () => {
    if (nameError || dayError || yearError) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      // Une idée tapée mais pas encore validée est gardée.
      const ideas = idea.trim() ? [...d.ideas, { title: idea.trim() }] : d.ideas;
      await onSave({ ...d, day, year, ideas });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setSaving(false);
      showDialog("Impossible d'enregistrer", e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () =>
    showDialog('Supprimer cet anniversaire ?', 'Ses idées et son historique de cadeaux sont supprimés aussi.', [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await onDelete?.();
          router.dismissAll(); // la fiche n'existe plus
        },
      },
    ]);

  const reminders = [
    { key: 'remindD7', label: 'J-7' },
    { key: 'remindD1', label: 'J-1' },
    { key: 'remindD0', label: 'Le jour' },
  ] as const;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.iconBtn}>
          <Icon name="x" />
        </Pressable>
        <AppText variant="display" numberOfLines={1} style={{ flex: 1, fontSize: 22 }}>
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
              label="Nom"
              big
              value={d.name}
              onChangeText={(name) => set({ name })}
              placeholder="Ex. Marc"
              autoFocus={!initial.name}
              returnKeyType="next"
            />
            {showErrors && nameError && <ErrorText>{nameError}</ErrorText>}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(20).duration(260)} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Jour"
                  value={dayText}
                  onChangeText={(t) => setDayText(t.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                  placeholder="03"
                  style={styles.num}
                />
              </View>
              <PickerField label="Mois" flex={2} chevron value={MONTHS[d.month - 1]} onPress={() => setSheet('month')} />
              <View style={{ flex: 1.4 }}>
                <TextField
                  label="Année"
                  value={yearText}
                  onChangeText={(t) => setYearText(t.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  placeholder="facult."
                  style={styles.num}
                />
              </View>
            </View>
            {showErrors && (dayError || yearError) && <ErrorText>{dayError ?? yearError}</ErrorText>}
            <View style={styles.ageLine}>
              <View style={styles.cake}>
                <Icon name="cake" size={16} color={categoryColors.birthday} />
              </View>
              <AppText variant="body" color={colors.textSecondary} style={{ flex: 1, fontSize: 13 }}>
                {age !== null && (
                  <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 16 }}>{age} ans cette année · </AppText>
                )}
                se répète chaque année
              </AppText>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(40).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Catégorie</FieldLabel>
            <View style={styles.chips}>
              {categories
                .filter((c) => c.key !== 'birthday')
                .map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    dot={c.color}
                    selected={d.categoryId === c.id}
                    onPress={() => set({ categoryId: d.categoryId === c.id ? null : c.id })}
                  />
                ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(260)} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <FieldLabel>Rappels</FieldLabel>
              <Pressable
                onPress={() => setSheet('time')}
                disabled={!d.remindD7 && !d.remindD1 && !d.remindD0}
                accessibilityRole="button"
                accessibilityLabel={`Heure des rappels : ${d.remindTime}`}
                hitSlop={8}
                style={{ opacity: !d.remindD7 && !d.remindD1 && !d.remindD0 ? 0.35 : 1 }}>
                <AppText variant="caption" color={colors.textSecondary}>
                  à <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 13 }}>{d.remindTime}</AppText> ›
                </AppText>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {reminders.map((r) => {
                const on = d[r.key];
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => set({ [r.key]: !on })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={[styles.remind, on && styles.remindOn]}>
                    <View style={[styles.box, on && styles.boxOn]}>
                      {on && <Icon name="check" size={11} color={colors.text} strokeWidth={3.4} />}
                    </View>
                    <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={on ? colors.text : colors.textTertiary}>
                      {r.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(260)} layout={LinearTransition.duration(200)} style={styles.card}>
            <Pressable
              onPress={() => set({ trackGifts: !d.trackGifts })}
              accessibilityRole="switch"
              accessibilityState={{ checked: d.trackGifts }}
              style={styles.switchRow}>
              <View style={styles.cake}>
                <Icon name="gift" size={16} color={categoryColors.birthday} />
              </View>
              <AppText style={{ flex: 1, fontFamily: fonts.displayMedium, fontSize: 18 }}>Idées cadeaux</AppText>
              <View style={[styles.track, d.trackGifts && { backgroundColor: colors.success }]}>
                <View style={[styles.knob, d.trackGifts && { transform: [{ translateX: 20 }] }]} />
              </View>
            </Pressable>

            {d.trackGifts ? (
              <Animated.View entering={FadeIn.duration(180)} style={{ gap: 8 }}>
                {d.ideas.map((it, i) => (
                  <Animated.View key={`${it.id ?? 'n'}-${i}-${it.title}`} entering={FadeInRight.duration(200)} exiting={FadeOut.duration(150)} style={styles.idea}>
                    <AppText variant="bodyMedium" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>
                      {it.title}
                    </AppText>
                    <Pressable
                      onPress={() => set({ ideas: d.ideas.filter((_, j) => j !== i) })}
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer l'idée ${it.title}`}
                      style={styles.removeBtn}>
                      <Icon name="x" size={16} color={colors.textSecondary} />
                    </Pressable>
                  </Animated.View>
                ))}
                <TextInput
                  value={idea}
                  onChangeText={setIdea}
                  onSubmitEditing={addIdea}
                  submitBehavior="submit"
                  returnKeyType="done"
                  placeholder="+ Ajouter une idée"
                  placeholderTextColor={colors.textTertiary}
                  cursorColor={colors.text}
                  accessibilityLabel="Nouvelle idée cadeau"
                  style={styles.ideaInput}
                />
                <View style={styles.buyRow}>
                  <AppText variant="bodyMedium" style={{ fontSize: 14 }}>
                    Acheter avant
                  </AppText>
                  <Pressable
                    onPress={() => setSheet('buy')}
                    accessibilityRole="button"
                    accessibilityLabel={`Acheter avant : ${buyLabel(d.buyDays, next)}`}
                    style={({ pressed }) => [styles.buyBtn, pressed && { borderColor: colors.textSecondary }]}>
                    <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 15 }}>{buyLabel(d.buyDays, next)}</AppText>
                  </Pressable>
                </View>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(180)}>
                <AppText variant="body" color={colors.textTertiary} style={{ fontSize: 13 }}>
                  Pas de suivi de cadeau pour cet anniversaire.
                </AppText>
              </Animated.View>
            )}
          </Animated.View>

          {onDelete && (
            <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.deleteBtn}>
              <Icon name="trash" size={18} color={colors.textSecondary} />
              <AppText variant="label" color={colors.textSecondary}>
                Supprimer l&apos;anniversaire
              </AppText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={sheet === 'month'}
        title="Mois"
        options={MONTHS.map((m, i) => ({ value: i + 1, label: m.charAt(0).toUpperCase() + m.slice(1) }))}
        value={d.month}
        onPick={(month) => set({ month })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'time'}
        title="Heure des rappels"
        options={REMIND_TIMES}
        value={d.remindTime}
        onPick={(remindTime) => set({ remindTime })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'buy'}
        title="Acheter le cadeau avant"
        options={BUY_DAYS.map((n) => ({ value: n, label: `${n} jour${n > 1 ? 's' : ''} avant (J-${n})` }))}
        value={d.buyDays}
        onPick={(buyDays) => set({ buyDays })}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

/** « J-3 · 30/09 » (la date quand le jour est connu). */
function buyLabel(n: number, next: string | null) {
  return next ? `J-${n} · ${format(parseDay(buyBefore({ buyDays: n }, next)), 'dd/MM')}` : `J-${n}`;
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
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 14 },
  num: { fontFamily: fonts.displayMedium, fontSize: 18 },
  ageLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  cake: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: withAlpha(categoryColors.birthday, 0.13),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remind: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  remindOn: { borderColor: colors.text, backgroundColor: colors.row },
  box: { width: 18, height: 18, borderRadius: 6, borderWidth: 1.5, borderColor: '#5B5B61', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.success, borderColor: colors.success },
  card: { gap: 10, padding: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  switchRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.borderDashed, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, marginLeft: 3, backgroundColor: colors.text },
  idea: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 4, backgroundColor: colors.row, borderRadius: 14 },
  removeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ideaInput: {
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  buyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  buyBtn: {
    height: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
  },
  deleteBtn: {
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
