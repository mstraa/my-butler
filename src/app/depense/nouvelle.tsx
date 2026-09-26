import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  cancelAnimation, Easing, FadeIn, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { DateTimeSheet } from '@/components/form/date-time-sheet';
import { Icon } from '@/components/icon';
import { type Category, getCategories } from '@/db/events';
import {
  addExpense, deleteExpense, evalAmount, type ExpenseTask, formatCents, listExpenseTasks, updateExpense,
} from '@/db/expenses';
import { setTaskDone } from '@/db/tasks';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dayOf, mediumDayLabel, nowStamp, type Stamp, timeOf, todayKey } from '@/lib/dates';
import { colors, fonts } from '@/theme/tokens';

const OPS = [
  { k: '+', label: 'Plus' },
  { k: '−', label: 'Moins' },
  { k: '×', label: 'Multiplier' },
  { k: '÷', label: 'Diviser' },
] as const;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];
const isOp = (c: string) => '+−×÷'.includes(c);

type Loaded = {
  categories: Category[];
  tasks: ExpenseTask[];
  expense: { amountCents: number; label: string; categoryId: number | null; spentAt: Stamp } | null;
};

/**
 * Saisie d'une dépense (maquette HF-Saisie) : pavé avec + − × ÷, catégorie, « glisser pour valider ».
 * « Tâche faite » : coche une tâche à dépense suivie avec son montant réel.
 * `id` : modifier une dépense existante (même écran, sans le mode tâche).
 */
export default function ExpenseEntryScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : null;
  const { data } = useDbQuery<Loaded>(async (db) => {
    const [categories, tasks, row] = await Promise.all([
      getCategories(db),
      listExpenseTasks(db),
      editId
        ? db.getFirstAsync<{ amount_cents: number; label: string; category_id: number | null; spent_at: Stamp }>(
            'SELECT amount_cents, label, category_id, spent_at FROM expenses WHERE id = ?', editId,
          )
        : null,
    ]);
    return {
      categories,
      tasks,
      expense: row ? { amountCents: row.amount_cents, label: row.label, categoryId: row.category_id, spentAt: row.spent_at } : null,
    };
  }, id ?? '');

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.sheet }} />;
  return <Entry key={id ?? 'new'} editId={editId} {...data} />;
}

function Entry({ editId, categories, tasks, expense }: Loaded & { editId: number | null }) {
  const mutate = useDbMutation();
  const cats = categories;
  const [mode, setMode] = useState<'expense' | 'task'>('expense');
  const [expr, setExpr] = useState(expense ? formatCents(expense.amountCents, { euro: false }).replace(/ /g, '').replace(/,00$/, '') : '0');
  const [categoryId, setCategoryId] = useState<number | null>(
    expense ? expense.categoryId : (cats.find((c) => c.key === 'groceries')?.id ?? null),
  );
  const [label, setLabel] = useState(expense?.label ?? '');
  const [spentAt, setSpentAt] = useState<Stamp>(expense?.spentAt ?? nowStamp());
  const [taskId, setTaskId] = useState<number | null>(tasks[0]?.id ?? null);
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState<{ cents: number; where: string } | null>(null);
  const [slideKey, setSlideKey] = useState(0);
  const catScroll = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  const cents = evalAmount(expr);
  const hasOp = [...expr.slice(1)].some(isOp);
  const cat = cats.find((c) => c.id === categoryId);
  const task = tasks.find((t) => t.id === taskId);

  const press = (k: string) => {
    Haptics.selectionAsync();
    setExpr((e) => {
      if (k === '⌫') return e.length > 1 ? e.slice(0, -1) : '0';
      if (isOp(k)) {
        if (e === '0') return e;
        return (isOp(e[e.length - 1]) ? e.slice(0, -1) : e) + k;
      }
      const last = e.split(/[+−×÷]/).pop() ?? '';
      if (k === ',') return last.includes(',') ? e : `${last === '' ? `${e}0` : e},`;
      if (e === '0') return k;
      const dec = last.split(',')[1];
      if (dec !== undefined && dec.length >= 2) return e; // centimes : 2 chiffres max
      if (!dec && last.replace(',', '').length >= 6) return e; // 999 999 € au plus
      return e + k;
    });
  };

  const confirm = async () => {
    if (!cents) return false;
    if (mode === 'task') {
      if (!task) return false;
      await mutate((db) => setTaskDone(db, task.id, true, cents));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone({ cents, where: task.title });
      return true;
    }
    const draft = { amountCents: cents, label: label.trim() || cat?.name || 'Dépense', categoryId, spentAt };
    if (editId) {
      await mutate((db) => updateExpense(db, editId, draft));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      return true;
    }
    await mutate((db) => addExpense(db, draft));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDone({ cents, where: cat?.name ?? 'Dépenses' });
    return true;
  };

  // Fermeture automatique de l'écran vert : 2 s, montrées par le remplissage du bouton Continuer.
  const autoClose = useSharedValue(0);
  // Secondes restantes affichées sur le bouton (arrondi vers le bas : le compte finit à 0) ; null = pas de compte.
  const [left, setLeft] = useState<number | null>(null);
  const [btnSize, setBtnSize] = useState<{ w: number; h: number } | null>(null);
  useAnimatedReaction(
    () => (autoClose.get() > 0 && autoClose.get() < 1 ? Math.floor((1 - autoClose.get()) * (AUTO_CLOSE_MS / 1000)) : null),
    (n, prev) => {
      if (n !== prev) scheduleOnRN(setLeft, n);
    },
  );
  useEffect(() => {
    if (!done) return;
    autoClose.set(0.0001);
    autoClose.set(
      withTiming(1, { duration: AUTO_CLOSE_MS, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(router.back);
      }),
    );
    return () => cancelAnimation(autoClose);
  }, [done, autoClose]);
  const stopAutoClose = () => {
    cancelAnimation(autoClose);
    autoClose.set(0);
  };

  const reset = () => {
    setDone(null);
    setExpr('0');
    setLabel('');
    setSpentAt(nowStamp());
    setSlideKey((k) => k + 1);
  };

  const remove = () =>
    showDialog('Supprimer cette dépense ?', undefined, [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await mutate((db) => deleteExpense(db, editId!));
          router.back();
        },
      },
    ]);

  const display = expr;
  const size = display.length > 9 ? 44 : display.length > 6 ? 56 : 72;
  const day = dayOf(spentAt);
  const when = day === todayKey() ? "Aujourd'hui" : mediumDayLabel(day);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.sheet }}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.iconBtn}>
          <Icon name="x" color={colors.sheetText} />
        </Pressable>
        {editId ? (
          <AppText variant="bodyStrong" color={colors.sheetText} style={{ fontSize: 16 }}>
            Modifier la dépense
          </AppText>
        ) : (
          <View style={styles.segment} accessibilityRole="tablist">
            {(
              [
                ['expense', 'Dépense'],
                ['task', 'Tâche faite'],
              ] as const
            ).map(([m, l]) => {
              const on = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.segBtn, on && { backgroundColor: colors.sheetText }]}>
                  <AppText style={{ fontFamily: on ? fonts.bodySemiBold : fonts.body, fontSize: 14 }} color={on ? colors.text : colors.sheetTextSecondary}>
                    {l}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        )}
        {editId ? (
          <Pressable onPress={remove} accessibilityRole="button" accessibilityLabel="Supprimer la dépense" style={styles.iconBtn}>
            <Icon name="trash" size={20} color={colors.sheetText} />
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {mode === 'expense' ? (
        <ScrollView key="cats" ref={catScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
          {cats.map((c) => {
            const on = c.id === categoryId;
            return (
              <Pressable
                key={c.id}
                // À l'ouverture, la catégorie choisie est ramenée à l'écran.
                onLayout={on ? (e) => {
                  if (scrolled.current) return;
                  scrolled.current = true;
                  catScroll.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 16), animated: false });
                } : undefined}
                onPress={() => setCategoryId(c.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                <AppText style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 13 }} color={colors.sheetText}>
                  {c.name}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        // Clé distincte : sinon la rangée des tâches reprendrait le défilement de celle des catégories.
        <ScrollView key="tasks" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
          {tasks.length === 0 && (
            <AppText variant="body" color={colors.sheetTextSecondary} style={{ paddingVertical: 8 }}>
              Aucune tâche à dépense suivie en cours.
            </AppText>
          )}
          {tasks.map((t) => {
            const on = t.id === taskId;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTaskId(t.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.color }} />
                <AppText numberOfLines={1} style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 13, maxWidth: 180 }} color={colors.sheetText}>
                  {t.title}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.amountZone}>
        <AppText
          accessibilityLiveRegion="polite"
          accessibilityLabel={cents ? formatCents(cents) : 'zéro euro'}
          numberOfLines={1}
          style={[styles.amount, { fontSize: size, lineHeight: size + 4 }]}>
          {display}
          {!hasOp && <AppText style={{ fontSize: size }} color="#A1A1A7"> €</AppText>}
        </AppText>
        {hasOp ? (
          <AppText variant="body" color={colors.sheetTextSecondary} style={{ fontSize: 16 }}>
            = {formatCents(cents)}
          </AppText>
        ) : mode === 'expense' ? (
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button" accessibilityHint="Changer le jour" hitSlop={8}>
            <AppText variant="body" color={colors.sheetTextSecondary} style={{ fontSize: 16 }}>
              {when} · {cat?.name ?? 'Sans catégorie'} ›
            </AppText>
          </Pressable>
        ) : (
          <AppText variant="body" color={colors.sheetTextSecondary} style={{ fontSize: 16, textAlign: 'center' }} numberOfLines={2}>
            {task ? `Coche « ${task.title} »` : '—'}
            {task?.estimateCents != null ? `\nestimé ${formatCents(task.estimateCents)}` : ''}
          </AppText>
        )}
        {mode === 'expense' && (
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Libellé (facultatif)"
            placeholderTextColor="#A1A1A7"
            cursorColor={colors.sheetText}
            accessibilityLabel="Libellé"
            returnKeyType="done"
            style={styles.label}
          />
        )}
      </View>

      <View style={styles.ops}>
        {OPS.map((o) => (
          <Pressable
            key={o.k}
            onPress={() => press(o.k)}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            style={({ pressed }) => [styles.op, pressed && { backgroundColor: '#E4E4E7' }]}>
            <AppText style={{ fontFamily: fonts.body, fontSize: 22 }} color={colors.sheetText}>
              {o.k}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.keys}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            onLongPress={k === '⌫' ? () => setExpr('0') : undefined}
            accessibilityRole="button"
            accessibilityLabel={k === '⌫' ? 'Effacer' : k === ',' ? 'Virgule' : k}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: '#F4F4F5' }]}>
            {k === '⌫' ? (
              <Icon name="backspace" size={24} color={colors.sheetText} />
            ) : (
              <AppText style={{ fontFamily: fonts.displayLight, fontSize: 28 }} color={colors.sheetText}>
                {k}
              </AppText>
            )}
          </Pressable>
        ))}
      </View>

      <SlideToConfirm
        key={slideKey}
        disabled={!cents || (mode === 'task' && !task)}
        label={editId ? 'Glisser pour enregistrer' : 'Glisser pour valider'}
        onConfirm={confirm}
      />

      {done && (
        <Animated.View
          entering={ZoomIn.duration(300).easing(ease)}
          // Toucher l'écran (n'importe où) arrête la fermeture automatique.
          onTouchStart={stopAutoClose}
          style={styles.done}>
          <Animated.View entering={FadeIn.delay(150).duration(250)}>
            <Icon name="check" size={64} color={colors.bg} strokeWidth={2.4} />
          </Animated.View>
          <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 48, letterSpacing: -1 }} color={colors.bg}>
            {formatCents(done.cents)}
          </AppText>
          <AppText variant="bodyMedium" color={colors.bg} style={{ fontSize: 16, textAlign: 'center', paddingHorizontal: 24 }}>
            {mode === 'task' ? `« ${done.where} » cochée · ajoutée aux dépenses` : `Ajouté à ${done.where} · ${when.toLowerCase()}`}
          </AppText>
          <Pressable
            onPress={() => router.back()}
            onLayout={(e) => setBtnSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            accessibilityRole="button"
            accessibilityLabel="Continuer"
            style={styles.doneBtn}>
            {/* Bordure qui se trace autour du bouton pendant le compte à rebours ; au bout, l'écran se ferme. */}
            {btnSize && <CountdownBorder w={btnSize.w} h={btnSize.h} progress={autoClose} />}
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.text}>
              Continuer
              {left !== null && (
                <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 15 }} color={colors.textTertiary}>
                  {'  '}{left}
                </AppText>
              )}
            </AppText>
          </Pressable>
          <Pressable onPress={reset} accessibilityRole="button" hitSlop={10}>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14, textDecorationLine: 'underline' }} color={colors.bg}>
              Nouvelle dépense
            </AppText>
          </Pressable>
        </Animated.View>
      )}

      <DateTimeSheet
        visible={picking}
        title="Jour de la dépense"
        allDay
        value={{ day, start: '00:00', end: null }}
        onDone={({ day: d }) => setSpentAt(`${d}T${timeOf(spentAt)}`)}
        onClose={() => setPicking(false)}
      />
    </SafeAreaView>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const STROKE = 1;

/**
 * Contour de pilule, plein au départ, qui se vide depuis le haut à mesure que `progress`
 * va de 0 à 1. À 0 (compte arrêté), rien n'est dessiné.
 */
function CountdownBorder({ w, h, progress }: { w: number; h: number; progress: SharedValue<number> }) {
  const i = STROKE / 2; // tracé à l'intérieur du bouton
  const r = h / 2 - i;
  const d = `M ${w / 2} ${i} H ${w - h / 2} A ${r} ${r} 0 0 1 ${w - h / 2} ${h - i} H ${h / 2} A ${r} ${r} 0 0 1 ${h / 2} ${i} Z`;
  const length = 2 * (w - h) + 2 * Math.PI * r;
  const props = useAnimatedProps(() => ({
    strokeDashoffset: -length * progress.get(),
    strokeOpacity: progress.get() > 0 ? 1 : 0,
  }));
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <AnimatedPath
        d={d}
        fill="none"
        stroke={colors.textSecondary}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${length} ${length}`}
        animatedProps={props}
      />
    </Svg>
  );
}

const KNOB = 56;
const AUTO_CLOSE_MS = 2500;

/** Piste « Glisser pour valider » : lâcher au-delà de 80 % valide ; sinon le bouton revient. */
function SlideToConfirm({ disabled, label, onConfirm }: { disabled: boolean; label: string; onConfirm: () => Promise<boolean> }) {
  const x = useSharedValue(0);
  const max = useSharedValue(0);
  const hint = useSharedValue(0);

  useEffect(() => {
    hint.set(withRepeat(withSequence(withTiming(8, { duration: 800 }), withTiming(0, { duration: 800 })), -1));
  }, [hint]);

  const run = async () => {
    const ok = await onConfirm();
    if (!ok) x.set(withTiming(0, { duration: 250, easing: ease }));
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onUpdate((e) => {
      x.set(Math.min(Math.max(0, e.translationX), max.get()));
    })
    .onEnd(() => {
      if (x.get() > max.get() * 0.8) {
        x.set(withTiming(max.get(), { duration: 150 }));
        scheduleOnRN(run);
      } else {
        x.set(withTiming(0, { duration: 250, easing: ease }));
      }
    });

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const arrow = useAnimatedStyle(() => ({ transform: [{ translateX: hint.get() }] }));
  const text = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, x.get() / Math.max(max.get(), 1)) }));

  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
      <View
        onLayout={(e) => {
          max.set(e.nativeEvent.layout.width - KNOB - 8);
        }}
        style={[styles.track, disabled && { opacity: 0.5 }]}>
        <Animated.View style={[styles.trackText, text]} pointerEvents="none">
          <AppText style={{ fontFamily: fonts.bodyMedium, fontSize: 15 }} color={colors.sheetTextSecondary}>
            {label}
          </AppText>
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            accessible
            accessibilityRole="button"
            accessibilityLabel={label.replace('Glisser pour', '')}
            accessibilityState={{ disabled }}
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={() => !disabled && run()}
            style={[styles.knob, knob]}>
            <Animated.View style={arrow}>
              <Icon name="arrowRight" size={22} color={colors.text} strokeWidth={2} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: '#F4F4F5', borderRadius: 999 },
  segBtn: { height: 34, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  chip: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.sheetBorder,
    backgroundColor: colors.sheet,
  },
  chipOn: { borderWidth: 1.5, borderColor: colors.sheetText },
  amountZone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 20 },
  amount: { fontFamily: fonts.displayMedium, letterSpacing: -2, color: colors.sheetText, textAlign: 'center' },
  label: {
    minWidth: 200,
    height: 40,
    marginTop: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#F4F4F5',
    color: colors.sheetText,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
  },
  ops: { flexDirection: 'row', gap: 8, paddingHorizontal: 28, paddingBottom: 10 },
  op: { flex: 1, height: 44, borderRadius: 14, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  keys: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, paddingHorizontal: 20, paddingBottom: 14 },
  key: { width: '33.333%', height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  track: { height: 64, borderRadius: 32, backgroundColor: '#F4F4F5', overflow: 'hidden', justifyContent: 'center' },
  trackText: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingLeft: 40 },
  knob: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.sheetText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: colors.success,
  },
  doneBtn: {
    marginTop: 24,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
