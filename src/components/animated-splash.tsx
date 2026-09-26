import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

/*
 * Splash animé (icône de l'app, assets/icon.svg) : sur fond noir, l'icône se dessine —
 * le cercle se trace dans le sens de la flèche, la flèche apparaît, la tige pousse, les feuilles
 * s'ouvrent — puis l'écran s'efface sur l'app. Le splash natif est noir et vide (image
 * transparente), donc le passage de l'un à l'autre ne se voit pas.
 */

const SIZE = 160;
const VB = 1024;
const px = (v: number) => (v / VB) * SIZE;

// Tracés de assets/icon.svg (viewBox 1024).
const RING = 'M 790.2 399.6 A 300 300 0 1 1 634.0 237.9';
const RING_LEN = 1655; // 300 × 316° en radians
const ARROW = 'M 596.2 313.0 L 725.4 278.6 L 664.5 159.6 Z';
const STEM = 'M 512 690 L 512 540';
const STEM_LEN = 150;
const LEAF_L = 'M 508 552 C 424 556 352 500 346 404 C 440 400 506 458 508 552 Z';
const LEAF_R = 'M 516 552 C 520 458 586 400 680 404 C 674 500 602 556 516 552 Z';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const ring = useSharedValue(0);
  const arrow = useSharedValue(0);
  const stem = useSharedValue(0);
  const leaves = useSharedValue(0);
  const out = useSharedValue(0);

  useEffect(() => {
    ring.set(withTiming(1, { duration: 700, easing: inOut }));
    arrow.set(withDelay(560, withTiming(1, { duration: 260, easing: Easing.out(Easing.back(2.2)) })));
    stem.set(withDelay(420, withTiming(1, { duration: 300, easing: ease })));
    leaves.set(withDelay(680, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.8)) })));
    out.set(
      withDelay(1350, withTiming(1, { duration: 320, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) scheduleOnRN(onDone);
      })),
    );
    // Filet de sécurité : si l'animation est interrompue (app en arrière-plan, menu de dev…),
    // le splash ne doit jamais rester affiché.
    const safety = setTimeout(onDone, 3000);
    return () => clearTimeout(safety);
  }, [ring, arrow, stem, leaves, out, onDone]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_LEN * (1 - ring.get()) }));
  const stemProps = useAnimatedProps(() => ({ strokeDashoffset: STEM_LEN * (1 - stem.get()) }));
  const arrowStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, arrow.get() * 2), transform: [{ scale: 0.3 + 0.7 * arrow.get() }] }));
  const leavesStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, leaves.get() * 3), transform: [{ scale: leaves.get() }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.12 * out.get() }] }));
  const screenStyle = useAnimatedStyle(() => ({ opacity: 1 - out.get() }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.screen, screenStyle]} accessibilityElementsHidden>
      <Animated.View style={[{ width: SIZE, height: SIZE }, iconStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${VB} ${VB}`} style={StyleSheet.absoluteFill}>
          <AnimatedPath
            d={RING}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={64}
            strokeLinecap="round"
            strokeDasharray={`${RING_LEN} ${RING_LEN}`}
            animatedProps={ringProps}
          />
          <AnimatedPath
            d={STEM}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={56}
            strokeLinecap="round"
            strokeDasharray={`${STEM_LEN} ${STEM_LEN}`}
            animatedProps={stemProps}
          />
        </Svg>
        {/* Flèche et feuilles : calques à part, qui grandissent depuis leur point d'attache. Origine en
            tableau de nombres : la forme texte « 98.4px » est mal lue par RN (décimales ignorées). */}
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: [px(630), px(236), 0] }, arrowStyle]}>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${VB} ${VB}`}>
            <Path d={ARROW} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={24} strokeLinejoin="round" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: [px(512), px(552), 0] }, leavesStyle]}>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${VB} ${VB}`}>
            <Path d={LEAF_L} fill="#FFFFFF" />
            <Path d={LEAF_R} fill="#FFFFFF" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', zIndex: 100, elevation: 100 },
});
