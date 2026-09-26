import { nextMonday } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight, FadeOut, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { DateTimeSheet } from '@/components/form/date-time-sheet';
import { Icon, type IconName } from '@/components/icon';
import { BackHeader, Screen } from '@/components/screen';
import {
  deleteLate, getLateItems, type LateItem, type LateUndo, postponeLate, resolveLate, undoLate,
} from '@/db/agenda';
import { formatEuros } from '@/db/tasks';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dayKey, dayOf, lateSince, mediumDayLabel, shiftDay, type Stamp, timeOf, todayKey } from '@/lib/dates';
import { colors, fonts, withAlpha } from '@/theme/tokens';

type Resolved = { item: LateItem; undo: LateUndo; kind: 'done' | 'postponed' | 'kept'; label: string };

const RESOLVED_LOOK: Record<Resolved['kind'], { color: string; icon: IconName }> = {
  done: { color: colors.success, icon: 'check' },
  postponed: { color: colors.textSecondary, icon: 'clock' },
  kept: { color: colors.textTertiary, icon: 'note' },
};

/** Écran « En retard » : Fait, Reporter ou Abandonner, chaque action datée dans l'historique (maquette HF-EnRetard). */
export default function LateScreen() {
  const { data: items } = useDbQuery(getLateItems);
  const mutate = useDbMutation();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [onTime, setOnTime] = useState(false);
  const [motif, setMotif] = useState('');
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const [picking, setPicking] = useState<LateItem | null>(null);

  // Les éléments traités restent affichés (avec « Annuler ») jusqu'à la sortie de l'écran.
  const pending = (items ?? []).filter((it) => !resolved[keyOf(it)]);
  const rows = [...pending, ...Object.values(resolved).map((r) => r.item)].sort((a, b) => a.due.localeCompare(b.due));
  const current = openKey ?? (pending[0] ? keyOf(pending[0]) : null);

  /** k : la carte à ouvrir ; '' : tout replier ; null : la première encore à traiter. */
  const open = (k: string | null) => {
    setOpenKey(k);
    setOnTime(false);
    setMotif('');
  };

  const act = async (it: LateItem, kind: Resolved['kind'], label: string, fn: () => Promise<LateUndo>) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const undo = await mutate(fn);
    setResolved((r) => ({ ...r, [keyOf(it)]: { item: it, undo, kind, label } }));
    open(null);
  };

  const postpone = (it: LateItem, to: Stamp, label: string) =>
    act(it, 'postponed', `${it.type === 'task' ? 'Reportée' : 'Échéance reportée'} · ${label}`, () =>
      mutate((db) => postponeLate(db, it, to)),
    );

  const undo = async (r: Resolved) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await mutate((db) => undoLate(db, r.undo));
    setResolved(({ [keyOf(r.item)]: _, ...rest }) => rest);
    open(keyOf(r.item));
  };

  const remove = (it: LateItem) =>
    showDialog(
      it.type === 'task' ? 'Supprimer cette tâche ?' : "Retirer l'échéance ?",
      it.type === 'task' ? "Elle disparaît, sans historique." : 'Le rendez-vous reste prévu.',
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await mutate((db) => deleteLate(db, it));
            open(null);
          },
        },
      ],
    );

  const clear = !!items && pending.length === 0;

  return (
    <Screen>
      <BackHeader
        title="En retard"
        right={
          items && (
            <View
              accessibilityLiveRegion="polite"
              style={[styles.count, clear ? styles.countClear : styles.countLate]}>
              <View style={[styles.countDot, { backgroundColor: clear ? colors.success : colors.late }]} />
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color={clear ? colors.success : colors.late}>
                {clear ? 'À jour' : `${pending.length} élément${pending.length > 1 ? 's' : ''}`}
              </AppText>
            </View>
          )
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {rows.map((it, i) => {
          const k = keyOf(it);
          const r = resolved[k];
          if (r) return <ResolvedRow key={k} r={r} onUndo={() => undo(r)} />;
          const isOpen = k === current;
          return (
            <Animated.View
              key={k}
              layout={LinearTransition.duration(250)}
              entering={FadeInDown.delay(i * 70).duration(400)}
              exiting={FadeOut.duration(200)}
              style={[styles.card, isOpen && styles.cardOpen]}>
              <Pressable
                onPress={() => open(isOpen ? '' : k)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${isOpen ? 'Replier' : 'Déplier'} ${it.title}`}
                style={styles.cardHead}>
                <View style={[styles.iconBox, { backgroundColor: withAlpha(it.color, 0.13) }]}>
                  <Icon name={it.icon} size={16} color={it.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: isOpen ? 4 : 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {it.type === 'event' && (
                      <View style={styles.rdvTag}>
                        <AppText style={styles.rdvText}>RDV</AppText>
                      </View>
                    )}
                    <AppText
                      variant="bodyStrong"
                      numberOfLines={isOpen ? 2 : 1}
                      style={{ flex: 1, fontSize: isOpen ? 18 : 15, lineHeight: isOpen ? 23 : 20 }}>
                      {it.title}
                    </AppText>
                  </View>
                  <AppText variant="caption" color={colors.textSecondary} style={{ lineHeight: 17 }}>
                    {isOpen && it.category ? `${it.category} · ` : ''}
                    <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 12 }} color={colors.late}>
                      {metaOf(it)}
                    </AppText>
                  </AppText>
                </View>
                <View style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }], marginTop: 4 }}>
                  <Icon name="chevronRight" size={18} color={colors.textSecondary} />
                </View>
              </Pressable>

              {isOpen && (
                <Animated.View entering={FadeInDown.duration(250)} style={{ gap: 12 }}>
                  <Pressable
                    onPress={() =>
                      act(it, 'done', onTime ? 'Fait · à temps, coché après coup' : "Fait · ajouté à l'historique", () =>
                        mutate((db) => resolveLate(db, it, 'done', { onTime })),
                      )
                    }
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
                    <Icon name="check" size={18} color={colors.onLight} strokeWidth={2.2} />
                    <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
                      C&apos;est fait
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => setOnTime((v) => !v)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: onTime }}
                    style={styles.checkRow}>
                    <View style={[styles.box, onTime && styles.boxOn]}>
                      {onTime && <Icon name="check" size={12} color={colors.onLight} strokeWidth={3.2} />}
                    </View>
                    <AppText variant="body" color={colors.textSecondary} style={{ fontSize: 13 }}>
                      Fait avant l&apos;échéance, oublié de cocher
                    </AppText>
                  </Pressable>

                  <View style={{ gap: 8 }}>
                    <AppText style={styles.label}>Reporter l&apos;échéance</AppText>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {postponeOptions(it).map((o) => (
                        <Pressable
                          key={o.label}
                          onPress={() => postpone(it, o.to, o.label.toLowerCase())}
                          accessibilityRole="button"
                          accessibilityLabel={`Reporter à ${o.label}`}
                          style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.row }]}>
                          <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>{o.label}</AppText>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => setPicking(it)}
                        accessibilityRole="button"
                        accessibilityLabel="Choisir une date de report"
                        style={({ pressed }) => [styles.chip, styles.chipDashed, pressed && { backgroundColor: colors.row }]}>
                        <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color={colors.textSecondary}>
                          Choisir…
                        </AppText>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.abandon}>
                    <AppText style={styles.label}>Abandonner</AppText>
                    <TextInput
                      value={motif}
                      onChangeText={setMotif}
                      placeholder="Motif (facultatif)"
                      placeholderTextColor={colors.textTertiary}
                      cursorColor={colors.text}
                      accessibilityLabel="Motif d'abandon"
                      style={styles.input}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() =>
                          act(it, 'kept', it.type === 'task' ? 'Abandonnée · historique gardé' : 'Échéance abandonnée · rdv maintenu', () =>
                            mutate((db) => resolveLate(db, it, 'abandoned', { note: motif })),
                          )
                        }
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.half, styles.keep, pressed && { opacity: 0.8 }]}>
                        <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color="#D4D4D8">
                          Garder l&apos;historique
                        </AppText>
                      </Pressable>
                      <Pressable
                        onPress={() => remove(it)}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.half, styles.del, pressed && { backgroundColor: colors.row }]}>
                        <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>Supprimer</AppText>
                      </Pressable>
                    </View>
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          );
        })}

        {clear && (
          <Animated.View entering={FadeInDown.duration(450)} style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="check" size={26} color={colors.bg} strokeWidth={2.4} />
            </View>
            <AppText variant="title" style={{ fontSize: 22 }}>
              Plus rien en retard
            </AppText>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityRole="button"
              style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}>
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
                Retour à l&apos;agenda
              </AppText>
            </Pressable>
          </Animated.View>
        )}

        {items && (
          <View style={styles.info}>
            <Icon name="info" size={16} color={colors.textTertiary} />
            <AppText variant="caption" style={{ flex: 1, lineHeight: 18 }}>
              Tâches et rendez-vous : chaque action est datée dans l&apos;historique. Pour un rdv, abandonner
              l&apos;échéance n&apos;annule pas le rdv.
            </AppText>
          </View>
        )}
      </ScrollView>

      {picking && (
        <DateTimeSheet
          visible
          title="Reporter l'échéance"
          timeLabel="Heure limite"
          value={{ day: shiftDay(todayKey(), 1), start: timeOf(picking.due) || '18:00', end: null }}
          onDone={({ day, start }) => postpone(picking, `${day}T${start}`, `${mediumDayLabel(day)} ${start}`)}
          onClose={() => setPicking(null)}
        />
      )}
    </Screen>
  );
}

function ResolvedRow({ r, onUndo }: { r: Resolved; onUndo: () => void }) {
  const look = RESOLVED_LOOK[r.kind];
  return (
    <Animated.View entering={FadeInRight.duration(400)} layout={LinearTransition.duration(250)} style={styles.resolved}>
      <View style={[styles.iconBox, { backgroundColor: withAlpha(look.color, 0.13) }]}>
        <Icon name={look.icon} size={16} color={look.color} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText
          variant="bodyMedium"
          numberOfLines={1}
          color={colors.textSecondary}
          style={[{ fontSize: 14 }, r.kind === 'done' && { textDecorationLine: 'line-through' }]}>
          {r.item.title}
        </AppText>
        <AppText variant="caption">{r.label}</AppText>
      </View>
      <Pressable onPress={onUndo} accessibilityRole="button" accessibilityLabel={`Annuler l'action sur ${r.item.title}`} style={styles.undo}>
        <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>Annuler</AppText>
      </Pressable>
    </Animated.View>
  );
}

const keyOf = (it: LateItem) => `${it.type}${it.id}`;

/** « échue hier 18:00 · il y a 15 h · 84 € » ou « échue mer. 23 sept. · rdv sam. 3 oct. 20:00 ». */
function metaOf(it: LateItem) {
  const d = dayOf(it.due);
  const today = todayKey();
  const when = d === today ? "aujourd'hui" : d === shiftDay(today, -1) ? 'hier' : mediumDayLabel(d);
  if (it.eventAt) return `échue ${when} · rdv ${mediumDayLabel(dayOf(it.eventAt))} ${timeOf(it.eventAt)}`;
  const cost = it.estimateCents !== null ? ` · ${formatEuros(it.estimateCents)} €` : '';
  return `échue ${when} ${timeOf(it.due)} · ${lateSince(it.due)}${cost}`;
}

/** Ce soir (si pas encore 20:00), Demain, Lundi — à l'heure d'origine de l'échéance. */
function postponeOptions(it: LateItem) {
  const today = todayKey();
  const hhmm = timeOf(it.due) || '18:00';
  const opts: { label: string; to: string }[] = [];
  if (new Date().getHours() < 20) opts.push({ label: 'Ce soir', to: `${today}T20:00` });
  opts.push({ label: 'Demain', to: `${shiftDay(today, 1)}T${hhmm}` });
  opts.push({ label: 'Lundi', to: `${dayKey(nextMonday(new Date()))}T${hhmm}` });
  return opts;
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingTop: 4, gap: 10, paddingBottom: 40 },
  count: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginRight: 8, borderRadius: 999, borderWidth: 1 },
  countLate: { backgroundColor: colors.lateBg, borderColor: colors.lateBorder },
  countClear: { backgroundColor: 'rgba(43,217,74,0.12)', borderColor: 'rgba(43,217,74,0.3)' },
  countDot: { width: 7, height: 7, borderRadius: 4 },
  card: {
    padding: 14,
    gap: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
  },
  cardOpen: { padding: 16, borderRadius: 24, borderColor: colors.lateBorder },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBox: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rdvTag: { height: 18, paddingHorizontal: 6, borderRadius: 6, justifyContent: 'center', backgroundColor: 'rgba(255,154,60,0.14)' },
  rdvText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6, color: '#FF9A3C' },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textTertiary },
  primary: {
    height: 48,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 999,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkRow: { minHeight: 32, marginTop: -4, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#5B5B61',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.text, borderColor: colors.text },
  chip: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDashed: { borderStyle: 'dashed' },
  abandon: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
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
  half: { flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  keep: { backgroundColor: '#232327' },
  del: { borderWidth: 1, borderColor: colors.borderDashed },
  resolved: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 20,
  },
  undo: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  emptyBtn: { height: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  info: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
});
