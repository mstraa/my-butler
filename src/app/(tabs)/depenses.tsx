import * as Haptics from 'expo-haptics';
import { router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, Keyframe, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { useDarkFab } from '@/components/fab-tone';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { tabBarTop } from '@/components/tab-bar';
import { type Expense, formatCents, getMonthSummary, monthOf, shiftMonthKey } from '@/db/expenses';
import { useDbQuery } from '@/db/use-query';
import { dayOf, mediumDayLabel, todayKey } from '@/lib/dates';
import { monthLabel } from '@/lib/expense-format';
import { setExpenseView, useExpenseView } from '@/lib/expense-view';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';


/*
 * Onglet Dépenses, deux états (maquette HF-Depenses) :
 * - fermé (à l'ouverture) : la partie sombre prend tout l'écran — total en très grand, répartition
 *   par catégorie — et la feuille blanche « Historique » dépasse en bas ;
 * - ouvert : glisser vers le haut (ou toucher la feuille) la fait monter ; le total rétrécit,
 *   la répartition s'efface, et l'on retrouve la mise en page de la maquette.
 * p va de 0 (fermé) à 1 (ouvert).
 */
const PEEK = 68; // hauteur visible de la feuille fermée (poignée + titre)
const BIG = 1.4; // agrandissement du total quand la feuille est fermée
const TOTAL = 64; // taille du total, feuille ouverte
const LIFT = TOTAL * (BIG - 1); // place en plus prise par le grand total
const AIR = 16; // marge en plus en haut quand la feuille est fermée

export default function DepensesScreen() {
  const insets = useSafeAreaInsets();
  const current = monthOf(todayKey());
  const { month, filter } = useExpenseView();
  const { data: s } = useDbQuery((db) => getMonthSummary(db, month), month, { cacheId: 'depenses' });
  const [open, setOpen] = useState(false);
  useDarkFab(); // la feuille blanche est toujours derrière le bouton +, ouverte ou non

  const p = useSharedValue(0);
  const H = useSharedValue(0); // hauteur de l'écran (sous l'en-tête système)
  const openTop = useSharedValue(0); // haut de la feuille ouverte = bas du résumé
  const start = useSharedValue(0);
  const [measured, setMeasured] = useState(false);

  const bottom = tabBarTop(insets.bottom) + 12;
  // Distance parcourue par la feuille entre fermé et ouvert.
  const travel = () => {
    'worklet';
    return Math.max(1, H.get() - bottom - PEEK - openTop.get());
  };

  const snap = (to: 0 | 1) => {
    'worklet';
    p.set(withTiming(to, { duration: 340, easing: ease }));
    scheduleOnRN(setOpen, to === 1);
  };
  const toggle = (to: 0 | 1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    snap(to);
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      start.set(p.get());
    })
    .onUpdate((e) => {
      p.set(Math.min(1, Math.max(0, start.get() - e.translationY / travel())));
    })
    .onEnd((e) => {
      if (e.velocityY < -500) return snap(1);
      if (e.velocityY > 500) return snap(0);
      snap(p.get() > 0.5 ? 1 : 0);
    });

  const navigation = useNavigation();
  useEffect(() => {
    // Retour Android : referme d'abord la feuille.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!open || !navigation.isFocused()) return false;
      toggle(0);
      return true;
    });
    return () => sub.remove();
  });

  const sheetStyle = useAnimatedStyle(() => ({
    top: openTop.get(),
    opacity: openTop.get() ? 1 : 0,
    transform: [{ translateY: (1 - p.get()) * travel() }],
  }));
  const summaryStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * AIR }] }));
  const totalStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (BIG - 1) * (1 - p.get()) }] }));
  const belowStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * LIFT }] }));
  const breakdownStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - p.get() * 2.2),
    transform: [{ translateY: (1 - p.get()) * (AIR + LIFT) - p.get() * 24 }],
  }));
  const filterStyle = useAnimatedStyle(() => ({ opacity: p.get() }));
  // Feuille fermée, la liste resterait visible entre les onglets : elle apparaît en montant.
  const listStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, p.get() * 1.5) }));
  const chevronStyle = useAnimatedStyle(() => ({
    opacity: 1 - p.get(),
    transform: [{ rotate: `${-90 + p.get() * 180}deg` }],
  }));

  const [euros, cents] = s ? formatCents(s.total, { euro: false }).split(',') : ['0', '00'];
  const prevName = monthLabel(shiftMonthKey(month, -1));
  const delta = s && s.prevTotal ? Math.round(((s.total - s.prevTotal) / s.prevTotal) * 100) : null;
  const rows = (s?.expenses ?? []).filter((e) => filter === 'all' || (e.categoryId ?? -1) === filter);
  const filterCat = filter === 'all' ? null : s?.byCategory.find((c) => (c.id ?? -1) === filter);
  const count = rows.length;

  return (
    <Screen>
      <View
        style={{ flex: 1 }}
        onLayout={(e) => {
          H.set(e.nativeEvent.layout.height);
        }}>
        <Fan colors={(s?.byCategory ?? []).slice(0, 3).map((c) => c.color)} />

        <GestureDetector gesture={pan}>
          <View style={{ flex: 1 }}>
            <View style={styles.header}>
              <AppText variant="display" accessibilityRole="header">
                Dépenses
              </AppText>
              <Pressable
                onPress={() => router.push('/depense/mois')}
                accessibilityRole="button"
                accessibilityLabel={`Mois : ${monthLabel(month)}`}
                style={({ pressed }) => [styles.monthPill, pressed && { backgroundColor: colors.row }]}>
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }}>
                  {monthLabel(month)}
                  {month.slice(0, 4) !== current.slice(0, 4) ? ` ${month.slice(0, 4)}` : ''}
                </AppText>
                <Icon name="chevronDown" size={14} strokeWidth={2} />
              </Pressable>
            </View>

            <Animated.View
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout;
                openTop.set(y + height);
                if (!measured) setMeasured(true);
              }}
              style={[styles.summary, summaryStyle]}>
              <AppText variant="body" color={colors.textSecondary}>
                {month === current ? 'Dépensé ce mois-ci' : `Dépensé en ${monthLabel(month).toLowerCase()}`}
              </AppText>
              <Animated.View style={[{ alignSelf: 'flex-start', transformOrigin: 'left top' }, totalStyle]}>
                {/* Toucher le total retire le filtre de l'historique. */}
                <Pressable
                  onPress={() => {
                    if (filter === 'all') return;
                    Haptics.selectionAsync();
                    setExpenseView({ filter: 'all' });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={s ? formatCents(s.total) : undefined}
                  accessibilityHint={filter !== 'all' ? "Retire le filtre de l'historique" : undefined}>
                  <AppText style={styles.total}>
                    {euros}
                    <AppText style={styles.totalCents}>,{cents} €</AppText>
                  </AppText>
                </Pressable>
              </Animated.View>

              <Animated.View style={[{ gap: 14 }, belowStyle]}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => router.push('/depense/nouvelle')}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}>
                    <View style={styles.addDot}>
                      <Icon name="plus" size={14} color={colors.text} strokeWidth={2.6} />
                    </View>
                    <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
                      Dépense
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => router.push('/depense/budget')}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.budgetBtn, pressed && { opacity: 0.8 }]}>
                    <AppText style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }} color="#D4D4D8">
                      {s?.budget != null ? `Budget ${formatCents(s.budget).replace(',00', '')}` : 'Budget (facultatif)'}
                    </AppText>
                  </Pressable>
                </View>

                {s?.budget != null && <BudgetBar spent={s.total} budget={s.budget} />}

                <View style={styles.compare}>
                  <View style={{ gap: 2, flexShrink: 1 }}>
                    <AppText variant="caption" style={{ fontSize: 13 }}>
                      {prevName}
                    </AppText>
                    <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 20 }} color={colors.text}>
                      {s?.prevTotal ? formatCents(s.prevTotal).replace(',00', '') : '—'}
                      {delta !== null && (
                        <AppText variant="body" color={colors.textSecondary} style={{ fontSize: 13 }}>
                          {' '}· {delta > 0 ? '+' : delta < 0 ? '−' : ''}
                          {Math.abs(delta)} %
                        </AppText>
                      )}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: 'row' }} accessibilityLabel="Répartition par catégorie">
                    {(s?.byCategory ?? []).slice(0, 3).map((c, i) => (
                      <View
                        key={String(c.id)}
                        accessibilityLabel={`${c.name} ${Math.round(c.share * 100)} %`}
                        style={[styles.shareDot, { backgroundColor: c.color, marginLeft: i ? -8 : 0 }]}>
                        <AppText style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: -0.3 }} color={colors.onLight}>
                          {Math.round(c.share * 100)}%
                        </AppText>
                      </View>
                    ))}
                  </View>
                </View>
              </Animated.View>
            </Animated.View>

            {/* Répartition : visible feuille fermée ; toucher une catégorie ouvre l'historique filtré. */}
            <Animated.View style={[styles.breakdown, breakdownStyle]} pointerEvents={open ? 'none' : 'auto'}>
              <AppText variant="overline">Par catégorie</AppText>
              {(s?.byCategory ?? []).slice(0, 5).map((c) => (
                <Pressable
                  key={String(c.id)}
                  onPress={() => {
                    setExpenseView({ filter: c.id ?? -1 });
                    toggle(1);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}, ${formatCents(c.cents)}, ${Math.round(c.share * 100)} %`}
                  style={({ pressed }) => [styles.catRow, pressed && { opacity: 0.6 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.catDot, { backgroundColor: c.color }]} />
                    <AppText variant="bodyMedium" style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>
                      {c.name}
                    </AppText>
                    <AppText variant="caption">{Math.round(c.share * 100)} %</AppText>
                    <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 15, minWidth: 76, textAlign: 'right' }}>
                      {formatCents(c.cents)}
                    </AppText>
                  </View>
                  <View style={styles.catTrack}>
                    <View style={{ width: `${Math.max(2, c.share * 100)}%`, height: 3, borderRadius: 2, backgroundColor: c.color }} />
                  </View>
                </Pressable>
              ))}
              {s && s.byCategory.length === 0 && (
                <AppText variant="body" color={colors.textTertiary}>
                  Rien de dépensé ce mois-ci.
                </AppText>
              )}
            </Animated.View>
          </View>
        </GestureDetector>

        <Animated.View style={[styles.white, sheetStyle]} pointerEvents={measured ? 'box-none' : 'none'}>
          <GestureDetector gesture={pan}>
            <Pressable
              onPress={() => !open && toggle(1)}
              accessibilityRole="button"
              accessibilityLabel={open ? 'Historique' : `Ouvrir l'historique, ${count} dépense${count > 1 ? 's' : ''}`}
              accessibilityState={{ expanded: open }}
              style={styles.handle}>
              <View style={styles.grabber} />
              <View style={styles.histHead}>
                <Animated.View style={filterStyle} pointerEvents={open ? 'auto' : 'none'}>
                  <Pressable
                    onPress={() => router.push('/depense/filtre')}
                    accessibilityRole="button"
                    accessibilityLabel={filterCat ? `Filtre : ${filterCat.name}` : 'Filtrer par catégorie'}
                    style={[styles.filterBtn, filterCat && { backgroundColor: colors.sheetText }]}>
                    <Icon name="filter" size={16} color={filterCat ? colors.text : colors.sheetText} strokeWidth={2} />
                  </Pressable>
                </Animated.View>
                <AppText variant="bodyStrong" color={colors.sheetText} style={{ fontSize: 16 }}>
                  {filterCat ? filterCat.name : 'Historique'}
                  {!open && count > 0 && (
                    <AppText variant="body" color={colors.sheetTextSecondary} style={{ fontSize: 14 }}>
                      {' '}· {count}
                    </AppText>
                  )}
                </AppText>
                <Animated.View style={[{ width: 36, alignItems: 'center' }, chevronStyle]}>
                  <Icon name="chevronRight" size={18} color={colors.sheetTextSecondary} strokeWidth={2} />
                </Animated.View>
              </View>
            </Pressable>
          </GestureDetector>
          <Animated.ScrollView
            scrollEnabled={open}
            pointerEvents={open ? 'auto' : 'none'}
            style={listStyle}
            contentContainerStyle={{ paddingBottom: bottom + 8 }}
            showsVerticalScrollIndicator={false}>
            {s && rows.length === 0 && (
              <AppText variant="body" color={colors.sheetTextSecondary} style={{ textAlign: 'center', paddingVertical: 24 }}>
                {filterCat ? 'Aucune dépense dans cette catégorie.' : 'Aucune dépense ce mois-ci.'}
              </AppText>
            )}
            {rows.map((e, i) => (
              <Row key={e.id} e={e} last={i === rows.length - 1} delay={Math.min(i, 8) * 30} />
            ))}
          </Animated.ScrollView>
        </Animated.View>
      </View>
    </Screen>
  );
}

function Row({ e, last, delay }: { e: Expense; last: boolean; delay: number }) {
  return (
    <Animated.View entering={rowEnter(delay)}>
      <Pressable
        onPress={() => router.push({ pathname: '/depense/nouvelle', params: { id: String(e.id) } })}
        accessibilityRole="button"
        accessibilityLabel={`${e.label}, ${formatCents(e.amountCents)}, ${mediumDayLabel(dayOf(e.spentAt))}`}
        style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { opacity: 0.6 }]}>
        <View style={[styles.rowIcon, { backgroundColor: withAlpha(e.color, 0.25), borderColor: e.color }]}>
          <Icon name={e.icon} size={18} color={colors.sheetText} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <AppText variant="bodyStrong" color={colors.sheetText} numberOfLines={1} style={{ fontSize: 15 }}>
            {e.label}
          </AppText>
          <AppText variant="caption" color={colors.sheetTextSecondary} numberOfLines={1}>
            {mediumDayLabel(dayOf(e.spentAt))}
            {e.category ? ` · ${e.category}` : ''}
            {e.taskId ? ' · tâche' : ''}
          </AppText>
        </View>
        <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 16 }} color={colors.sheetText}>
          {formatCents(e.amountCents, { sign: true })}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  const ratio = budget ? spent / budget : 0;
  const over = spent > budget;
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(withDelay(120, withTiming(Math.min(ratio, 1), { duration: 500, easing: ease })));
  }, [w, ratio]);
  const fill = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: over ? colors.late : colors.text }, fill]} />
      </View>
      <AppText variant="caption" color={over ? colors.late : colors.textTertiary}>
        {over ? `Budget dépassé de ${formatCents(spent - budget)}` : `Reste ${formatCents(budget - spent)} sur ${formatCents(budget)}`}
      </AppText>
    </View>
  );
}

/** Les trois cartes en éventail en haut à droite, aux couleurs des plus grosses catégories. */
function Fan({ colors: cs }: { colors: string[] }) {
  const palette = [cs[2] ?? categoryColors.sport, cs[1] ?? categoryColors.work, cs[0] ?? categoryColors.groceries];
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(100, withTiming(1, { duration: 500, easing: ease })));
  }, [p]);
  const s1 = useAnimatedStyle(() => ({ transform: [{ translateX: -36 * p.get() }, { rotate: `${-8 * p.get()}deg` }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateX: -18 * p.get() }, { rotate: `${-2 * p.get()}deg` }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ rotate: `${5 * p.get()}deg` }] }));
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.fan}>
      {[s1, s2, s3].map((st, i) => (
        <Animated.View key={i} style={[styles.fanCard, { backgroundColor: palette[i] }, st]} />
      ))}
    </View>
  );
}

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const rowEnter = (delay: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 8 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease },
  })
    .duration(220)
    .delay(delay);

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  monthPill: {
    height: 36,
    marginRight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderRadius: 999,
  },
  fan: { position: 'absolute', right: -58, top: 96, width: 120, height: 168 },
  fanCard: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20, transformOrigin: '50% 100%' },
  summary: { gap: 14, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 22 },
  total: { fontFamily: fonts.displayLight, fontSize: 64, lineHeight: 64, letterSpacing: -2, color: colors.text },
  totalCents: { fontFamily: fonts.displayLight, fontSize: 30, letterSpacing: 0, color: colors.textMuted },
  addBtn: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 16,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
  addDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.onLight, alignItems: 'center', justifyContent: 'center' },
  budgetBtn: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#232327', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  compare: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.segmented,
    borderWidth: 1,
    borderColor: '#26262A',
    borderRadius: 20,
  },
  shareDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.segmented,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdown: { gap: 4, paddingHorizontal: 20 },
  catRow: { gap: 8, paddingVertical: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catTrack: { height: 3, borderRadius: 2, backgroundColor: colors.row, overflow: 'hidden' },
  white: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  handle: { paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8' },
  histHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 6 },
  filterBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F2' },
  rowIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
