import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { Markdown } from '@/components/markdown';
import { type CloseSheet, Sheet } from '@/components/sheet';
import { getCategories } from '@/db/events';
import { formatEuros, getTaskDetail, setTaskDone, setTaskNotes, type TaskDetail } from '@/db/tasks';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { nowStamp, timeOf } from '@/lib/dates';
import { NAGS } from '@/lib/event-options';
import { longDate, reminderLabel } from '@/lib/event-format';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/** Aperçu d'une tâche : même mise en page que l'aperçu d'un rendez-vous, bouton « Marquer comme fait » en bas. */
export default function TaskPreviewSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mutate = useDbMutation();
  const { data } = useDbQuery(async (db) => {
    const [task, categories] = await Promise.all([getTaskDetail(db, Number(id)), getCategories(db)]);
    return { task, categories };
  }, id);

  const t = data?.task;
  const cat = t ? data!.categories.find((c) => c.id === t.categoryId) : undefined;
  const color = cat?.color ?? colors.textTertiary;

  const toggle = async (close: CloseSheet) => {
    if (!t) return;
    const done = t.state !== 'done';
    // Dépense suivie : on passe par la feuille qui demande le montant réel.
    if (done && t.tracksExpense) {
      close(() => router.replace({ pathname: '/tache/terminer/[id]', params: { id: String(t.id) } }));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await mutate((db) => setTaskDone(db, t.id, done));
    if (done) close();
  };

  return (
    <Sheet label="Tâche">
      {(close) =>
        !data ? (
          <View style={{ height: 320 }} />
        ) : !t ? (
          <AppText variant="title">Tâche introuvable</AppText>
        ) : (
          <>
            <View style={styles.topRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <View style={[styles.chip, { backgroundColor: withAlpha(color, 0.15) }]}>
                  <View style={[styles.chipDot, { backgroundColor: color }]} />
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={color}>
                    {cat?.name ?? 'Sans catégorie'}
                  </AppText>
                </View>
                <AppText variant="caption">Tâche</AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/tache/modifier/[id]', params: { id: String(t.id) } })}
                  accessibilityRole="button"
                  accessibilityLabel="Éditer"
                  style={styles.closeBtn}>
                  <Icon name="edit" size={16} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => close()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.closeBtn}>
                  <Icon name="x" size={16} color={colors.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            <AppText
              accessibilityRole="header"
              style={[styles.title, t.state !== 'open' && { color: colors.textTertiary, textDecorationLine: 'line-through' }]}>
              {t.title}
            </AppText>

            <View style={styles.timeCard}>
              <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                <AppText variant="caption" color={colors.textSecondary} style={{ fontSize: 13 }}>
                  {longDate(t.day)}
                </AppText>
                <AppText style={styles.time}>{t.due ? `avant ${timeOf(t.due)}` : 'Sans heure limite'}</AppText>
              </View>
              <StatePill t={t} />
            </View>

            <Infos t={t} />

            {!!t.notes.trim() && (
              <ScrollView style={styles.notes} contentContainerStyle={{ padding: 14 }} nestedScrollEnabled>
                <AppText variant="caption" style={{ fontSize: 11, marginBottom: 6 }}>
                  Note
                </AppText>
                <Markdown source={t.notes} onToggle={(notes) => mutate((db) => setTaskNotes(db, t.id, notes))} />
              </ScrollView>
            )}

            <Pressable
              onPress={() => toggle(close)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, t.state === 'done' ? styles.btnGhost : styles.btnLight, pressed && { opacity: 0.85 }]}>
              <Icon
                name={t.state === 'done' ? 'undo' : 'check'}
                size={18}
                color={t.state === 'done' ? '#D4D4D8' : colors.onLight}
                strokeWidth={t.state === 'done' ? 1.8 : 2.2}
              />
              <AppText variant="bodyStrong" color={t.state === 'done' ? '#D4D4D8' : colors.onLight} style={{ fontSize: 15 }}>
                {t.state === 'done' ? 'Remettre à faire' : 'Marquer comme fait'}
              </AppText>
            </Pressable>
          </>
        )
      }
    </Sheet>
  );
}

function StatePill({ t }: { t: TaskDetail }) {
  const late = t.state === 'open' && !!t.due && t.due < nowStamp();
  const label = t.state === 'done' ? 'faite' : t.state === 'abandoned' ? 'abandonnée' : late ? 'en retard' : null;
  if (!label) return null;
  const c = t.state === 'done' ? colors.success : late ? colors.late : colors.textTertiary;
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(c, 0.12) }]}>
      <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={c}>
        {label}
      </AppText>
    </View>
  );
}

function Infos({ t }: { t: TaskDetail }) {
  type Info = { icon: IconName; label: string; value: string | null; color?: string };
  const nag = NAGS.find((n) => n.value === t.nagAt)?.label;
  const expense =
    t.spentCents !== null
      ? `Payé ${formatEuros(t.spentCents)} €`
      : t.estimateCents !== null
        ? `Estimation ${formatEuros(t.estimateCents)} €`
        : 'Montant demandé quand tu la coches';
  const all: Info[] = [
    { icon: 'bell', label: "Rappel avant l'échéance", value: t.due ? reminderLabel(t.reminderMin) : null },
    {
      icon: 'flag',
      label: "Si l'échéance passe",
      value: t.due && t.showLate ? `En retard${t.nagAt && nag ? ` · relance ${nag}` : ''}` : null,
      color: colors.late,
    },
    { icon: 'wallet', label: 'Dépense suivie', value: t.tracksExpense ? expense : null },
    { icon: 'clock', label: 'Historique', value: t.postponed ? `Reportée ${t.postponed} fois` : null },
    { icon: 'note', label: "Motif d'abandon", value: t.state === 'abandoned' ? t.abandonReason || 'sans motif' : null },
  ];
  const infos = all.filter((f) => f.value);
  if (infos.length === 0) return null;
  return (
    <View style={styles.infos}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 10, paddingRight: 12, borderRadius: 999 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  title: { paddingHorizontal: 4, fontFamily: fonts.displayLight, fontSize: 30, lineHeight: 34, letterSpacing: -0.5, color: colors.text },
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
  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  infos: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.row, borderRadius: 20, overflow: 'hidden' },
  infoRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 14 },
  infoBorder: { borderTopWidth: 1, borderTopColor: colors.row },
  infoIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  notes: { maxHeight: 260, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.row, borderRadius: 20 },
  btn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnLight: { backgroundColor: colors.text },
  btnGhost: { backgroundColor: '#232327' },
});
