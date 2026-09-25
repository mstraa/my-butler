import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { SwitchRow } from '@/components/form/fields';
import { Sheet } from '@/components/sheet';
import { cancelEvent, type CancelMode, getCategories, getEvent } from '@/db/events';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dateFieldLabel, dayOf, timeOf } from '@/lib/dates';
import { categoryOf } from '@/lib/event-format';
import { colors, fonts } from '@/theme/tokens';

const MOTIFS = ['Empêchement', 'Malade', "Annulé par l'autre", 'Oubli'];
const MODES: { value: CancelMode; title: string; sub: string }[] = [
  { value: 'keep', title: "Garder dans l'agenda", sub: 'Affiché barré avec le motif' },
  { value: 'hide', title: "Masquer, garder l'historique", sub: "Disparaît de l'agenda, reste enregistré" },
  { value: 'delete', title: 'Supprimer sans trace', sub: "Rien n'est conservé" },
];

/** Annuler un rendez-vous (maquette HF-Annulation). */
export default function CancelEventSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mutate = useDbMutation();
  const [motif, setMotif] = useState<string | null>(MOTIFS[0]);
  const [detail, setDetail] = useState('');
  const [mode, setMode] = useState<CancelMode>('keep');
  const [reprog, setReprog] = useState(false);
  const [focused, setFocused] = useState(false);
  const { data } = useDbQuery(async (db) => {
    const [event, categories] = await Promise.all([getEvent(db, Number(id)), getCategories(db)]);
    return { event, categories };
  }, id);

  const e = data?.event;
  const reason = [motif, detail.trim()].filter(Boolean).join(' · ') || null;

  const confirm = async (close: (then?: () => void) => void) => {
    if (!e) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await mutate((db) => cancelEvent(db, e.id, mode, reason));
    close(() => {
      // Retour à l'agenda (on quitte aussi le détail) ; si demandé, nouveau rdv prérempli.
      router.dismissAll();
      if (reprog) router.push({ pathname: '/rdv/nouveau', params: { from: String(e.id) } });
    });
  };

  return (
    <Sheet label="Annuler le rendez-vous">
      {(close) =>
        !e ? (
          <View style={{ height: 300 }} />
        ) : (
          <>
            <View style={{ gap: 4 }}>
              <AppText variant="display" style={{ fontFamily: fonts.displayMedium, fontSize: 24 }}>
                Annuler « {e.title} » ?
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: categoryOf(e, data!.categories).color }} />
                <AppText variant="caption" color={colors.textSecondary} style={{ fontSize: 13 }}>
                  {dateFieldLabel(dayOf(e.startsAt))}
                  {e.allDay ? '' : ` · ${timeOf(e.startsAt)}`}
                </AppText>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <AppText style={styles.label}>Motif (facultatif)</AppText>
              <View style={styles.chips}>
                {MOTIFS.map((m) => {
                  const on = m === motif;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMotif(on ? null : m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.chip, on && styles.chipOn]}>
                      <AppText style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 13 }} color={on ? colors.onLight : '#D4D4D8'}>
                        {m}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={detail}
                onChangeText={setDetail}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Préciser… (ex. panne de voiture)"
                placeholderTextColor={colors.textTertiary}
                cursorColor={colors.text}
                accessibilityLabel="Précision du motif"
                style={[styles.input, focused && { borderColor: colors.text }]}
              />
            </View>

            <View style={{ gap: 8 }} accessibilityRole="radiogroup">
              <AppText style={styles.label}>Que faire de l&apos;info ?</AppText>
              {MODES.map((o) => {
                const sel = o.value === mode;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => setMode(o.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sel }}
                    style={[styles.option, sel && styles.optionOn]}>
                    <View style={[styles.ring, sel && styles.ringOn]}>{sel && <View style={styles.ringDot} />}</View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="bodyStrong" style={{ fontSize: 15 }}>
                        {o.title}
                      </AppText>
                      <AppText variant="caption" color={colors.textSecondary}>
                        {o.sub}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <SwitchRow label="Proposer une nouvelle date" value={reprog} onChange={setReprog} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => close()} accessibilityRole="button" style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                <AppText variant="bodyStrong" color="#D4D4D8">
                  Retour
                </AppText>
              </Pressable>
              <Pressable onPress={() => confirm(close)} accessibilityRole="button" style={[styles.btn, styles.btnPrimary, { flex: 1.6 }]}>
                <AppText variant="bodyStrong" color={colors.onLight}>
                  Confirmer l&apos;annulation
                </AppText>
              </Pressable>
            </View>
          </>
        )
      }
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textTertiary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  input: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  option: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  optionOn: { borderColor: colors.text, backgroundColor: colors.row },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#75757B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOn: { borderColor: colors.text, backgroundColor: colors.text },
  ringDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onLight },
  btn: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: colors.borderDashed },
  btnPrimary: { backgroundColor: colors.text },
});
