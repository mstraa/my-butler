import { differenceInMinutes } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { AlarmTimeSheet } from '@/components/form/alarm-field';
import { DateTimeSheet } from '@/components/form/date-time-sheet';
import { NoteEditor } from '@/components/form/note-editor';
import { Chip, FieldLabel, OptionSheet, PickerField, SwitchRow, TextField } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import type { Category, EventDraft } from '@/db/events';
import { RECURRENCES, REMINDER_KINDS, REMINDERS } from '@/lib/event-options';
import { dateFieldLabel, dayOf, minutesOf, parseDay, parseStamp, shiftDay, type Stamp, stamp, timeOf } from '@/lib/dates';
import { colors, fonts } from '@/theme/tokens';

export { RECURRENCES, REMINDERS };

type Props = {
  title: string;
  initial: EventDraft;
  categories: Category[];
  onSave: (d: EventDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  readOnlyNote?: string;
  /** Importé de Google Agenda : titre, horaires, lieu et répétition viennent de Google, non modifiables. */
  external?: boolean;
};

const addMinutes = (s: Stamp, min: number) => {
  const d = parseDay(dayOf(s));
  d.setHours(0, minutesOf(timeOf(s)) + min, 0, 0);
  return stamp(d);
};

/** Formulaire « Nouveau rendez-vous » / « Modifier le rendez-vous » (maquette HF-NouveauRdv). */
export function EventForm({ title, initial, categories, onSave, onDelete, readOnlyNote, external }: Props) {
  const [d, setD] = useState<EventDraft>(() => ({ ...initial, notes: initial.notes ?? '', location: initial.location ?? '' }));
  const [sheet, setSheet] = useState<'reminder' | 'reminderKind' | 'repeat' | 'day' | 'start' | 'end' | 'deadline' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const set = (patch: Partial<EventDraft>) => setD((cur) => ({ ...cur, ...patch }));

  const endsAt = d.endsAt ?? addMinutes(d.startsAt, 60);
  /** Changer le jour ou l'heure de début garde la durée du rendez-vous. */
  const moveStart = (startsAt: Stamp) => {
    if (d.allDay) return set({ startsAt: `${dayOf(startsAt)}T00:00`, endsAt: null });
    const dur = differenceInMinutes(parseStamp(endsAt), parseStamp(d.startsAt));
    set({ startsAt, endsAt: addMinutes(startsAt, dur > 0 ? dur : 60) });
  };

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
      router.back();
    } catch (e) {
      setSaving(false);
      showDialog("Impossible d'enregistrer", e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = () =>
    showDialog('Supprimer ce rendez-vous ?', "Il disparaît de l'agenda, sans historique.", [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await onDelete?.();
          router.dismissAll(); // le rdv n'existe plus : retour à l'agenda
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
          <Animated.View
            entering={FadeInDown.duration(400)}
            pointerEvents={external ? 'none' : 'auto'}
            style={[{ gap: 6 }, external && styles.locked]}>
            <TextField
              label="Titre"
              big
              value={d.title}
              onChangeText={(title) => set({ title })}
              placeholder="Ex. Dîner chez Marc"
              autoFocus={!initial.title && !external}
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

          <Animated.View
            entering={FadeInDown.delay(120).duration(400)}
            pointerEvents={external ? 'none' : 'auto'}
            style={[{ gap: 6 }, external && styles.locked]}>
            <PickerField label="Jour" chevron value={dateFieldLabel(dayOf(d.startsAt))} onPress={() => setSheet('day')} />
            {!d.allDay && (
              <View style={[styles.row, { marginTop: 8 }]}>
                <PickerField label="Début" numeric value={timeOf(d.startsAt)} onPress={() => setSheet('start')} />
                <PickerField
                  label="Fin"
                  numeric
                  value={`${timeOf(endsAt)}${dayOf(endsAt) > dayOf(d.startsAt) ? ' +1' : ''}`}
                  onPress={() => setSheet('end')}
                />
              </View>
            )}
            {showErrors && endError && <ErrorText>{endError}</ErrorText>}
          </Animated.View>

          <View pointerEvents={external ? 'none' : 'auto'} style={[{ gap: 14 }, external && styles.locked]}>
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
          </View>

          <NoteEditor value={d.notes} onChange={(notes) => set({ notes })} placeholder="Code d'accès, choses à apporter…" />

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
              disabled={external}
              value={RECURRENCES.find((r) => r.value === d.recurrence)?.label ?? 'Jamais'}
              onPress={() => setSheet('repeat')}
            />
          </View>
          {d.reminderMin !== null && (
            <Animated.View entering={FadeIn.duration(200)}>
              <PickerField
                label="Type de rappel"
                chevron
                value={d.reminderKind === 'alarm' ? 'Alarme · sonnerie et plein écran' : 'Notification'}
                onPress={() => setSheet('reminderKind')}
              />
            </Animated.View>
          )}

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
                    onPress={() => setSheet('deadline')}
                  />
                  <PickerField
                    label="Heure"
                    numeric
                    value={timeOf(d.deadline.at)}
                    onPress={() => setSheet('deadline')}
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

      <DateTimeSheet
        visible={sheet === 'day'}
        title="Rendez-vous"
        allDay={d.allDay}
        dateOnly
        value={{ day: dayOf(d.startsAt), start: timeOf(d.startsAt), end: d.allDay ? null : timeOf(endsAt) }}
        onDone={({ day }) => moveStart(`${day}T${timeOf(d.startsAt)}`)}
        onClose={() => setSheet(null)}
      />
      {sheet === 'start' && (
        <AlarmTimeSheet
          title="Heure de début"
          value={timeOf(d.startsAt)}
          onDone={(t) => moveStart(`${dayOf(d.startsAt)}T${t}`)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'end' && (
        <AlarmTimeSheet
          title="Heure de fin"
          value={timeOf(endsAt)}
          onDone={(t) => {
            const day = dayOf(d.startsAt);
            // Une fin plus tôt que le début passe au lendemain (ex. 22:00 → 01:00).
            set({ endsAt: t > timeOf(d.startsAt) ? `${day}T${t}` : `${shiftDay(day, 1)}T${t}` });
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {d.deadline && (
        <DateTimeSheet
          visible={sheet === 'deadline'}
          title="Échéance avant le rdv"
          timeLabel="Heure"
          value={{ day: dayOf(d.deadline.at), start: timeOf(d.deadline.at), end: null }}
          onDone={({ day, start }) => set({ deadline: { ...d.deadline!, at: `${day}T${start}` } })}
          onClose={() => setSheet(null)}
        />
      )}
      <OptionSheet
        visible={sheet === 'reminder'}
        title="Rappel"
        options={REMINDERS}
        value={d.reminderMin}
        onPick={(reminderMin) => set({ reminderMin })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'reminderKind'}
        title="Type de rappel"
        options={REMINDER_KINDS}
        value={d.reminderKind}
        onPick={(reminderKind) => set({ reminderKind })}
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
  locked: { opacity: 0.45 },
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
