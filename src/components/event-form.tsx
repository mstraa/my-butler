import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Chip, FieldLabel, OptionSheet, PickerField, SwitchRow, TextField } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import type { Category, EventDraft } from '@/db/events';
import { RECURRENCES, REMINDERS } from '@/lib/event-options';
import { dateFieldLabel, dayOf, minutesOf, parseDay, shiftDay, type Stamp, stamp, timeOf } from '@/lib/dates';
import { colors, fonts } from '@/theme/tokens';

export { RECURRENCES, REMINDERS };

type Props = {
  title: string;
  initial: EventDraft;
  categories: Category[];
  onSave: (d: EventDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  readOnlyNote?: string;
  /** Formulaire intégré dans une feuille (édition depuis le détail) plutôt qu'en écran. */
  embedded?: { onClose: () => void; onDeleted: () => void };
};

const pad = (n: number) => String(n).padStart(2, '0');
const hhmmOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const addMinutes = (s: Stamp, min: number) => {
  const d = parseDay(dayOf(s));
  d.setHours(0, minutesOf(timeOf(s)) + min, 0, 0);
  return stamp(d);
};
const toDate = (s: Stamp) => {
  const d = parseDay(dayOf(s));
  d.setHours(0, minutesOf(timeOf(s)), 0, 0);
  return d;
};

function pickDate(value: Stamp, onPick: (day: string) => void) {
  DateTimePickerAndroid.open({
    value: toDate(value),
    mode: 'date',
    onValueChange: (_e, d) => onPick(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`),
  });
}
function pickTime(value: Stamp, onPick: (hhmm: string) => void) {
  DateTimePickerAndroid.open({
    value: toDate(value),
    mode: 'time',
    is24Hour: true,
    onValueChange: (_e, d) => onPick(hhmmOf(d)),
  });
}

/** Formulaire « Nouveau rendez-vous » / « Modifier le rendez-vous » (maquette HF-NouveauRdv). */
export function EventForm({ title, initial, categories, onSave, onDelete, readOnlyNote, embedded }: Props) {
  const close = () => (embedded ? embedded.onClose() : router.back());
  const [d, setD] = useState<EventDraft>(initial);
  const [sheet, setSheet] = useState<'reminder' | 'repeat' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const set = (patch: Partial<EventDraft>) => setD((cur) => ({ ...cur, ...patch }));
  const duration = d.endsAt ? Math.max(15, minutesBetween(d.startsAt, d.endsAt)) : 60;

  const titleError = !d.title.trim() ? 'Donne un titre au rendez-vous.' : null;
  const endError = !d.allDay && d.endsAt && d.endsAt <= d.startsAt ? 'La fin doit être après le début.' : null;
  const deadlineWarn = d.deadline && d.deadline.at >= d.startsAt ? "L'échéance tombe après le début du rendez-vous." : null;
  const invalid = !!(titleError || endError);

  const save = async () => {
    if (invalid) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      await onSave(d);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaving(false);
      close();
    } catch (e) {
      setSaving(false);
      Alert.alert("Impossible d'enregistrer", e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () =>
    Alert.alert('Supprimer ce rendez-vous ?', "Il disparaît de l'agenda, sans historique.", [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await onDelete?.();
          if (embedded) embedded.onDeleted();
          else router.dismissAll(); // le rdv n'existe plus : retour à l'agenda
        },
      },
    ]);

  const toggleDeadline = (on: boolean) =>
    set({
      deadline: on
        ? {
            label: d.deadline?.label ?? '',
            at: `${maxDay(shiftDay(dayOf(d.startsAt), -2))}T20:00`,
          }
        : null,
    });

  return (
    <SafeAreaView
      edges={embedded ? ['bottom'] : ['top', 'bottom']}
      style={{ flex: 1, backgroundColor: embedded ? colors.surfaceRaised : colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.iconBtn}>
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
              onChangeText={(title) => set({ title })}
              placeholder="Ex. Dîner chez Marc"
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

          <Animated.View entering={FadeInDown.delay(120).duration(400)} style={{ gap: 6 }}>
            <View style={styles.row}>
              <PickerField
                label="Date"
                flex={2}
                value={dateFieldLabel(dayOf(d.startsAt))}
                onPress={() =>
                  pickDate(d.startsAt, (day) => {
                    const startsAt = `${day}T${timeOf(d.startsAt)}`;
                    set({ startsAt, endsAt: d.endsAt ? addMinutes(startsAt, duration) : null });
                  })
                }
              />
              <PickerField
                label="Début"
                numeric
                disabled={d.allDay}
                value={timeOf(d.startsAt)}
                onPress={() =>
                  pickTime(d.startsAt, (hhmm) => {
                    const startsAt = `${dayOf(d.startsAt)}T${hhmm}`;
                    set({ startsAt, endsAt: addMinutes(startsAt, duration) });
                  })
                }
              />
              <PickerField
                label="Fin"
                numeric
                disabled={d.allDay}
                value={d.endsAt ? timeOf(d.endsAt) : '—'}
                onPress={() =>
                  pickTime(d.endsAt ?? addMinutes(d.startsAt, 60), (hhmm) => {
                    // Une fin plus tôt que le début passe au lendemain (ex. 22:00 → 01:00).
                    let endsAt = `${dayOf(d.startsAt)}T${hhmm}`;
                    if (endsAt <= d.startsAt) endsAt = `${shiftDay(dayOf(d.startsAt), 1)}T${hhmm}`;
                    set({ endsAt });
                  })
                }
              />
            </View>
            {showErrors && endError && <ErrorText>{endError}</ErrorText>}
          </Animated.View>

          <SwitchRow
            label="Toute la journée"
            value={d.allDay}
            onChange={(allDay) =>
              set({
                allDay,
                startsAt: allDay ? `${dayOf(d.startsAt)}T00:00` : `${dayOf(d.startsAt)}T09:00`,
                endsAt: allDay ? null : `${dayOf(d.startsAt)}T10:00`,
              })
            }
          />

          <TextField
            label="Lieu"
            icon="pin"
            value={d.location}
            onChangeText={(location) => set({ location })}
            placeholder="Adresse ou lien"
          />

          <View style={styles.row}>
            <PickerField
              label="Rappel"
              chevron
              value={REMINDERS.find((r) => r.value === d.reminderMin)?.label ?? 'Aucun'}
              onPress={() => setSheet('reminder')}
            />
            <PickerField
              label="Répéter"
              chevron
              value={RECURRENCES.find((r) => r.value === d.recurrence)?.label ?? 'Jamais'}
              onPress={() => setSheet('repeat')}
            />
          </View>

          <Animated.View layout={LinearTransition.duration(250)} style={styles.deadlineCard}>
            <SwitchRow label="Échéance avant le rdv" icon="timer" value={!!d.deadline} onChange={toggleDeadline} />
            {d.deadline && (
              <Animated.View entering={FadeIn.duration(250)} style={{ gap: 10 }}>
                <TextField
                  label="À faire"
                  value={d.deadline.label}
                  onChangeText={(label) => set({ deadline: { ...d.deadline!, label } })}
                  placeholder="Confirmer ma venue"
                />
                <View style={styles.row}>
                  <PickerField
                    label="Avant le"
                    flex={2}
                    value={dateFieldLabel(dayOf(d.deadline.at))}
                    onPress={() =>
                      pickDate(d.deadline!.at, (day) => set({ deadline: { ...d.deadline!, at: `${day}T${timeOf(d.deadline!.at)}` } }))
                    }
                  />
                  <PickerField
                    label="Heure"
                    numeric
                    value={timeOf(d.deadline.at)}
                    onPress={() =>
                      pickTime(d.deadline!.at, (hhmm) => set({ deadline: { ...d.deadline!, at: `${dayOf(d.deadline!.at)}T${hhmm}` } }))
                    }
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={styles.lateDot} />
                  <AppText variant="caption" color={colors.textSecondary} style={{ flex: 1, lineHeight: 17 }}>
                    Passée sans action →{' '}
                    <AppText variant="caption" color={colors.late} style={{ fontFamily: fonts.bodySemiBold }}>
                      « En retard »
                    </AppText>{' '}
                    dans l&apos;agenda et la notification fixe.
                  </AppText>
                </View>
                {deadlineWarn && <ErrorText warn>{deadlineWarn}</ErrorText>}
              </Animated.View>
            )}
          </Animated.View>

          <View style={styles.note}>
            <Icon name="info" size={16} color={colors.textTertiary} />
            <AppText variant="caption" color={colors.textSecondary} style={{ flex: 1 }}>
              {readOnlyNote ?? "Rendez-vous local : il n'est pas envoyé vers Google Agenda."}
            </AppText>
          </View>

          {onDelete && (
            <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.deleteBtn}>
              <Icon name="trash" size={18} color={colors.textSecondary} />
              <AppText variant="label" color={colors.textSecondary}>
                Supprimer le rendez-vous
              </AppText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={sheet === 'reminder'}
        title="Rappel"
        options={REMINDERS}
        value={d.reminderMin}
        onPick={(reminderMin) => set({ reminderMin })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'repeat'}
        title="Répéter"
        options={RECURRENCES}
        value={d.recurrence}
        onPick={(recurrence) => set({ recurrence })}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

function ErrorText({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <AppText variant="caption" color={warn ? colors.late : '#FF6B6B'} accessibilityLiveRegion="polite">
      {children}
    </AppText>
  );
}

function minutesBetween(a: Stamp, b: Stamp) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 60000);
}

/** Pas d'échéance proposée dans le passé : au plus tôt aujourd'hui. */
function maxDay(k: string) {
  const today = stamp(new Date()).slice(0, 10);
  return k < today ? today : k;
}

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  deadlineCard: {
    gap: 12,
    padding: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
  },
  lateDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, backgroundColor: colors.late },
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
