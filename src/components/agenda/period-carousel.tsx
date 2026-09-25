import { useImperativeHandle, useLayoutEffect, useState, type Ref } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export type CarouselHandle = {
  /** Glisse vers la période précédente (-1) ou suivante (+1), comme un balayage. */
  slide: (dir: -1 | 1) => void;
};

type Props = {
  /** Index absolu de la période affichée (semaine ou mois depuis 1970). */
  index: number;
  /** Rendu d'une page à partir de son index absolu. */
  renderPage: (index: number) => React.ReactNode;
  /** Appelé quand la page voisine est posée : le parent avance sa période. */
  onShift: (dir: -1 | 1) => void;
  ref?: Ref<CarouselHandle>;
};

const COMMIT_RATIO = 0.4; // au-delà de 40 % de la largeur, on passe à la page voisine
const FLING = 800; // px/s : un geste rapide suffit, même plus court
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * Carrousel de périodes qui suit le doigt : la page d'avant et celle d'après sont déjà
 * affichées de chaque côté. Les pages sont placées à une position absolue (index × largeur),
 * si bien qu'une fois la page voisine posée, rien n'a besoin d'être recalé : pas de saut.
 */
export function PeriodCarousel({ index, renderPage, onShift, ref }: Props) {
  const [width, setWidth] = useState(0);
  const [base] = useState(index); // origine des positions, pour garder de petites valeurs
  const pos = useSharedValue(0); // translation du ruban de pages
  const start = useSharedValue(0);
  const busy = useSharedValue(false);

  const commit = (dir: -1 | 1) => onShift(dir);

  const slideTo = (dir: -1 | 1, w: number, from: number) => {
    'worklet';
    busy.set(true);
    pos.set(withTiming(
      from - dir * w,
      { duration: 240, easing: ease },
      (finished) => {
        busy.set(false);
        if (finished) scheduleOnRN(commit, dir);
      },
    ));
  };

  // Changement d'index qui ne vient pas d'un glissement : page voisine (ex. passer de dimanche
  // à lundi avec les flèches du jour) → on glisse ; saut plus grand (« Aujourd'hui ») → on se recale.
  useLayoutEffect(() => {
    if (!width || busy.get()) return;
    const target = -(index - base) * width;
    const gap = Math.abs(pos.get() - target);
    if (gap < 1) return;
    pos.set(gap <= width + 1 ? withTiming(target, { duration: 240, easing: ease }) : target);
  }, [index, width, base, pos, busy]);

  useImperativeHandle(ref, () => ({
    slide: (dir) => {
      if (!width || busy.get()) return;
      slideTo(dir, width, -(index - base) * width);
    },
  }));

  const rest = -(index - base) * width;
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      start.set(pos.get());
    })
    .onUpdate((e) => {
      if (busy.get()) return;
      pos.set(start.get() + e.translationX);
    })
    .onEnd((e) => {
      if (busy.get() || !width) return;
      const dx = pos.get() - rest;
      const fling = Math.abs(e.velocityX) > FLING && Math.sign(e.velocityX) === Math.sign(dx);
      if (Math.abs(dx) > width * COMMIT_RATIO || fling) {
        slideTo(dx < 0 ? 1 : -1, width, rest);
      } else {
        pos.set(withTiming(rest, { duration: 200, easing: ease }));
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: pos.get() }] }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) {
      setWidth(w);
      pos.set(-(index - base) * w);
    }
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1, overflow: 'hidden' }} onLayout={onLayout}>
        {width > 0 && (
          <Animated.View style={[{ flex: 1 }, style]}>
            {[index - 1, index, index + 1].map((i) => (
              <View
                key={i}
                style={{ position: 'absolute', top: 0, bottom: 0, left: (i - base) * width, width }}
                importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
                accessibilityElementsHidden={i !== index}>
                {renderPage(i)}
              </View>
            ))}
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}
