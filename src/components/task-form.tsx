import { endOfMonth } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { DateTimeSheet } from '@/components/form/date-time-sheet';
import { NoteEditor } from '@/components/form/note-editor';
import { Chip, FieldLabel, OptionSheet, PickerField, SwitchRow, TextField } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import type { Category } from '@/db/events';
import { formatEuros, parseEuros, type TaskDraft } from '@/db/tasks';
import { NAGS, REMINDERS } from '@/lib/event-options';
import { dateFieldLabel, type DayKey, dayKey, dayOf, nowStamp, parseDay, shiftDay, type Stamp, timeOf, todayKey, weekDays } from '@/lib/dates';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

type Props = {
  title: string;
  initial: TaskDraft;
  categories: Category[];
  onSave: (d: TaskDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
};

/** Échéance par défaut du jour : 18:00, ou l'heure pleine suivante si 18:00 est déjà passé aujourd'hui. */
export function defaultDue(day: DayKey): Stamp {
  if (day !== todayKey() || new Date().getHours() < 18) return `${day}T18:00`;
  const h = Math.min(new Date().getHours() + 1, 23);
  return `${day}T${String(h).padStart(2, '0')}:00`;
}

/** Raccourcis de date : la date change, l'heure limite reste. */
function shortcuts(): { label: string; day: DayKey }[] {
  const today = todayKey();
  return [
    { label: "Aujourd'hui", day: today },
    { label: 'Demain', day: shiftDay(today, 1) },
    { label: 'Fin de sem.', day: weekDays(today)[6] },
    { label: 'Fin du mois', day: dayKey(endOfMonth(parseDay(today))) },
  ];
}

/** Formulaire « Nouvelle tâche » / « Modifier la tâche » (maquette HF-NouvelleTache). */
export function TaskForm({ title, initial, categories, onSave, onDelete }: Props) {
  const [d, setD] = useState<TaskDraft>(initial);
  // L'échéance reste en mémoire quand on coupe l'interrupteur, pour la retrouver si on le rallume.
  const [dueAt, setDueAt] = useState<Stamp>(initial.due ?? defaultDue(initial.day));
  const [estimate, setEstimate] = useState(initial.estimateCents !== null ? formatEuros(initial.estimateCents) : '');
  const [sheet, setSheet] = useState<'due' | 'day' | 'reminder' | 'nag' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  /** Raccourci de date touché en dernier (null : date choisie à la main). */
  const [preset, setPreset] = useState<string | null>(null);

  const set = (patch: Partial<TaskDraft>) => setD((cur) => ({ ...cur, ...patch }));
  const hasDue = d.due !== null;
  const setDue = (at: Stamp) => {
    setDueAt(at);
    set({ due: at, day: dayOf(at) });
  };

  const titleError = !d.title.trim() ? 'Donne un titre à la tâche.' : null;
  const estimateError = d.tracksExpense && estimate.trim() && parseEuros(estimate) === null ? 'Montant illisible.' : null;
  const pastWarn = hasDue && !initial.due && dueAt < nowStamp() ? "L'échéance est déjà passée." : null;

  const save = async () => {
    if (titleError || estimateError) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...d, estimateCents: d.tracksExpense ? parseEuros(estimate) : null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setSaving(false);
      showDialog("Impossible d'enregistrer", e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () =>
    showDialog('Supprimer cette tâche ?', "Elle disparaît de l'agenda, avec son historique.", [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await onDelete?.();
          router.back();
        },
      },
    ]);

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
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 6 }}>
            <TextField
              label="Titre"
              big
              value={d.title}
              onChangeText={(t) => set({ title: t })}
              placeholder="Ex. Renvoyer dossier mutuelle"
              autoFocus={!initial.title}
              returnKeyType="done"
            />
            {showErrors && titleError && <ErrorText>{titleError}</ErrorText>}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(400)} style={{ gap: 8 }}>
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

          <Animated.View entering={FadeInDown.delay(120).duration(400)} layout={LinearTransition.duration(250)} style={styles.card}>
            <SwitchRow
              label="Échéance"
              icon="timer"
              value={hasDue}
              onChange={(on) => set(on ? { due: dueAt, day: dayOf(dueAt) } : { due: null })}
            />
            {hasDue ? (
              <Animated.View entering={FadeIn.duration(250)} style={{ gap: 10 }}>
                <View style={styles.row}>
                  <PickerField label="Date" value={dateFieldLabel(dayOf(dueAt))} onPress={() => setSheet('due')} />
                  <PickerField label="Heure limite" numeric value={timeOf(dueAt)} onPress={() => setSheet('due')} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {shortcuts().map((q) => {
                    // Deux raccourcis peuvent tomber le même jour (ex. Demain = Fin de sem. le samedi) :
                    // seul celui qu'on a touché s'allume.
                    const on = preset === q.label && dayOf(dueAt) === q.day;
                    return (
                      <Pressable
                        key={q.label}
                        onPress={() => {
                          setDue(`${q.day}T${timeOf(dueAt)}`);
                          setPreset(q.label);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[styles.quick, on && { backgroundColor: colors.text, borderColor: colors.text }]}>
                        <AppText
                          numberOfLines={1}
                          style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 12 }}
                          color={on ? colors.onLight : '#D4D4D8'}>
                          {q.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {pastWarn && <ErrorText warn>{pastWarn}</ErrorText>}
                <PickerField
                  label="Rappel avant l'échéance"
                  chevron
                  value={REMINDERS.find((r) => r.value === d.reminderMin)?.label ?? 'Aucun'}
                  onPress={() => setSheet('reminder')}
                />
                <View style={styles.lateBlock}>
                  <FieldLabel>Si l&apos;échéance passe sans action</FieldLabel>
                  <Pressable
                    onPress={() => set({ showLate: !d.showLate })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: d.showLate }}
                    style={styles.checkRow}>
                    <View style={[styles.box, d.showLate && styles.boxOn]}>
                      {d.showLate && <Icon name="check" size={14} color={colors.onLight} strokeWidth={3} />}
                    </View>
                    <AppText variant="body" style={{ flex: 1, fontSize: 13 }}>
                      Afficher{' '}
                      <AppText variant="body" color={colors.late} style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>
                        « En retard »
                      </AppText>{' '}
                      (agenda + notif fixe)
                    </AppText>
                  </Pressable>
                  <View style={[styles.nagRow, !d.showLate && { opacity: 0.35 }]}>
                    <AppText variant="body" style={{ fontSize: 14 }}>
                      Relancer
                    </AppText>
                    <Pressable
                      onPress={() => setSheet('nag')}
                      disabled={!d.showLate}
                      accessibilityRole="button"
                      accessibilityLabel={`Relancer : ${nagLabel(d.nagAt)}`}
                      style={({ pressed }) => [styles.pill, pressed && { borderColor: colors.textSecondary }]}>
                      <AppText variant="body" style={{ fontSize: 13 }}>
                        {nagLabel(d.nagAt)}
                      </AppText>
                      <View style={{ transform: [{ rotate: '90deg' }] }}>
                        <Icon name="chevronRight" size={14} color={colors.textTertiary} strokeWidth={2} />
                      </View>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(250)}>
                <PickerField label="Prévue le" chevron value={dateFieldLabel(d.day)} onPress={() => setSheet('day')} />
              </Animated.View>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(400)} layout={LinearTransition.duration(250)} style={styles.card}>
            <Pressable
              onPress={() => set({ tracksExpense: !d.tracksExpense })}
              accessibilityRole="switch"
              accessibilityState={{ checked: d.tracksExpense }}
              style={styles.switchRow}>
              <View style={[styles.switchIcon, { backgroundColor: withAlpha(categoryColors.groceries, 0.13) }]}>
                <Icon name="wallet" size={16} color={categoryColors.groceries} />
              </View>
              <AppText variant="bodyStrong" style={{ flex: 1, fontSize: 15 }}>
                Suivre la dépense
              </AppText>
              <View style={[styles.track, d.tracksExpense && { backgroundColor: colors.text }]}>
                <View style={[styles.knob, d.tracksExpense && { backgroundColor: colors.onLight, transform: [{ translateX: 18 }] }]} />
              </View>
            </Pressable>
            {d.tracksExpense && (
              <Animated.View entering={FadeIn.duration(250)} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <AppText variant="caption" color={colors.textSecondary} nativeID="lbl-estimate">
                    Estimation (facultatif)
                  </AppText>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TextInput
                      accessibilityLabelledBy="lbl-estimate"
                      value={estimate}
                      onChangeText={setEstimate}
                      placeholder="—"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="decimal-pad"
                      cursorColor={colors.text}
                      style={styles.amount}
                    />
                    <AppText style={styles.euro} color={colors.textTertiary}>
                      €
                    </AppText>
                  </View>
                </View>
                {showErrors && estimateError && <ErrorText>{estimateError}</ErrorText>}
                <AppText variant="caption">Le montant réel est demandé quand tu coches la tâche.</AppText>
              </Animated.View>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).duration(400)}>
            <NoteEditor
              value={d.notes}
              onChange={(notes) => set({ notes })}
              placeholder="Détails, liste de choses à faire…"
            />
          </Animated.View>

          {hasDue && d.showLate && (
            <Animated.View entering={FadeInDown.delay(240).duration(400)} style={styles.note}>
              <Icon name="info" size={16} color={colors.textTertiary} />
              <AppText variant="caption" color={colors.textSecondary} style={{ flex: 1, lineHeight: 17 }}>
                Compte comme action : Fait, Reporté ou Abandonné. Sans l&apos;une des trois, la tâche reste en retard.
              </AppText>
            </Animated.View>
          )}

          {onDelete && (
            <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.deleteBtn}>
              <Icon name="trash" size={18} color={colors.textSecondary} />
              <AppText variant="label" color={colors.textSecondary}>
                Supprimer la tâche
              </AppText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <DateTimeSheet
        visible={sheet === 'due'}
        title="Échéance"
        timeLabel="Heure limite"
        value={{ day: dayOf(dueAt), start: timeOf(dueAt), end: null }}
        onDone={({ day, start }) => {
          setDue(`${day}T${start}`);
          setPreset(null);
        }}
        onClose={() => setSheet(null)}
      />
      <DateTimeSheet
        visible={sheet === 'day'}
        title="Tâche prévue le"
        allDay
        value={{ day: d.day, start: '00:00', end: null }}
        onDone={({ day }) => {
          set({ day });
          setDueAt(`${day}T${timeOf(dueAt)}`);
        }}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'reminder'}
        title="Rappel avant l'échéance"
        options={REMINDERS}
        value={d.reminderMin}
        onPick={(reminderMin) => set({ reminderMin })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'nag'}
        title="Relancer"
        options={NAGS}
        value={d.nagAt}
        onPick={(nagAt) => set({ nagAt })}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

const nagLabel = (v: string | null) => NAGS.find((n) => n.value === v)?.label ?? 'Jamais';

function ErrorText({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <AppText variant="caption" color={warn ? colors.late : '#FF6B6B'} accessibilityLiveRegion="polite">
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  card: {
    gap: 12,
    padding: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
  },
  quick: {
    flex: 1,
    minWidth: 0,
    height: 34,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderRadius: 999,
  },
  lateBlock: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  checkRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.text, borderColor: colors.text },
  nagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    backgroundColor: colors.segmented,
  },
  switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  track: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.borderDashed, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, marginLeft: 3, backgroundColor: colors.textTertiary },
  amount: {
    height: 42,
    paddingLeft: 12,
    paddingRight: 30,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderDashed,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 15,
  },
  euro: { position: 'absolute', right: 12, top: 10, fontFamily: fonts.displayMedium, fontSize: 15 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 14,
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
