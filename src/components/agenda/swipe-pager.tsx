import { useLayoutEffect, useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type Props = {
  /** Identifie la période affichée (ex. le jour). Quand il change, le nouveau contenu entre. */
  pageKey: string | undefined;
  /** Sens du dernier changement : -1 vers le passé, +1 vers le futur, 0 sinon (pas d'animation). */
  direction: -1 | 0 | 1;
  onShift: (dir: -1 | 1) => void;
  children: React.ReactNode;
};

const THRESHOLD = 60;
const VELOCITY = 500;
const SHIFT = 36; // amplitude de la transition, en px
const FOLLOW_MAX = 16; // le contenu ne suit le doigt que de quelques pixels
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * Balayage d'une période à l'autre sans carrousel (vue Jour) :
 * le contenu glisse légèrement avec le doigt, sort de 36 px en s'effaçant (120 ms),
 * puis le nouveau jour entre depuis l'autre côté (200 ms).
 */
export function SwipePager({ pageKey, direction, onShift, children }: Props) {
  const tx = useSharedValue(0);
  const op = useSharedValue(1);
  const shown = useRef(pageKey);

  // Entrée du nouveau contenu quand la période change.
  useLayoutEffect(() => {
    if (pageKey === undefined || pageKey === shown.current) return;
    shown.current = pageKey;
    if (direction === 0) {
      tx.set(0);
      op.set(1);
      return;
    }
    tx.set(direction * SHIFT);
    op.set(0);
    tx.set(withTiming(0, { duration: 200, easing: ease }));
    op.set(withTiming(1, { duration: 200, easing: ease }));
  }, [pageKey, direction, tx, op]);

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      tx.set(Math.max(-FOLLOW_MAX, Math.min(FOLLOW_MAX, e.translationX * 0.15)));
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > THRESHOLD || Math.abs(e.velocityX) > VELOCITY) {
        const dir = e.translationX < 0 ? 1 : -1;
        tx.set(withTiming(-dir * SHIFT, { duration: 120, easing: ease }));
        op.set(withTiming(0, { duration: 120, easing: ease }, (finished) => {
          if (finished) scheduleOnRN(onShift, dir);
        }));
      } else {
        tx.set(withTiming(0, { duration: 180, easing: ease }));
      }
    });

  const style = useAnimatedStyle(() => ({ opacity: op.get(), transform: [{ translateX: tx.get() }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
