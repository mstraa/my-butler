import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { getCategories, getEvent } from '@/db/events';
import { useDbQuery } from '@/db/use-query';
import { dayOf } from '@/lib/dates';
import {
  categoryOf, deadlineLabel, durationLabel, longDate, occurrenceOf, recurrenceLabel, reminderLabel, timeRange,
} from '@/lib/event-format';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/** Aperçu d'un rendez-vous en feuille (maquette HF-RdvPreview) : Fermer ou Éditer. */
export default function EventPreview() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const { data } = useDbQuery(async (db) => {
    const [event, categories] = await Promise.all([getEvent(db, Number(id)), getCategories(db)]);
    return { event, categories };
  }, `${id}|${day}`);

  const e = data?.event;

  return (
    <Sheet label="Aperçu du rendez-vous">
      {(close) => {
        if (!data) return <View style={{ height: 320 }} />;
        if (!e) {
          return (
            <View style={{ gap: 12, paddingVertical: 20 }}>
              <AppText variant="title">Rendez-vous introuvable</AppText>
              <Pressable onPress={() => close()} accessibilityRole="button" style={[styles.btn, styles.btnGhost]}>
                <AppText variant="bodyStrong" color="#D4D4D8">Fermer</AppText>
              </Pressable>
            </View>
          );
        }
        const cat = categoryOf(e, data.categories);
        const { start, end } = occurrenceOf(e, day);
        const dur = e.allDay ? null : durationLabel(start, end);
        type Info = { icon: IconName; label: string; value: string | null; color?: string };
        const allInfos: Info[] = [
          { icon: 'pin', label: 'Lieu', value: e.location || null },
          { icon: 'bell', label: 'Rappel', value: reminderLabel(e.reminderMin) },
          { icon: 'repeat', label: 'Répéter', value: recurrenceLabel(e.recurrence) },
          {
            icon: 'flag',
            label: 'Échéance avant le rdv',
            value: e.deadline
              ? `${e.deadline.label ? `${e.deadline.label} · ` : ''}${deadlineLabel(e.deadline.at)}${e.deadlineState === 'done' ? ' · fait' : ''}`
              : null,
            color: colors.late,
          },
          { icon: 'note', label: 'Notes', value: e.notes || null },
          { icon: 'source', label: 'Source', value: e.source === 'google' ? 'Importé de Google Agenda' : 'Créé dans l’app' },
        ];
        const infos = allInfos.filter((f) => f.value);

        return (
          <>
            <View style={styles.topRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <View style={[styles.chip, { backgroundColor: withAlpha(cat.color, 0.15) }]}>
                  <View style={[styles.chipDot, { backgroundColor: cat.color }]} />
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={cat.color}>
                    {cat.name}
                  </AppText>
                </View>
                <AppText variant="caption">Rendez-vous</AppText>
              </View>
              <Pressable onPress={() => close()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.closeBtn}>
                <Icon name="x" size={16} color={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>

            <View style={{ gap: 6, paddingHorizontal: 4 }}>
              <AppText
                accessibilityRole="header"
                style={[styles.title, e.cancelledAt && { color: colors.textTertiary, textDecorationLine: 'line-through' }]}>
                {e.title}
              </AppText>
              {e.cancelledAt && (
                <View style={styles.cancelChip}>
                  <AppText variant="caption" color={colors.textSecondary}>
                    Annulé · « {e.cancelReason || 'sans motif'} »
                  </AppText>
                </View>
              )}
            </View>

            <View style={styles.timeCard}>
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

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.infos}>
              {infos.map((f, i) => (
                <View key={f.label} style={[styles.infoRow, i > 0 && styles.infoBorder]}>
                  <View style={[styles.infoIcon, { backgroundColor: f.color ? withAlpha(f.color, 0.13) : colors.row }]}>
                    <Icon name={f.icon} size={16} color={f.color ?? colors.text} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="caption" style={{ fontSize: 11 }}>
                      {f.label}
                    </AppText>
                    <AppText variant="bodyMedium">{f.value}</AppText>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => close()} accessibilityRole="button" style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                <AppText variant="bodyStrong" color="#D4D4D8" style={{ fontSize: 15 }}>
                  Fermer
                </AppText>
              </Pressable>
              <Pressable
                onPress={() =>
                  close(() => router.replace({ pathname: '/rdv/[id]', params: { id: String(e.id), day: day ?? '' } }))
                }
                accessibilityRole="button"
                style={[styles.btn, styles.btnPrimary, { flex: 1.4 }]}>
                <Icon name="edit" size={16} color={colors.onLight} />
                <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
                  Éditer
                </AppText>
              </Pressable>
            </View>
          </>
        );
      }}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 10, paddingRight: 12, borderRadius: 999 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.displayLight, fontSize: 30, lineHeight: 34, letterSpacing: -0.5, color: colors.text },
  cancelChip: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#4A4A50',
    borderRadius: 999,
  },
  timeCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.row,
    borderRadius: 20,
  },
  time: { fontFamily: fonts.displayThin, fontSize: 32, lineHeight: 36, letterSpacing: -0.6, color: colors.text },
  durPill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.surfaceRaised },
  infos: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.row, borderRadius: 20, overflow: 'hidden' },
  infoRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 14 },
  infoBorder: { borderTopWidth: 1, borderTopColor: colors.row },
  infoIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnGhost: { backgroundColor: '#232327' },
  btnPrimary: { backgroundColor: colors.text },
});
