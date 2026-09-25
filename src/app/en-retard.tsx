import { nextMonday } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { BackHeader, Screen } from '@/components/screen';
import { getLateItems, type LateItem, postponeLate, resolveLate } from '@/db/agenda';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dayKey, dayOf, lateSince, mediumDayLabel, shiftDay, timeOf, todayKey } from '@/lib/dates';
import { colors, fonts } from '@/theme/tokens';

/** Écran « En retard » : Fait, Reporter ou Abandonner, chaque action datée dans l'historique. */
export default function LateScreen() {
  const { data: items } = useDbQuery(getLateItems);
  const mutate = useDbMutation();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const list = items ?? [];
  const current = openKey ?? (list[0] ? keyOf(list[0]) : null);

  const act = async (fn: Parameters<typeof mutate>[0]) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOpenKey(null);
    await mutate(fn);
  };

  return (
    <Screen>
      <BackHeader
        title="En retard"
        right={
          <AppText variant="caption" style={{ paddingHorizontal: 12 }}>
            {list.length} élément{list.length > 1 ? 's' : ''}
          </AppText>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, paddingBottom: 40 }}>
        {items && list.length === 0 && (
          <View style={styles.empty}>
            <Icon name="check" color={colors.success} size={28} strokeWidth={2.2} />
            <AppText variant="title">Rien en retard</AppText>
            <AppText variant="body" color={colors.textTertiary}>
              Toutes les échéances sont traitées.
            </AppText>
          </View>
        )}
        {list.map((it, i) => {
          const k = keyOf(it);
          const open = k === current;
          return (
            <Animated.View
              key={k}
              layout={LinearTransition.duration(250)}
              entering={FadeInDown.delay(i * 60).duration(350)}
              exiting={FadeOut.duration(200)}
              style={[styles.card, open && styles.cardOpen]}>
              <Pressable
                onPress={() => setOpenKey(open ? '' : k)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={styles.cardHead}>
                <View style={[styles.dot, { backgroundColor: it.color }]} />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <AppText variant="bodyStrong" style={{ fontSize: open ? 17 : 15 }} numberOfLines={2}>
                    {it.type === 'event' && <AppText variant="label" color={colors.textTertiary}>RDV · </AppText>}
                    {it.title}
                  </AppText>
                  <AppText variant="caption" color={colors.late}>
                    échue {mediumDayLabel(dayOf(it.due))} {timeOf(it.due)} · {lateSince(it.due)}
                    {it.eventAt ? <AppText variant="caption"> · rdv {mediumDayLabel(dayOf(it.eventAt))}</AppText> : null}
                  </AppText>
                </View>
              </Pressable>

              {open && (
                <Animated.View entering={FadeInDown.duration(250)} style={{ gap: 14 }}>
                  <Pressable
                    onPress={() => act((db) => resolveLate(db, it, 'done'))}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
                    <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
                      C&apos;est fait
                    </AppText>
                  </Pressable>

                  <View style={{ gap: 8 }}>
                    <AppText variant="label" color={colors.textTertiary} style={{ fontSize: 12 }}>
                      Reporter l&apos;échéance
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {postponeOptions(it).map((o) => (
                        <Pressable
                          key={o.label}
                          onPress={() => act((db) => postponeLate(db, it, o.to))}
                          accessibilityRole="button"
                          accessibilityLabel={`Reporter à ${o.label}`}
                          style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.row }]}>
                          <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>{o.label}</AppText>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.abandonRow}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="label" color={colors.textTertiary} style={{ fontSize: 12 }}>
                        Abandonner
                      </AppText>
                      {it.type === 'event' && (
                        <AppText variant="caption" style={{ fontSize: 11 }}>
                          Le rendez-vous reste prévu.
                        </AppText>
                      )}
                    </View>
                    <Pressable
                      onPress={() => act((db) => resolveLate(db, it, 'abandoned'))}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.ghost, pressed && { backgroundColor: colors.row }]}>
                      <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color={colors.textSecondary}>
                        Abandonner
                      </AppText>
                    </Pressable>
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          );
        })}
        {list.length > 0 && (
          <AppText variant="caption" style={{ paddingHorizontal: 4, lineHeight: 18 }}>
            Chaque action est datée dans l&apos;historique.
          </AppText>
        )}
      </ScrollView>
    </Screen>
  );
}

const keyOf = (it: LateItem) => `${it.type}${it.id}`;

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
  card: {
    padding: 14,
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 20,
  },
  cardOpen: { backgroundColor: colors.surfaceRaised, borderColor: colors.lateBorder },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  primary: {
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flex: 1,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abandonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ghost: { height: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    gap: 8,
    padding: 28,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
