import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { Screen } from '@/components/screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { TrackerChart } from '@/components/tracker-charts';
import {
  addTrackerValue, bedtimeTarget, getTrackerViews, setSleepTime, setTrackerValue, type TrackerView,
} from '@/db/tracking';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { mediumDayLabel, todayKey } from '@/lib/dates';
import {
  clockOffset, decimalsOf, fmtClock, fmtDuration, fmtNum, fmtStep, fmtValue, keyboardFor, parseDraft, toDraft, unitFor,
} from '@/lib/tracker-format';
import { useTrackingDay } from '@/lib/tracking-view';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

/** Onglet Suivi : les suivis créés par l'utilisateur, sur 7 jours. */
export default function SuiviScreen() {
  const today = todayKey();
  const bottom = useTabBarSpace();
  const day = useTrackingDay();
  const isToday = day === today;
  const { data: trackers } = useDbQuery((db) => getTrackerViews(db, day), day, { cacheId: 'suivi' });

  // Saisie au clavier : la carte concernée remonte en haut de l'écran, au-dessus du clavier.
  const [editing, setEditing] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const editY = useRef(0);
  useEffect(() => {
    if (!editing) return;
    const sub = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollTo({ y: Math.max(0, editY.current - 8), animated: true }));
    return () => sub.remove();
  }, [editing]);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="body" color={colors.textSecondary}>
            7 derniers jours
          </AppText>
          <AppText variant="display" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38, letterSpacing: -0.7 }}>
            Suivi
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => router.push('/suivi/jour')}
            accessibilityRole="button"
            accessibilityLabel={`Jour affiché : ${mediumDayLabel(day)}`}
            style={({ pressed }) => [styles.dayPill, pressed && { backgroundColor: colors.row }]}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color="#D4D4D8">
              {isToday ? "Aujourd'hui" : mediumDayLabel(day)}
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/suivi/nouveau')}
            accessibilityRole="button"
            accessibilityLabel="Nouveau suivi"
            style={({ pressed }) => [styles.addBtn, pressed && { backgroundColor: colors.row }]}>
            <Icon name="plus" size={18} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: editing ? 24 : bottom }}
          showsVerticalScrollIndicator={false}>
          {trackers?.length === 0 && <Empty />}
          {trackers?.map((t, i) => (
            <TrackerCard
              key={t.id}
              t={t}
              day={day}
              isToday={isToday}
              index={i}
              onEditing={(on, y) => {
                if (on) editY.current = y;
                setEditing(on);
              }}
            />
          ))}
          {!!trackers?.length && (
            <Pressable
              onPress={() => router.push('/suivi/nouveau')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.newBtn, pressed && { backgroundColor: colors.surface }]}>
              <Icon name="plus" size={16} color={colors.textSecondary} strokeWidth={2} />
              <AppText variant="label" color={colors.textSecondary}>
                Nouveau suivi
              </AppText>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Empty() {
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={[styles.card, { alignItems: 'center', paddingVertical: 32, gap: 10 }]}>
      <View style={[styles.iconBox, { width: 48, height: 48, borderRadius: 16, backgroundColor: withAlpha(categoryColors.sport, 0.13) }]}>
        <Icon name="pulse" size={24} color={categoryColors.sport} />
      </View>
      <AppText variant="bodyStrong" style={{ fontSize: 17 }}>
        Aucun suivi
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={{ textAlign: 'center', paddingHorizontal: 12 }}>
        Sommeil, eau, cafés, heure du lever… Suis ce que tu veux, jour après jour.
      </AppText>
      <Pressable
        onPress={() => router.push('/suivi/nouveau')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}>
        <Icon name="plus" size={16} color={colors.onLight} strokeWidth={2.2} />
        <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
          Créer un suivi
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

/** Grand affichage : partie principale et reste plus petit (« 7 » + « h 25 », « 3 » + « ,5 ml »). */
function bigParts(t: TrackerView, v: number | null): [string, string] {
  if (t.kind === 'time') return [v === null ? '--:--' : fmtClock(v), ''];
  if (t.kind === 'duration') {
    if (v === null) return ['–', t.unit === 'min' ? ' min' : ' h'];
    const m = Math.round(v);
    if (t.unit === 'min') return [String(m), ' min'];
    return [String(Math.floor(m / 60)), m % 60 ? ` h ${String(m % 60).padStart(2, '0')}` : ' h'];
  }
  const s = fmtNum(v ?? 0, t.kind === 'volume' ? decimalsOf(t.step) : undefined);
  const [int, dec] = s.split(',');
  return [int, `${dec !== undefined ? `,${dec}` : ''}${t.unit ? ` ${unitFor(v ?? 0, t.unit)}` : ''}`];
}

function TrackerCard({
  t, day, isToday, index, onEditing,
}: {
  t: TrackerView;
  day: string;
  isToday: boolean;
  index: number;
  onEditing: (on: boolean, y: number) => void;
}) {
  const mutate = useDbMutation();
  const color = t.color ?? categoryColors.sport;
  const cur = t.days[6].value;
  const y = useRef(0);

  // Saisie directe. Valider déclenche onSubmitEditing puis onEndEditing : des références (et non
  // l'état du rendu, qui peut être périmé dans le second appel) garantissent un seul enregistrement.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const editingRef = useRef(false);
  const startEditing = () => {
    const v = cur === null ? '' : toDraft(t, cur);
    draftRef.current = v;
    editingRef.current = true;
    setDraft(v);
    setEditing(true);
    onEditing(true, y.current);
  };
  const changeDraft = (text: string) => {
    draftRef.current = text;
    setDraft(text);
  };
  const commitDraft = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    onEditing(false, 0);
    const v = parseDraft(t, draftRef.current);
    if (v !== null) mutate((db) => setTrackerValue(db, t.id, day, v));
  };

  const openClock = () =>
    router.push({ pathname: '/suivi/heure', params: { id: String(t.id), day, value: cur === null ? '' : String(cur) } });

  const bump = (dir: 1 | -1) => {
    Haptics.selectionAsync();
    if (t.kind === 'time') {
      if (cur === null) {
        if (!isToday) return openClock();
        const d = new Date();
        return mutate((db) => setTrackerValue(db, t.id, day, d.getHours() * 60 + d.getMinutes()));
      }
      const v = (((cur + dir * t.step) % 1440) + 1440) % 1440;
      return mutate((db) => setTrackerValue(db, t.id, day, v));
    }
    mutate((db) => addTrackerValue(db, t.id, day, dir * t.step));
  };

  const [main, rest] = bigParts(t, cur);
  const locked = t.source === 'health';
  const canLower = t.kind === 'time' ? cur !== null : !!cur;
  const trend = t.avg && t.prevAvg ? Math.round((t.avg / t.prevAvg - 1) * 100) : null;
  const trendText = trend !== null ? ` · ${trend > 0 ? '+' : trend < 0 ? '−' : ''}${Math.abs(trend)} % vs semaine passée` : '';

  const night = t.kind === 'sleep' ? t.days[6] : null;
  const headRight =
    t.kind === 'sleep'
      ? cur !== null ? ['nuit : ', fmtDuration(cur)] : null
      : t.kind === 'duration' || t.kind === 'time'
      ? t.avg !== null ? ['moy. ', fmtValue(t, t.avg)] : null
      : ['7 j : ', fmtValue(t, t.total)];

  let footer = '';
  if (t.kind === 'time') {
    const known = t.days.map((d) => d.value).filter((v): v is number => v !== null);
    if (t.avg !== null && known.length) {
      const offs = known.map((v) => clockOffset(v, t.avg!));
      footer = `moyenne ${fmtClock(t.avg)} · de ${fmtClock(t.avg + Math.min(...offs))} à ${fmtClock(t.avg + Math.max(...offs))}`;
    }
  } else if (t.kind === 'sleep') {
    footer = [
      t.goal ? `objectif ${fmtDuration(t.goal)}` : '',
      t.avg !== null ? `moyenne ${fmtDuration(t.avg)}` : '',
      t.wokeAvg !== null ? `lever moyen ${fmtClock(t.wokeAvg)}` : '',
    ].filter(Boolean).join(' · ');
  } else if (t.kind === 'duration') {
    footer = [t.goal ? `objectif ${fmtDuration(t.goal, t.unit)}` : '', t.avg !== null ? `moyenne ${fmtDuration(t.avg, t.unit)}` : '']
      .filter(Boolean).join(' · ') + (t.avg !== null ? trendText : '');
  } else if (t.avg !== null) {
    const per = t.unit ? `${t.unit}/j` : 'par jour';
    footer = `moyenne ${fmtNum(t.avg, t.kind === 'volume' ? decimalsOf(t.step) : 1)} ${per}${t.goal ? ` · objectif ${fmtValue(t, t.goal)}` : ''}${trendText}`;
  }

  if (t.source === 'health') footer = ['depuis Health Connect', footer].filter(Boolean).join(' · ');

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 5) * 40).duration(260)}
      onLayout={(e) => {
        y.current = e.nativeEvent.layout.y;
      }}
      style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.iconBox, { backgroundColor: withAlpha(color, 0.13) }]}>
          <Icon name={t.icon as IconName} size={16} color={color} />
        </View>
        <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1, fontSize: 17 }}>
          {t.name}
        </AppText>
        {headRight && (
          <AppText variant="body" color={colors.textSecondary} style={{ fontSize: 13 }}>
            {headRight[0]}
            <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 13 }}>{headRight[1]}</AppText>
          </AppText>
        )}
        <Pressable
          onPress={() => router.push({ pathname: '/suivi/modifier/[id]', params: { id: String(t.id) } })}
          accessibilityRole="button"
          accessibilityLabel={`Modifier le suivi ${t.name}`}
          hitSlop={8}
          style={styles.more}>
          <Icon name="edit" size={15} color={colors.textTertiary} />
        </Pressable>
      </View>

      {night ? (
        <SleepTiles id={t.id} day={day} isToday={isToday} slept={night.slept ?? null} woke={night.woke ?? null} locked={locked} />
      ) : locked ? (
        <View style={{ alignItems: 'center', gap: 2 }} accessibilityLiveRegion="polite">
          <AppText
            style={styles.big}
            color={cur === null ? colors.textMuted : colors.text}
            accessibilityLabel={`${t.name} : ${cur === null ? 'rien pour l’instant' : fmtValue(t, cur)}`}>
            {main}
            <AppText style={styles.bigRest}>{rest}</AppText>
          </AppText>
          <AppText variant="caption">{isToday ? "aujourd'hui" : mediumDayLabel(day)} · Health Connect</AppText>
        </View>
      ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => bump(-1)}
          disabled={!canLower}
          accessibilityRole="button"
          accessibilityLabel={`Retirer ${fmtStep(t)}`}
          style={({ pressed }) => [styles.round, styles.roundGhost, !canLower && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.92 }] }]}>
          <Icon name="minus" size={20} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', gap: 2 }} accessibilityLiveRegion="polite">
          {editing ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <TextInput
                value={draft}
                onChangeText={changeDraft}
                onEndEditing={commitDraft}
                onSubmitEditing={commitDraft}
                autoFocus
                selectTextOnFocus
                keyboardType={keyboardFor(t.kind)}
                returnKeyType="done"
                placeholder={t.kind === 'duration' && t.unit !== 'min' ? '7h30' : '0'}
                placeholderTextColor={colors.textFaint}
                cursorColor={colors.text}
                accessibilityLabel={`${t.name}${t.unit ? ` en ${t.unit}` : ''}`}
                style={[styles.big, styles.input]}
              />
              {t.kind !== 'duration' && t.unit ? <AppText style={styles.bigRest}> {t.unit}</AppText> : null}
            </View>
          ) : (
            <Pressable
              onPress={t.kind === 'time' ? openClock : startEditing}
              accessibilityRole="button"
              accessibilityLabel={`${t.name} : ${cur === null ? 'rien de noté' : fmtValue(t, cur)}`}
              accessibilityHint={t.kind === 'time' ? "Choisir l'heure" : 'Taper une valeur'}
              hitSlop={8}>
              <AppText style={styles.big} color={cur === null ? colors.textMuted : colors.text}>
                {main}
                <AppText style={styles.bigRest}>{rest}</AppText>
              </AppText>
            </Pressable>
          )}
          <AppText variant="caption">
            {isToday ? "aujourd'hui" : mediumDayLabel(day)} · pas de {fmtStep(t)}
          </AppText>
        </View>
        <Pressable
          onPress={() => bump(1)}
          accessibilityRole="button"
          accessibilityLabel={t.kind === 'time' && cur === null ? 'Noter maintenant' : `Ajouter ${fmtStep(t)}`}
          style={({ pressed }) => [styles.round, { backgroundColor: colors.text }, pressed && { transform: [{ scale: 0.92 }] }]}>
          <Icon name="plus" size={20} color={colors.onLight} strokeWidth={2.2} />
        </Pressable>
      </View>
      )}

      <TrackerChart
        kind={t.kind}
        unit={t.unit}
        step={t.step}
        days={t.days}
        color={color}
        goal={t.goal}
        label={`${t.name} des 7 derniers jours`}
      />
      {!!footer && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {t.goal && t.kind !== 'time' ? <View style={styles.dashKey} /> : null}
          <AppText variant="caption" style={{ flex: 1 }}>
            {footer}
          </AppText>
        </View>
      )}
    </Animated.View>
  );
}

/** Sommeil : coucher de la veille et lever du jour, comme dans la première version de l'onglet. */
function SleepTiles({
  id, day, isToday, slept, woke, locked,
}: { id: number; day: string; isToday: boolean; slept: number | null; woke: number | null; locked: boolean }) {
  const mutate = useDbMutation();
  const today = todayKey();
  const open = (field: 'slept' | 'woke', value: number | null) =>
    router.push({ pathname: '/suivi/heure', params: { id: String(id), day, field, value: value === null ? '' : String(value) } });
  const goToBed = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const now = new Date();
    mutate((db) => setSleepTime(db, id, bedtimeTarget(now, today), 'slept', now.getHours() * 60 + now.getMinutes()));
  };
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={styles.tile}>
        <AppText variant="caption">Couché ({isToday ? 'hier' : 'la veille'})</AppText>
        <Pressable
          onPress={() => open('slept', slept)}
          disabled={locked}
          accessibilityRole={locked ? 'text' : 'button'}
          accessibilityLabel={locked ? undefined : "Modifier l'heure de coucher"}>
          <AppText style={styles.bigTime} color={slept !== null ? colors.text : colors.textMuted}>
            {slept !== null ? fmtClock(slept) : '--:--'}
          </AppText>
        </Pressable>
        {locked ? null : isToday ? (
          <Pressable onPress={goToBed} accessibilityRole="button" style={({ pressed }) => [styles.tileBtn, styles.tileBtnGhost, pressed && { opacity: 0.7 }]}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>Je me couche</AppText>
          </Pressable>
        ) : (
          <Pressable onPress={() => open('slept', slept)} accessibilityRole="button" style={[styles.tileBtn, styles.tileBtnFill]}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color="#D4D4D8">
              Modifier
            </AppText>
          </Pressable>
        )}
      </View>
      <View style={styles.tile}>
        <AppText variant="caption">Levé ({isToday ? 'auj.' : 'ce jour'})</AppText>
        <Pressable
          onPress={() => open('woke', woke)}
          disabled={locked}
          accessibilityRole={locked ? 'text' : 'button'}
          accessibilityLabel={locked ? undefined : "Modifier l'heure de lever"}>
          <AppText style={styles.bigTime} color={woke !== null ? colors.text : colors.textMuted}>
            {woke !== null ? fmtClock(woke) : '--:--'}
          </AppText>
        </Pressable>
        {!locked && (
          <Pressable onPress={() => open('woke', woke)} accessibilityRole="button" style={[styles.tileBtn, styles.tileBtnFill]}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color="#D4D4D8">
              Modifier
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: 6, padding: 14, backgroundColor: colors.row, borderRadius: 18 },
  bigTime: { fontFamily: fonts.displayThin, fontSize: 44, lineHeight: 48, letterSpacing: -1.3 },
  tileBtn: { height: 40, marginTop: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tileBtnGhost: { borderWidth: 1, borderColor: colors.borderDashed },
  tileBtnFill: { backgroundColor: colors.borderStrong },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  dayPill: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed, justifyContent: 'center' },
  addBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderDashed, alignItems: 'center', justifyContent: 'center' },
  card: { gap: 14, padding: 16, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 24 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  more: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  dashKey: { width: 14, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.textTertiary },
  round: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  roundGhost: { borderWidth: 1, borderColor: colors.borderDashed },
  big: { fontFamily: fonts.displayThin, fontSize: 48, lineHeight: 52, letterSpacing: -1.4, color: colors.text },
  input: { minWidth: 80, padding: 0, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: colors.text },
  bigRest: { fontFamily: fonts.displayLight, fontSize: 22, letterSpacing: 0, color: colors.textMuted },
  newBtn: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderDashed,
  },
  primary: {
    height: 44, marginTop: 6, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 999, backgroundColor: colors.text,
  },
});
