import { router } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/theme/tokens';

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const easeIn = Easing.bezier(0.4, 0, 1, 1);

export type CloseSheet = (then?: () => void) => void;

/**
 * Feuille qui monte du bas sur un voile (écran « transparentModal ») :
 * montée 280 ms, fermeture 200 ms (voile, retour Android, glisser vers le bas).
 * `children` reçoit `close(then?)` : referme la feuille puis quitte l'écran, ou lance `then`.
 */
export function Sheet({ children, label }: { children: (close: CloseSheet) => React.ReactNode; label?: string }) {
  const insets = useSafeAreaInsets();
  const p = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(600);
  const closing = useSharedValue(false);

  useEffect(() => {
    p.set(withTiming(1, { duration: 280, easing: ease }));
  }, [p]);

  const close: CloseSheet = (then = () => router.back()) => {
    if (closing.get()) return;
    closing.set(true);
    p.set(
      withTiming(0, { duration: 200, easing: easeIn }, (finished) => {
        if (finished) scheduleOnRN(then);
      }),
    );
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  });

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-16, 16])
    .onUpdate((e) => {
      drag.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (drag.get() > height.get() * 0.25 || e.velocityY > 800) {
        scheduleOnRN(close);
      } else {
        drag.set(withTiming(0, { duration: 200, easing: ease }));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - p.get()) * height.get() + drag.get() }],
  }));
  const veilStyle = useAnimatedStyle(() => ({
    opacity: p.get() * (1 - Math.min(drag.get() / Math.max(height.get(), 1), 1)),
  }));

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
        <Pressable accessibilityLabel="Fermer" onPress={() => close()} style={styles.veil} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          onLayout={(e) => {
            height.set(e.nativeEvent.layout.height);
          }}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }, sheetStyle]}>
          <View style={styles.grabber} />
          {children(close)}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: { flex: 1, backgroundColor: colors.veil },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '92%',
    gap: 14,
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A40' },
});
