import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type Props = {
  /** Identifie la période affichée : quand il change, la nouvelle page apparaît. */
  pageKey: string | undefined;
  /** Sens du dernier changement : -1 vers le passé, +1 vers le futur, 0 sinon. */
  direction: -1 | 0 | 1;
  onShift: (dir: -1 | 1) => void;
  children: React.ReactNode;
};

const THRESHOLD = 60;
const VELOCITY = 500;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/* Entrée discrète : 12 px de glissement + fondu, 160 ms. Rien ne suit le doigt. */
const fromRight = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 12 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }], easing: ease },
}).duration(160);
const fromLeft = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: -12 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }], easing: ease },
}).duration(160);

/**
 * Balayage gauche/droite pour changer de période (Jour, Semaine, Mois).
 * Le geste ne prend la main qu'au-delà de 20 px à l'horizontale, pour laisser
 * défiler verticalement les listes à l'intérieur.
 */
export function SwipePager({ pageKey, direction, onShift, children }: Props) {
  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > THRESHOLD || Math.abs(e.velocityX) > VELOCITY) {
        scheduleOnRN(onShift, e.translationX < 0 ? 1 : -1);
      }
    });

  const entering = direction === 1 ? fromRight : direction === -1 ? fromLeft : undefined;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View key={pageKey} entering={pageKey ? entering : undefined} style={{ flex: 1 }}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
