import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { postponeLate } from '@/db/agenda';
import { type EventRecord, setEventDeadlineDone, setEventNotes } from '@/db/events';
import { useDbMutation } from '@/db/use-query';
import { dayOf, shiftDay, timeOf } from '@/lib/dates';
import { deadlineLabel } from '@/lib/event-format';
import { colors, fonts } from '@/theme/tokens';

/* Morceaux du détail d'un rendez-vous (feuille aperçu → détail). */

/** Échéance avant le rdv : case à cocher et « Reporter » (au lendemain, même heure). */
export function DeadlineSection({ event: e }: { event: EventRecord }) {
  const mutate = useDbMutation();
  const done = e.deadlineState === 'done';
  const d = e.deadline!;
  return (
    <View style={styles.deadline}>
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
    </View>
  );
}

/** Note perso, enregistrée quand on quitte le champ. */
export function NoteField({ event: e }: { event: EventRecord }) {
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

export function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
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
  deadline: {
    gap: 10,
    paddingTop: 14,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.row,
    borderRadius: 20,
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
});
