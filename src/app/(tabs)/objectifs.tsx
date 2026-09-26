import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { BottomSwitcher, SWITCHER_H } from '@/components/agenda/view-switcher';
import { BottomExtraContext, tabBarTop, useTabBarSpace } from '@/components/tab-bar';
import {
  addToGoalEntry, fmtGoal, type GoalPeriod, type GoalProgress, listGoals, setGoalEntry, startChrono, stopChrono,
} from '@/db/goals';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { mediumDayLabel, parseDay, todayKey, weekRangeLabel } from '@/lib/dates';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

type Tab = 'list' | GoalPeriod;
const TABS: { key: Tab; label: string }[] = [
  { key: 'list', label: 'Liste' },
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];
const SECTIONS: { period: GoalPeriod; title: string }[] = [
  { period: 'day', title: "Aujourd'hui" },
  { period: 'week', title: 'Cette semaine' },
  { period: 'month', title: 'Ce mois-ci' },
];
/** « 12 j », « 3 sem. », « 2 mois ». */
const STREAK_UNIT: Record<GoalPeriod, string> = { day: 'j', week: 'sem.', month: 'mois' };
const STREAK_LONG: Record<GoalPeriod, [string, string]> = {
  day: ['jour atteint', "jours atteints d'affilée"],
  week: ['semaine atteinte', "semaines atteintes d'affilée"],
  month: ['mois atteint', "mois atteints d'affilée"],
};
const DONE = colors.success;
const DONE_BORDER = 'rgba(43,217,74,0.45)';
const STREAK = categoryColors.friends; // orange des séries

/**
 * Onglet Objectifs (maquette HF-Objectifs, et App-ObjectifsListe pour la Liste) :
 * - Liste (par défaut) : tout ce qui est en cours, avec les séries (jours / semaines / mois d'affilée) ;
 * - Jour / Semaine / Mois : une carte par objectif, un type de carte par sorte d'objectif.
 * Le choix de la vue est en bas, au-dessus de la barre d'onglets, comme dans l'agenda.
 */
export default function ObjectifsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <BottomExtraContext value={SWITCHER_H + 10}>
      <ObjectifsBody bottomOffset={tabBarTop(insets.bottom) + 10} />
    </BottomExtraContext>
  );
}

function ObjectifsBody({ bottomOffset }: { bottomOffset: number }) {
  const today = todayKey();
  const bottom = useTabBarSpace();
  const [tab, setTab] = useState<Tab>('list');
  const { data: goals } = useDbQuery((db) => listGoals(db, today), today, { cacheId: 'objectifs' });

  const mine = (goals ?? []).filter((g) => tab === 'list' || g.period === tab);
  const doneN = mine.filter((g) => g.done).length;
  const subtitle =
    tab === 'week'
      ? `semaine du ${weekRangeLabel(today)}`
      : tab === 'month'
        ? format(parseDay(today), 'MMMM yyyy', { locale: fr })
        : mediumDayLabel(today);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="body" color={colors.textSecondary}>
            {subtitle}
          </AppText>
          <AppText variant="display" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38, letterSpacing: -0.7 }}>
            Objectifs
          </AppText>
        </View>
        {mine.length > 0 && (
          <View style={{ alignItems: 'flex-end' }} accessibilityLabel={`${doneN} sur ${mine.length} atteints`}>
            <AppText style={styles.score}>
              {doneN}
              <AppText style={styles.scoreOf}>/{mine.length}</AppText>
            </AppText>
            <AppText variant="caption">atteints</AppText>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        {tab === 'list' ? (
          goals && <GoalList goals={goals} />
        ) : (
          <>
            {goals && mine.length === 0 && (
              <AppText variant="body" color={colors.textTertiary} style={{ textAlign: 'center', paddingVertical: 20 }}>
                {tab === 'day' ? 'Aucun objectif du jour.' : tab === 'week' ? 'Aucun objectif de la semaine.' : 'Aucun objectif du mois.'}
              </AppText>
            )}
            {mine.map((g, i) => (
              <Animated.View key={`${tab}-${g.id}`} entering={FadeInDown.delay(Math.min(i, 6) * 30).duration(260)} layout={LinearTransition.duration(200)}>
                <GoalCard g={g} today={today} />
              </Animated.View>
            ))}
          </>
        )}

        {tab !== 'list' && (
          <Pressable
            onPress={() => router.push({ pathname: '/objectif/nouveau', params: { period: tab } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addBtn, pressed && { backgroundColor: colors.surface }]}>
            <Icon name="plus" size={16} color={colors.textSecondary} strokeWidth={2} />
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.textSecondary}>
              Nouvel objectif
            </AppText>
          </Pressable>
        )}
      </ScrollView>

      {/* Choix de la vue, en bas, juste au-dessus de la barre d'onglets (comme l'agenda). */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: bottomOffset }}>
        <BottomSwitcher
          options={TABS}
          value={tab}
          onChange={(t) => {
            if (t !== tab) Haptics.selectionAsync();
            setTab(t);
          }}
        />
      </View>
    </Screen>
  );
}

/** Vue Liste : tous les objectifs en cours, par période ; toucher une ligne ouvre son historique. */
function GoalList({ goals }: { goals: GoalProgress[] }) {
  if (goals.length === 0) {
    return (
      <AppText variant="body" color={colors.textTertiary} style={{ textAlign: 'center', paddingVertical: 20 }}>
        Aucun objectif pour l&apos;instant.
      </AppText>
    );
  }
  return (
    <>
      {SECTIONS.map((sec, si) => {
        const list = goals.filter((g) => g.period === sec.period);
        if (list.length === 0) return null;
        return (
          <Animated.View key={sec.period} entering={FadeInDown.delay(30 + si * 30).duration(260)} style={styles.section}>
            <View style={styles.sectionHead}>
              <AppText variant="overline">{sec.title}</AppText>
              <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 13 }} color={colors.textSecondary}>
                {list.filter((g) => g.done).length} / {list.length}
              </AppText>
            </View>
            {list.map((g, i) => (
              <ListRow
                key={g.id}
                g={g}
                first={i === 0}
                onPress={() => router.push({ pathname: '/objectif/historique/[id]', params: { id: String(g.id) } })}
              />
            ))}
          </Animated.View>
        );
      })}
    </>
  );
}

function ListRow({ g, first, onPress }: { g: GoalProgress; first: boolean; onPress: () => void }) {
  const left = g.target - g.value;
  const value =
    g.kind === 'bool'
      ? g.done ? 'fait' : '—'
      : `${fmtGoal(g.value)} / ${fmtGoal(g.target)}${g.unit && g.kind !== 'counter' ? ` ${g.unit}` : ''}`;
  const meta = g.done ? 'atteint' : g.kind === 'bool' ? 'pas encore' : `reste ${fmtGoal(left)}`;
  const long = STREAK_LONG[g.period][g.streak > 1 ? 1 : 0];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${g.title}, ${value}, ${meta}${g.streak ? `, série de ${g.streak} ${long}` : ''}`}
      style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && { opacity: 0.6 }]}>
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(g.color, 0.13) }]}>
        <Icon name={g.icon} size={16} color={g.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
            {g.title}
          </AppText>
          <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 15 }} color={g.done ? DONE : colors.text}>
            {value}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {g.history.map((h, i) => (
              <View
                key={i}
                style={[
                  styles.histDot,
                  h === 'met' ? { backgroundColor: g.color } : h === 'now' ? { borderWidth: 1.5, borderColor: g.color } : { backgroundColor: colors.border },
                ]}
              />
            ))}
          </View>
          <AppText variant="caption" numberOfLines={1}>
            {meta}
          </AppText>
        </View>
      </View>
      <View style={[styles.streak, g.streak ? { backgroundColor: withAlpha(STREAK, 0.14) } : { backgroundColor: colors.segmented }]}>
        <Icon name="flame" size={13} color={g.streak ? STREAK : '#5B5B61'} strokeWidth={2} />
        <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 14 }} color={g.streak ? STREAK : colors.textMuted}>
          {g.streak}
          <AppText style={{ fontFamily: fonts.bodyMedium, fontSize: 11 }} color={g.streak ? STREAK : colors.textMuted}>
            {' '}{STREAK_UNIT[g.period]}
          </AppText>
        </AppText>
      </View>
    </Pressable>
  );
}

/** Une carte d'objectif ; appui long pour la modifier. */
function GoalCard({ g, today }: { g: GoalProgress; today: string }) {
  const mutate = useDbMutation();
  const edit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/objectif/modifier/[id]', params: { id: String(g.id) } });
  };
  const add = (delta: number) => {
    Haptics.selectionAsync();
    mutate((db) => addToGoalEntry(db, g.id, today, delta, g.period));
  };
  const set = (v: number) => mutate((db) => setGoalEntry(db, g.id, today, v));

  // Compteur atteint : le texte lui-même passe en vert (« Atteint · série 5 j ») ; les autres ont une pastille.
  const head = (right: React.ReactNode, meta: string, doneMeta?: string) => (
    <View style={styles.cardHead}>
      <View style={[styles.iconBox, { backgroundColor: withAlpha(g.color, 0.13) }]}>
        <Icon name={g.icon} size={16} color={g.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingLeft: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
          {g.title}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {g.done && doneMeta ? (
            <AppText variant="caption" numberOfLines={1} color={DONE} style={{ flexShrink: 1, fontFamily: fonts.bodySemiBold }}>
              {doneMeta}
            </AppText>
          ) : (
            <>
              <AppText variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                {meta}
              </AppText>
              {g.done && <DonePill />}
            </>
          )}
        </View>
      </View>
      {right}
    </View>
  );

  // L'onglet dit déjà la période : pour la semaine / le mois, on montre ce qu'il reste à faire.
  const left = g.target - g.value;
  const period = g.period !== 'day' && left > 0 ? ` · reste ${fmtGoal(left)}` : '';
  const streak = g.streak > 1 ? ` · série ${g.streak} ${STREAK_UNIT[g.period]}` : '';

  let body: React.ReactNode;
  if (g.kind === 'counter') {
    body = (
      <>
        {head(
          <>
            <RoundBtn icon="minus" label="Retirer 1" disabled={g.value <= 0} onPress={() => add(-1)} />
            <AppText style={styles.count} accessibilityLiveRegion="polite">
              {fmtGoal(g.value)}
              <AppText style={styles.countOf}>/{fmtGoal(g.target)}</AppText>
            </AppText>
            <RoundBtn icon="plus" label="Ajouter 1" filled dim={g.done} onPress={() => add(1)} />
          </>,
          `Compteur${period}${streak}`,
          `Atteint${streak}`,
        )}
        {g.target <= 12 ? <Segments n={g.value} of={g.target} color={g.done ? DONE : g.color} /> : <Bar ratio={g.value / g.target} color={g.done ? DONE : g.color} />}
      </>
    );
  } else if (g.kind === 'value') {
    body = (
      <>
        {head(
          <>
            <NumberInput value={g.today} onCommit={set} label={`${g.title} du jour`} />
            <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 14 }} color={colors.textTertiary}>
              / {fmtGoal(g.target)}
            </AppText>
          </>,
          `Valeur${g.unit ? ` en ${g.unit}` : ''}${period}${streak}`,
        )}
        <Bar ratio={g.value / g.target} color={g.done ? DONE : g.color} />
      </>
    );
  } else if (g.kind === 'duration') {
    body = (
      <>
        {head(
          <>
            <Chrono g={g} today={today} />
            <AppText style={{ fontFamily: fonts.displayLight, fontSize: 22 }}>
              {fmtGoal(g.value)}
              <AppText style={{ fontFamily: fonts.displayLight, fontSize: 14 }} color={colors.textMuted}>
                /{fmtGoal(g.target)} {g.unit || 'min'}
              </AppText>
            </AppText>
          </>,
          `Durée${period}${streak}`,
        )}
        <Bar ratio={g.value / g.target} color={g.done ? DONE : g.color} />
      </>
    );
  } else {
    body = head(
      <>
        <DoneToggle on={g.today >= 1} onPress={() => set(g.today >= 1 ? 0 : 1)} />
      </>,
      `À cocher${streak}`,
    );
  }

  return (
    <Pressable
      onLongPress={edit}
      delayLongPress={400}
      accessibilityHint="Appui long pour modifier l'objectif"
      style={[styles.card, g.done && { borderColor: DONE_BORDER }]}>
      {body}
    </Pressable>
  );
}

function DonePill() {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.donePill}>
      <Icon name="check" size={10} color={colors.bg} strokeWidth={3.4} />
      <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={colors.bg}>
        atteint
      </AppText>
    </Animated.View>
  );
}

function RoundBtn({
  icon, label, onPress, filled, disabled, dim,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
  filled?: boolean;
  disabled?: boolean;
  dim?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [
        styles.round,
        filled ? { backgroundColor: colors.text } : { borderWidth: 1, borderColor: colors.borderDashed },
        (disabled || dim) && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.92 }] },
      ]}>
      <Icon name={icon} size={18} color={filled ? colors.onLight : colors.text} strokeWidth={filled ? 2.2 : 2} />
    </Pressable>
  );
}

/** « Fait » à cocher (objectif oui / non) : coché = oui, pas coché = non. */
function DoneToggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityLabel="Fait"
      accessibilityState={{ checked: on }}
      style={[styles.yn, on ? { backgroundColor: colors.text } : { borderWidth: 1, borderColor: colors.borderDashed }]}>
      <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={on ? colors.onLight : '#D4D4D8'}>
        Fait
      </AppText>
    </Pressable>
  );
}

/** Saisie d'un nombre ; enregistrée en quittant le champ. */
function NumberInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  const [focused, setFocused] = useState(false); // hors saisie, on affiche la valeur enregistrée
  return (
    <TextInput
      value={focused ? text : value ? fmtGoal(value) : ''}
      onChangeText={(t) => setText(t.replace(/[^\d,.]/g, ''))}
      onFocus={() => {
        setFocused(true);
        setText(value ? String(value) : '');
      }}
      onBlur={() => {
        setFocused(false);
        const n = Number(text.replace(',', '.'));
        if (Number.isFinite(n) && n !== value) onCommit(n);
      }}
      keyboardType="decimal-pad"
      placeholder="0"
      placeholderTextColor={colors.textTertiary}
      cursorColor={colors.text}
      accessibilityLabel={label}
      returnKeyType="done"
      style={[styles.numInput, focused && { borderColor: colors.text }]}
    />
  );
}

/** Chrono d'un objectif « durée » : départ / arrêt ; les minutes s'ajoutent au jour. */
function Chrono({ g, today }: { g: GoalProgress; today: string }) {
  const mutate = useDbMutation();
  const running = g.chronoSince !== null;
  // Tic à la seconde, seulement quand le chrono tourne.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const secs = running ? Math.max(0, Math.floor((now - g.chronoSince!) / 1000)) : 0;
  const label = running ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : 'Chrono';
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        mutate(async (db) => {
          if (running) await stopChrono(db, g.id, today);
          else await startChrono(db, g.id);
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={running ? `Arrêter le chrono, ${label}` : 'Lancer le chrono'}
      style={[styles.chrono, running && { backgroundColor: withAlpha(g.color, 0.18) }]}>
      <Icon name={running ? 'check' : 'timer'} size={16} color={running ? g.color : '#D4D4D8'} strokeWidth={running ? 2.4 : 1.8} />
      <AppText style={{ fontFamily: running ? fonts.displayMedium : fonts.bodySemiBold, fontSize: 13 }} color={running ? g.color : '#D4D4D8'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Segments({ n, of, color }: { n: number; of: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: of }, (_, i) => (
        <View key={i} style={styles.seg}>
          {i < n && <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, borderRadius: 4, backgroundColor: color }} />}
        </View>
      ))}
    </View>
  );
}

function Bar({ ratio, color }: { ratio: number; color: string }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(withTiming(Math.max(0, Math.min(1, ratio)), { duration: 400 }));
  }, [w, ratio]);
  const fill = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: color }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  score: { fontFamily: fonts.displayThin, fontSize: 34, lineHeight: 36, letterSpacing: -1, color: colors.text },
  scoreOf: { fontFamily: fonts.displayThin, fontSize: 20, color: colors.textMuted },
  section: { paddingVertical: 6, paddingHorizontal: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 4, paddingHorizontal: 2 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 2 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.row },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  histDot: { width: 8, height: 8, borderRadius: 4 },
  streak: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 7, paddingRight: 9, borderRadius: 999 },
  card: { gap: 12, padding: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBox: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 1,
    paddingLeft: 5,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: colors.success,
  },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 54, textAlign: 'center', fontFamily: fonts.displayLight, fontSize: 28, letterSpacing: -0.5, color: colors.text },
  countOf: { fontFamily: fonts.displayLight, fontSize: 16, color: colors.textMuted },
  seg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', flexDirection: 'row' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  numInput: {
    width: 84,
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 17,
    textAlign: 'right',
  },
  chrono: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: '#232327',
  },
  yn: { height: 44, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center' },
  addBtn: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderDashed,
    borderRadius: 16,
  },
});
