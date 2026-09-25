import { useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  SlideInLeft,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

type Props = {
  /** Identifie la période affichée : quand il change, la nouvelle page entre en glissant. */
  pageKey: string | undefined;
  /** Sens du dernier changement : -1 vers le passé, +1 vers le futur, 0 sinon. */
  direction: -1 | 0 | 1;
  onShift: (dir: -1 | 1) => void;
  children: React.ReactNode;
};

const THRESHOLD = 70;
const VELOCITY = 600;

/**
 * Balayage gauche/droite pour changer de période (Jour, Semaine, Mois).
 * Le geste ne prend la main qu'au-delà de 20 px à l'horizontale, pour laisser
 * défiler verticalement les listes à l'intérieur.
 */
export function SwipePager({ pageKey, direction, onShift, children }: Props) {
  const { width } = useWindowDimensions();
  const tx = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      tx.value = e.translationX * 0.5;
    })
    .onEnd((e) => {
      const go = Math.abs(e.translationX) > THRESHOLD || Math.abs(e.velocityX) > VELOCITY;
      if (go) {
        tx.value = 0;
        scheduleOnRN(onShift, e.translationX < 0 ? 1 : -1);
      } else {
        tx.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    opacity: 1 - Math.min(Math.abs(tx.value) / width, 0.35),
  }));

  const entering =
    direction === 1
      ? SlideInRight.springify().damping(24).stiffness(240)
      : direction === -1
        ? SlideInLeft.springify().damping(24).stiffness(240)
        : FadeIn.duration(200);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style]}>
        <Animated.View key={pageKey ?? 'loading'} entering={entering} style={{ flex: 1 }}>
          {children}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
