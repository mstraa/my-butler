import * as Haptics from 'expo-haptics';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/*
 * Boîte de dialogue aux couleurs de l'app, à la place des alertes Android.
 * Même usage que Alert.alert : showDialog(titre, message, boutons).
 * <DialogHost /> est posé une fois à la racine (au-dessus de tous les écrans).
 */

export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};
type Dialog = { id: number; title: string; message?: string; buttons: DialogButton[] };

const ERROR = '#FF6B6B';
let queue: Dialog[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showDialog(title: string, message?: string, buttons: DialogButton[] = [{ text: 'OK' }]) {
  queue = [...queue, { id: nextId++, title, message, buttons }];
  emit();
}

function shift() {
  queue = queue.slice(1);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function DialogHost() {
  const current = useSyncExternalStore(subscribe, () => queue[0] ?? null);
  if (!current) return null;
  return <DialogView key={current.id} dialog={current} />;
}

const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

function DialogView({ dialog }: { dialog: Dialog }) {
  const p = useSharedValue(0);
  const [closing, setClosing] = useState(false);
  const cancel = dialog.buttons.find((b) => b.style === 'cancel') ?? (dialog.buttons.length === 1 ? dialog.buttons[0] : null);

  useEffect(() => {
    if (dialog.buttons.some((b) => b.style === 'destructive') || dialog.buttons.length === 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    p.set(withTiming(1, { duration: 200, easing: ease }));
  }, [p, dialog]);

  const close = (b: DialogButton | null) => {
    if (closing) return;
    setClosing(true);
    p.set(
      withTiming(0, { duration: 140 }, (finished) => {
        if (!finished) return;
        scheduleOnRN(shift);
        if (b?.onPress) scheduleOnRN(b.onPress);
      }),
    );
  };

  // Retour Android : comme « Annuler » s'il y en a un, sinon ignoré.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cancel) close(cancel);
      return true;
    });
    return () => sub.remove();
  });

  const veilStyle = useAnimatedStyle(() => ({ opacity: p.get() }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: [{ scale: 0.96 + 0.04 * p.get() }, { translateY: (1 - p.get()) * 8 }],
  }));

  const vertical = dialog.buttons.length > 2;
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
        <Pressable
          accessibilityLabel="Fermer"
          onPress={() => cancel && close(cancel)}
          style={{ flex: 1, backgroundColor: colors.veil }}
        />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]} accessibilityRole="alert">
          <AppText style={styles.title}>{dialog.title}</AppText>
          {!!dialog.message && (
            <AppText variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>
              {dialog.message}
            </AppText>
          )}
          <View style={[styles.buttons, vertical && { flexDirection: 'column' }]}>
            {dialog.buttons.map((b, i) => {
              const primary = !b.style || b.style === 'default';
              return (
                <Pressable
                  key={i}
                  onPress={() => close(b)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.btn,
                    !vertical && { flex: 1 },
                    b.style === 'cancel' && styles.btnGhost,
                    b.style === 'destructive' && styles.btnDanger,
                    primary && styles.btnPrimary,
                    pressed && { opacity: 0.8 },
                  ]}>
                  <AppText
                    style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }}
                    color={b.style === 'destructive' ? ERROR : primary ? colors.onLight : '#D4D4D8'}>
                    {b.text}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 400,
    gap: 10,
    padding: 22,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
  },
  title: { fontFamily: fonts.displayMedium, fontSize: 21, lineHeight: 26, color: colors.text },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnGhost: { backgroundColor: '#232327' },
  btnDanger: { backgroundColor: withAlpha(ERROR, 0.14) },
  btnPrimary: { backgroundColor: colors.text },
});
