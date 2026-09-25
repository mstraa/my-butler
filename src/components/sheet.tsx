import { router, useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
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
 * `inline` : feuille posée par-dessus l'écran courant (sans route) ; `onClosed` est alors appelé à la fin.
 */
export function Sheet({
  children, label, inline, onClosed, draggable = true, style,
}: {
  children: (close: CloseSheet) => React.ReactNode;
  label?: string;
  inline?: boolean;
  onClosed?: () => void;
  /** Glisser la feuille vers le bas pour fermer (à couper si elle contient une liste qui défile). */
  draggable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const p = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(600);
  const closing = useSharedValue(false);

  useEffect(() => {
    p.set(withTiming(1, { duration: 280, easing: ease }));
  }, [p]);

  const close: CloseSheet = (then = onClosed ?? (() => router.back())) => {
    if (closing.get()) return;
    closing.set(true);
    p.set(
      withTiming(0, { duration: 200, easing: easeIn }, (finished) => {
        if (finished) scheduleOnRN(then);
      }),
    );
  };

  const navigation = useNavigation();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Un écran ouvert par-dessus (ex. l'édition) gère son propre retour.
      if (!navigation.isFocused()) return false;
      close();
      return true;
    });
    return () => sub.remove();
  });

  const pan = Gesture.Pan()
    .enabled(draggable)
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
    <View style={inline ? styles.inline : { flex: 1 }}>
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
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }, style, sheetStyle]}>
          <View style={styles.grabber} />
          {children(close)}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: { flex: 1, backgroundColor: colors.veil },
  inline: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10 },
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
