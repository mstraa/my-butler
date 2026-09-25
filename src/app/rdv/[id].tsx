import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { OptionSheet } from '@/components/form/fields';
import { Icon, type IconName } from '@/components/icon';
import { postponeLate } from '@/db/agenda';
import {
  deleteEvent, duplicateEvent, type EventRecord, getCategories, getEvent, restoreEvent, setEventDeadlineDone, setEventNotes,
} from '@/db/events';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dayOf, shiftDay, timeOf } from '@/lib/dates';
import {
  categoryOf, deadlineLabel, durationLabel, longDate, occurrenceOf, recurrenceLabel, reminderLabel, timeRange,
} from '@/lib/event-format';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/** Détail d'un rendez-vous (maquette HF-RdvDetail). */
export default function EventDetail() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const eventId = Number(id);
  const mutate = useDbMutation();
  const [menu, setMenu] = useState(false);
  const { data } = useDbQuery(async (db) => {
    const [event, categories] = await Promise.all([getEvent(db, eventId), getCategories(db)]);
    return { event, categories };
  }, id);

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const e = data.event;
  if (!e) {
    return (
      <SafeAreaView style={[styles.screen, { alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
        <AppText variant="title">Rendez-vous introuvable</AppText>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <AppText variant="label" color={colors.textSecondary}>
            Retour
          </AppText>
        </Pressable>
      </SafeAreaView>
    );
  }

  const cat = categoryOf(e, data.categories);
  const { start, end } = occurrenceOf(e, day || undefined);
  const dur = e.allDay ? null : durationLabel(start, end);
  type Row = { icon: IconName; text: string };
  const allRows: (Row | null)[] = [
    e.location ? { icon: 'pin', text: e.location } : null,
    reminderLabel(e.reminderMin) ? { icon: 'bell', text: `Rappel ${reminderLabel(e.reminderMin)!.toLowerCase()}` } : null,
    recurrenceLabel(e.recurrence) ? { icon: 'repeat', text: recurrenceLabel(e.recurrence)! } : null,
  ];
  const rows = allRows.filter((r): r is Row => r !== null);

  const edit = () => router.push({ pathname: '/rdv/modifier/[id]', params: { id: String(e.id) } });
  const duplicate = async () => {
    const copy = await mutate((db) => duplicateEvent(db, e.id));
    if (copy) router.replace({ pathname: '/rdv/modifier/[id]', params: { id: String(copy) } });
  };
  const remove = () =>
    Alert.alert('Supprimer ce rendez-vous ?', "Il disparaît de l'agenda, sans historique.", [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await mutate((db) => deleteEvent(db, e.id));
          router.back();
        },
      },
    ]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Retour" style={styles.iconBtn}>
          <Icon name="back" />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Pressable onPress={edit} accessibilityRole="button" accessibilityLabel="Modifier" style={[styles.iconBtn, styles.iconBtnFilled]}>
            <Icon name="edit" size={18} />
          </Pressable>
          <Pressable
            onPress={() => setMenu(true)}
            accessibilityRole="button"
            accessibilityLabel="Plus d'options"
            style={[styles.iconBtn, styles.iconBtnFilled]}>
            <Icon name="more" size={18} strokeWidth={3.2} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 10, paddingHorizontal: 4 }}>
            <View style={[styles.chip, { backgroundColor: withAlpha(cat.color, 0.15) }]}>
              <View style={[styles.chipDot, { backgroundColor: cat.color }]} />
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={cat.color}>
                {cat.name}
              </AppText>
            </View>
            <AppText
              accessibilityRole="header"
              style={[styles.title, e.cancelledAt && { color: colors.textTertiary, textDecorationLine: 'line-through' }]}>
              {e.title}
            </AppText>
            {e.cancelledAt && (
              <View style={styles.cancelChip}>
                <AppText variant="caption" color={colors.textSecondary}>
                  Annulé · « {e.cancelReason || 'sans motif'} »{e.cancelMode === 'hide' ? ' · masqué de l’agenda' : ''}
                </AppText>
              </View>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(50).duration(300)} style={styles.card}>
            <View style={styles.timeRow}>
              <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                <AppText variant="caption" color={colors.textSecondary} style={{ fontSize: 13 }}>
                  {longDate(dayOf(start))}
                </AppText>
                <AppText style={styles.time}>{timeRange(e, start, end)}</AppText>
              </View>
              {dur && (
                <View style={styles.durPill}>
                  <AppText variant="number">{dur}</AppText>
                </View>
              )}
            </View>
            {rows.map((r) => (
              <View key={r.text} style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Icon name={r.icon} size={16} />
                </View>
                <AppText variant="body" style={{ fontSize: 15, flex: 1 }}>
                  {r.text}
                </AppText>
              </View>
            ))}
          </Animated.View>

          {e.deadline && <DeadlineSection event={e} />}

          {e.source === 'google' && (
            <View style={styles.googleNote}>
              <View style={styles.googleBadge}>
                <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 14 }}>G</AppText>
              </View>
              <AppText variant="caption" color={colors.textSecondary} style={{ flex: 1, lineHeight: 17 }}>
                <AppText variant="caption" color={colors.text} style={{ fontFamily: fonts.bodySemiBold }}>
                  Importé de Google Agenda.
                </AppText>{' '}
                Titre et horaires viennent de Google ; catégorie, notes et annulation restent dans l&apos;app.
              </AppText>
            </View>
          )}

          <NoteField event={e} />
        </ScrollView>

        <View style={styles.actions}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ActionButton icon="arrowRight" label="Reporter" onPress={edit} />
            <ActionButton icon="copy" label="Dupliquer" onPress={duplicate} />
          </View>
          {e.cancelledAt ? (
            <Pressable
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                mutate((db) => restoreEvent(db, e.id));
              }}
              accessibilityRole="button"
              style={styles.primary}>
              <Icon name="undo" size={18} color={colors.onLight} />
              <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
                Rétablir le rendez-vous
              </AppText>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push({ pathname: '/rdv/annuler/[id]', params: { id: String(e.id) } })}
              accessibilityRole="button"
              style={styles.primary}>
              <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
                Annuler le rendez-vous
              </AppText>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={menu}
        title="Options"
        value={null as string | null}
        options={[
          { value: 'duplicate', label: 'Dupliquer' },
          { value: 'delete', label: 'Supprimer le rendez-vous' },
        ]}
        onPick={(v) => (v === 'duplicate' ? duplicate() : remove())}
        onClose={() => setMenu(false)}
      />
    </SafeAreaView>
  );
}

/** Échéance avant le rdv : case à cocher et « Reporter » (au lendemain, même heure). */
function DeadlineSection({ event: e }: { event: EventRecord }) {
  const mutate = useDbMutation();
  const done = e.deadlineState === 'done';
  const d = e.deadline!;
  return (
    <Animated.View entering={FadeInDown.delay(100).duration(300)} style={styles.deadline}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="overline">Échéance avant le rdv</AppText>
        <AppText variant="number" color={done ? colors.textTertiary : colors.late}>
          {deadlineLabel(d.at)}
        </AppText>
      </View>
      <View style={styles.deadlineRow}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            mutate((db) => setEventDeadlineDone(db, e.id, !done));
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingLeft: 6 }}>
          <View style={[styles.box, done && { backgroundColor: colors.success, borderColor: colors.success }]}>
            {done && <Icon name="check" size={14} color={colors.onLight} strokeWidth={3} />}
          </View>
          <AppText
            variant="bodyMedium"
            numberOfLines={1}
            style={[{ flex: 1, fontSize: 15 }, done && { color: colors.textTertiary, textDecorationLine: 'line-through' }]}>
            {d.label || 'À faire avant le rdv'}
          </AppText>
        </Pressable>
        {!done && (
          <Pressable
            onPress={() =>
              mutate((db) =>
                postponeLate(
                  db,
                  { type: 'event', id: e.id, title: e.title, due: d.at, eventAt: e.startsAt, color: '' },
                  `${shiftDay(dayOf(d.at), 1)}T${timeOf(d.at)}`,
                ),
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Reporter l'échéance au lendemain"
            style={styles.smallBtn}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color="#D4D4D8">
              Reporter
            </AppText>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

/** Note perso, enregistrée quand on quitte le champ. */
function NoteField({ event: e }: { event: EventRecord }) {
  const mutate = useDbMutation();
  const [text, setText] = useState(e.notes);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <AppText nativeID="note-label" style={{ paddingLeft: 4, fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={colors.textTertiary}>
        Note perso
      </AppText>
      <TextInput
        accessibilityLabelledBy="note-label"
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (text !== e.notes) mutate((db) => setEventNotes(db, e.id, text));
        }}
        placeholder="Ajouter une note…"
        placeholderTextColor={colors.textTertiary}
        cursorColor={colors.text}
        multiline
        style={[styles.note, focused && { borderColor: colors.text }]}
      />
    </View>
  );
}

function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={16} color="#D4D4D8" />
      <AppText variant="bodyStrong" color="#D4D4D8">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconBtnFilled: { backgroundColor: colors.segmented },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 14 },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 999,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  title: { fontFamily: fonts.displayLight, fontSize: 40, lineHeight: 44, letterSpacing: -0.8, color: colors.text },
  cancelChip: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#4A4A50',
    borderRadius: 999,
  },
  card: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 24, overflow: 'hidden' },
  timeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  time: { fontFamily: fonts.displayThin, fontSize: 40, lineHeight: 44, letterSpacing: -1, color: colors.text },
  durPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.row },
  infoRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  deadline: {
    gap: 10,
    paddingTop: 14,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
  },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 6, borderRadius: 14, backgroundColor: colors.row },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtn: { height: 32, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.borderDashed, borderRadius: 999, justifyContent: 'center' },
  googleNote: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 18,
  },
  googleBadge: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  note: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  actions: { gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  secondary: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#232327',
  },
  primary: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
});
