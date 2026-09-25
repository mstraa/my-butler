import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, type LayoutChangeEvent, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { DeadlineSection, NoteField } from '@/components/event-parts';
import { Icon, type IconName } from '@/components/icon';
import { duplicateEvent, type EventRecord, getCategories, getEvent, restoreEvent } from '@/db/events';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dayOf } from '@/lib/dates';
import {
  categoryOf, deadlineLabel, durationLabel, longDate, occurrenceOf, recurrenceLabel, reminderLabel, timeRange,
} from '@/lib/event-format';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/*
 * Rendez-vous en feuille, deux états :
 * - Aperçu (maquette HF-RdvPreview) : hauteur du contenu, boutons Fermer / Éditer en bas ;
 * - Détail (maquette HF-RdvDetail) : on tire la feuille vers le haut, elle prend tout l'écran ;
 *   les boutons restent collés en bas et se transforment (Fermer → Reporter, Éditer → Dupliquer)
 *   pendant qu'« Annuler le rendez-vous » se déplie dessous.
 * Depuis le détail : tirer un peu vers le bas → aperçu ; beaucoup → tout se ferme.
 */
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const easeIn = Easing.bezier(0.4, 0, 1, 1);
const FLING = 700;

type Mode = 'preview' | 'detail' | 'close';

export default function EventSheet() {
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const FULL = winH - insets.top - 8; // hauteur de la feuille ouverte en grand
  const BTN_BLOCK = 14 + 52 + Math.max(insets.bottom, 12) + 12; // zone des boutons de l'aperçu
  const EXTRA = 10 + 52; // ligne « Annuler » ajoutée en détail
  const mutate = useDbMutation();
  const [detail, setDetail] = useState(false);

  const { data } = useDbQuery(async (db) => {
    const [event, categories] = await Promise.all([getEvent(db, Number(id)), getCategories(db)]);
    return { event, categories };
  }, `${id}|${day}`);

  const ty = useSharedValue(FULL); // décalage vers le bas de la feuille (FULL = cachée)
  const previewH = useSharedValue(0); // hauteur visible en aperçu
  const start = useSharedValue(0);
  const inDetail = useSharedValue(false);
  const ignore = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const closing = useSharedValue(false);

  const goBack = () => router.back();
  const setMode = (d: boolean) => setDetail(d);

  const goto = (mode: Mode) => {
    'worklet';
    if (closing.get()) return;
    const target = mode === 'detail' ? 0 : mode === 'preview' ? FULL - previewH.get() : FULL;
    if (mode === 'close') closing.set(true);
    inDetail.set(mode === 'detail');
    scheduleOnRN(setMode, mode === 'detail');
    ty.set(
      withTiming(target, { duration: mode === 'close' ? 200 : 300, easing: mode === 'close' ? easeIn : ease }, (finished) => {
        if (finished && mode === 'close') scheduleOnRN(goBack);
      }),
    );
  };

  // Retour d'Android : détail → aperçu → fermé.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goto(inDetail.get() ? 'preview' : 'close');
      return true;
    });
    return () => sub.remove();
  });

  /** Hauteur de l'aperçu = haut de la feuille (jusqu'aux infos) + zone des boutons. */
  const onTopLayout = (e: LayoutChangeEvent) => {
    const h = Math.min(FULL * 0.85, e.nativeEvent.layout.height + BTN_BLOCK);
    const first = previewH.get() === 0;
    previewH.set(h);
    if (inDetail.get() || closing.get()) return;
    ty.set(withTiming(FULL - h, { duration: first ? 280 : 200, easing: ease }));
  };

  const native = Gesture.Native();
  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-16, 16])
    .simultaneousWithExternalGesture(native)
    .onBegin(() => {
      start.set(ty.get());
      // En détail, si le contenu est défilé, le geste sert au défilement.
      ignore.set(inDetail.get() && scrollY.get() > 2);
    })
    .onUpdate((e) => {
      if (ignore.get() || closing.get()) return;
      const next = start.get() + e.translationY;
      ty.set(next < 0 ? next * 0.15 : next); // léger ressort au-dessus du plein écran
    })
    .onEnd((e) => {
      if (ignore.get() || closing.get()) return;
      const P = FULL - previewH.get();
      const y = ty.get();
      const wasDetail = inDetail.get();
      if (e.velocityY < -FLING) return goto('detail');
      if (e.velocityY > FLING) return goto(wasDetail && y < P ? 'preview' : 'close');
      if (y < P / 2) return goto('detail');
      if (y < P + previewH.get() * 0.35) return goto('preview');
      goto('close');
    });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.set(e.contentOffset.y);
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(0, ty.get()) }] }));
  const veilStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ty.get(), [FULL - Math.max(previewH.get(), 1), FULL], [1, 0], 'clamp'),
  }));
  // 0 en aperçu → 1 en détail.
  const progress = useDerivedValue(() => {
    const P = Math.max(FULL - previewH.get(), 1);
    return interpolate(ty.get(), [0, P], [1, 0], 'clamp');
  });
  // Pied collé en bas de l'écran ; il ne descend qu'avec la feuille quand on la ferme.
  const footerStyle = useAnimatedStyle(() => {
    const t = Math.max(0, ty.get());
    return { transform: [{ translateY: -Math.min(t, FULL - previewH.get()) }] };
  });
  const extraStyle = useAnimatedStyle(() => ({
    height: progress.get() * EXTRA,
    opacity: interpolate(progress.get(), [0.4, 1], [0, 1], 'clamp'),
  }));
  const leftStyle = useAnimatedStyle(() => ({ flex: 1 }));
  const rightStyle = useAnimatedStyle(() => ({
    flex: interpolate(progress.get(), [0, 1], [1.4, 1]),
    backgroundColor: interpolateColor(progress.get(), [0.15, 0.85], [colors.text, '#232327']),
  }));

  const e = data?.event;

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
        <Pressable accessibilityLabel="Fermer" onPress={() => goto('close')} style={{ flex: 1, backgroundColor: colors.veil }} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View accessibilityViewIsModal style={[styles.sheet, { height: FULL }, sheetStyle]}>
          <GestureDetector gesture={native}>
            <Animated.ScrollView
              onScroll={onScroll}
              scrollEventThrottle={16}
              scrollEnabled={detail}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: BTN_BLOCK + EXTRA + 12 }}>
              <View onLayout={onTopLayout} style={{ gap: 14, paddingTop: 10 }}>
                <View style={styles.grabber} />
                {data && !e && <AppText variant="title">Rendez-vous introuvable</AppText>}
                {e && <PreviewTop e={e} day={day} categories={data!.categories} onClose={() => goto('close')} />}
              </View>

              {e && (
                <View style={{ gap: 14, paddingTop: 14 }} pointerEvents={detail ? 'auto' : 'none'}>
                  {e.deadline && <DeadlineSection event={e} />}
                  {e.source === 'google' && <GoogleNote />}
                  <NoteField event={e} />
                </View>
              )}
            </Animated.ScrollView>
          </GestureDetector>

          {/* Pied : Fermer / Éditer en aperçu, qui se transforment en Reporter / Dupliquer + Annuler en détail. */}
          {e && (
            <Animated.View
              style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }, footerStyle]}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Animated.View style={[styles.btn, styles.btnGhost, leftStyle]}>
                  <Pressable
                    onPress={() => {
                      if (!detail) return goto('close');
                      router.push({ pathname: '/rdv/modifier/[id]', params: { id: String(e.id) } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={detail ? 'Reporter' : 'Fermer'}
                    style={styles.btnPress}>
                    <MorphLabel p={progress} from={{ label: 'Fermer', color: '#D4D4D8' }} to={{ label: 'Reporter', icon: 'arrowRight', color: '#D4D4D8' }} />
                  </Pressable>
                </Animated.View>
                <Animated.View style={[styles.btn, rightStyle]}>
                  <Pressable
                    onPress={async () => {
                      if (!detail) return router.push({ pathname: '/rdv/modifier/[id]', params: { id: String(e.id) } });
                      const copy = await mutate((db) => duplicateEvent(db, e.id));
                      if (copy) router.push({ pathname: '/rdv/modifier/[id]', params: { id: String(copy) } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={detail ? 'Dupliquer' : 'Éditer'}
                    style={styles.btnPress}>
                    <MorphLabel
                      p={progress}
                      from={{ label: 'Éditer', icon: 'edit', color: colors.onLight }}
                      to={{ label: 'Dupliquer', icon: 'copy', color: '#D4D4D8' }}
                    />
                  </Pressable>
                </Animated.View>
              </View>

              <Animated.View style={[{ overflow: 'hidden', justifyContent: 'flex-end' }, extraStyle]} pointerEvents={detail ? 'auto' : 'none'}>
                {e.cancelledAt ? (
                  <Pressable
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      mutate((db) => restoreEvent(db, e.id));
                    }}
                    accessibilityRole="button"
                    style={styles.primary}>
                    <Icon name="undo" size={18} color={colors.onLight} />
                    <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
                      Rétablir le rendez-vous
                    </AppText>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => router.push({ pathname: '/rdv/annuler/[id]', params: { id: String(e.id) } })}
                    accessibilityRole="button"
                    style={styles.primary}>
                    <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
                      Annuler le rendez-vous
                    </AppText>
                  </Pressable>
                )}
              </Animated.View>
            </Animated.View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

type LabelSpec = { label: string; icon?: IconName; color: string };

/** Libellé qui roule de `from` (p = 0) vers `to` (p = 1) : l'ancien monte et s'efface, le nouveau arrive d'en dessous. */
function MorphLabel({ p, from, to }: { p: SharedValue<number>; from: LabelSpec; to: LabelSpec }) {
  const outStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.5], [1, 0], 'clamp'),
    transform: [{ translateY: interpolate(p.get(), [0, 0.5], [0, -12], 'clamp') }],
  }));
  const inStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0.5, 1], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(p.get(), [0.5, 1], [12, 0], 'clamp') }],
  }));
  const layer = (l: LabelSpec, style: typeof outStyle) => (
    <Animated.View style={[StyleSheet.absoluteFill, styles.labelLayer, style]}>
      {l.icon && <Icon name={l.icon} size={16} color={l.color} />}
      <AppText variant="bodyStrong" color={l.color} style={{ fontSize: 15 }}>
        {l.label}
      </AppText>
    </Animated.View>
  );
  return (
    <>
      {layer(from, outStyle)}
      {layer(to, inStyle)}
    </>
  );
}

/** Haut de la feuille, commun à l'aperçu et au détail. */
function PreviewTop({
  e, day, categories, onClose,
}: {
  e: EventRecord;
  day?: string;
  categories: Parameters<typeof categoryOf>[1];
  onClose: () => void;
}) {
  const cat = categoryOf(e, categories);
  const { start, end } = occurrenceOf(e, day || undefined);
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
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.closeBtn}>
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
              Annulé · « {e.cancelReason || 'sans motif'} »{e.cancelMode === 'hide' ? ' · masqué de l’agenda' : ''}
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
    </>
  );
}

function GoogleNote() {
  return (
    <View style={styles.googleNote}>
      <View style={styles.googleBadge}>
        <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 14 }}>G</AppText>
      </View>
      <AppText variant="caption" color={colors.textSecondary} style={{ flex: 1, lineHeight: 17 }}>
        <AppText variant="caption" color={colors.text} style={{ fontFamily: fonts.bodySemiBold }}>
          Importé de Google Agenda.
        </AppText>{' '}
        Titre et horaires viennent de Google ; catégorie, notes et annulation restent dans l&apos;app.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A40' },
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
  googleNote: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 18,
  },
  googleBadge: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceRaised,
  },
  btn: { height: 52, borderRadius: 999, overflow: 'hidden' },
  btnPress: { flex: 1 },
  labelLayer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnGhost: { backgroundColor: '#232327' },
  primary: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
});
