import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { colors, withAlpha } from '@/theme/tokens';

export const REORDER_ROW_H = 60;

export type ReorderItem = { id: number; title: string; subtitle?: string; icon: IconName; color: string };

type Positions = Record<string, number>;

const positionsOf = (items: ReorderItem[]): Positions => Object.fromEntries(items.map((it, i) => [String(it.id), i]));

/** Déplace l'élément de la place `from` à la place `to` ; les autres glissent d'un cran. */
function move(pos: Positions, from: number, to: number): Positions {
  'worklet';
  const next: Positions = {};
  for (const k in pos) {
    const p = pos[k];
    if (p === from) next[k] = to;
    else if (from < to && p > from && p <= to) next[k] = p - 1;
    else if (from > to && p < from && p >= to) next[k] = p + 1;
    else next[k] = p;
  }
  return next;
}

/**
 * Liste réordonnable : on attrape une ligne par sa poignée et on la fait glisser.
 * `onReorder` reçoit les ids dans le nouvel ordre, au lâcher.
 * Au lecteur d'écran, chaque ligne propose « Monter » et « Descendre ».
 */
export function ReorderList({ items, onReorder }: { items: ReorderItem[]; onReorder: (ids: number[]) => void }) {
  const positions = useSharedValue<Positions>(positionsOf(items));
  const orderKey = items.map((it) => it.id).join(',');
  useEffect(() => {
    positions.set(positionsOf(items));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seul l'ordre des ids compte
  }, [orderKey]);

  const commit = (pos: Positions) => {
    const ids = Object.keys(pos).sort((a, b) => pos[a] - pos[b]).map(Number);
    if (ids.join(',') !== orderKey) onReorder(ids);
  };
  const step = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= items.length) return;
    commit(move(positionsOf(items), index, to));
  };

  return (
    <View style={{ height: items.length * REORDER_ROW_H }}>
      {items.map((it, i) => (
        <Row
          key={it.id}
          item={it}
          index={i}
          count={items.length}
          positions={positions}
          onDrop={commit}
          onStep={(dir) => step(i, dir)}
        />
      ))}
    </View>
  );
}

function Row({
  item, index, count, positions, onDrop, onStep,
}: {
  item: ReorderItem;
  index: number;
  count: number;
  positions: SharedValue<Positions>;
  onDrop: (pos: Positions) => void;
  onStep: (dir: -1 | 1) => void;
}) {
  const key = String(item.id);
  const top = useSharedValue(index * REORDER_ROW_H);
  const start = useSharedValue(0);
  const dragging = useSharedValue(false);

  // Les autres lignes glissent vers leur nouvelle place pendant qu'on déplace celle-ci.
  useAnimatedReaction(
    () => positions.get()[key],
    (p, prev) => {
      if (p !== undefined && p !== prev && !dragging.get()) top.set(withTiming(p * REORDER_ROW_H, { duration: 180 }));
    },
  );

  const pickUp = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const swapped = () => Haptics.selectionAsync();

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      dragging.set(true);
      start.set(top.get());
      scheduleOnRN(pickUp);
    })
    .onUpdate((e) => {
      const y = Math.max(-REORDER_ROW_H * 0.3, Math.min((count - 0.7) * REORDER_ROW_H, start.get() + e.translationY));
      top.set(y);
      const from = positions.get()[key];
      const to = Math.max(0, Math.min(count - 1, Math.round(y / REORDER_ROW_H)));
      if (to !== from) {
        positions.set(move(positions.get(), from, to));
        scheduleOnRN(swapped);
      }
    })
    .onFinalize(() => {
      if (!dragging.get()) return;
      dragging.set(false);
      top.set(withTiming(positions.get()[key] * REORDER_ROW_H, { duration: 180 }));
      scheduleOnRN(onDrop, positions.get());
    });

  const style = useAnimatedStyle(() => ({
    top: top.get(),
    zIndex: dragging.get() ? 10 : 0,
    backgroundColor: dragging.get() ? colors.row : colors.surfaceRaised,
    transform: [{ scale: withTiming(dragging.get() ? 1.03 : 1, { duration: 150 }) }],
  }));

  return (
    <Animated.View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={`${item.title}, position ${index + 1} sur ${count}`}
      accessibilityActions={[
        ...(index > 0 ? [{ name: 'moveUp', label: 'Monter' }] : []),
        ...(index < count - 1 ? [{ name: 'moveDown', label: 'Descendre' }] : []),
      ]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'moveUp' ? -1 : 1)}>
      <View style={[styles.icon, { backgroundColor: withAlpha(item.color, 0.13) }]}>
        <Icon name={item.icon} size={16} color={item.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
          {item.title}
        </AppText>
        {!!item.subtitle && (
          <AppText variant="caption" numberOfLines={1}>
            {item.subtitle}
          </AppText>
        )}
      </View>
      <GestureDetector gesture={pan}>
        <View style={styles.handle} hitSlop={8}>
          <Icon name="grip" size={20} color={colors.textTertiary} strokeWidth={2.4} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: REORDER_ROW_H - 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 52, height: '100%', alignItems: 'center', justifyContent: 'center' },
});
