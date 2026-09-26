import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { type CloseSheet, Sheet } from '@/components/sheet';
import { formatEuros, getTask, parseEuros, setTaskDone } from '@/db/tasks';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

/** Cocher une tâche dont la dépense est suivie : on demande le montant réel. */
export default function FinishTaskSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mutate = useDbMutation();
  const { data: task } = useDbQuery((db) => getTask(db, Number(id)), id);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(false);

  const finish = async (close: CloseSheet, withAmount: boolean) => {
    if (!task) return;
    const cents = withAmount ? parseEuros(amount) : null;
    if (withAmount && cents === null) {
      setError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await mutate((db) => setTaskDone(db, task.id, true, cents));
    close();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Sheet label="Tâche faite">
        {(close) =>
          !task ? (
            <View style={{ height: 240 }} />
          ) : (
            <>
              <View style={{ gap: 4 }}>
                <AppText variant="display" style={{ fontFamily: fonts.displayMedium, fontSize: 24 }} numberOfLines={2}>
                  {task.title}
                </AppText>
                <AppText variant="caption" color={colors.textSecondary} style={{ fontSize: 13 }}>
                  C&apos;est fait ! Combien ça a coûté ?
                </AppText>
              </View>

              <View style={styles.amountRow}>
                <View style={styles.icon}>
                  <Icon name="wallet" size={18} color={categoryColors.groceries} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={amount}
                    onChangeText={(t) => {
                      setAmount(t);
                      setError(false);
                    }}
                    autoFocus
                    keyboardType="decimal-pad"
                    placeholder={task.estimateCents !== null ? `estimé ${formatEuros(task.estimateCents)}` : '0'}
                    placeholderTextColor={colors.textTertiary}
                    cursorColor={colors.text}
                    accessibilityLabel="Montant réel en euros"
                    returnKeyType="done"
                    onSubmitEditing={() => finish(close, true)}
                    style={[styles.input, error && { borderColor: '#FF6B6B' }]}
                  />
                  <AppText style={styles.euro} color={colors.textTertiary}>
                    €
                  </AppText>
                </View>
              </View>
              {error && (
                <AppText variant="caption" color="#FF6B6B" accessibilityLiveRegion="polite">
                  Indique un montant, ou choisis « Sans montant ».
                </AppText>
              )}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => finish(close, false)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.btn, styles.ghost, pressed && { opacity: 0.8 }]}>
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color="#D4D4D8">
                    Sans montant
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => finish(close, true)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.btn, styles.primary, pressed && { opacity: 0.85 }]}>
                  <Icon name="check" size={18} color={colors.onLight} strokeWidth={2.2} />
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
                    C&apos;est fait
                  </AppText>
                </Pressable>
              </View>
            </>
          )
        }
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(categoryColors.groceries, 0.13),
  },
  input: {
    height: 56,
    paddingLeft: 16,
    paddingRight: 36,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 22,
  },
  euro: { position: 'absolute', right: 16, top: 15, fontFamily: fonts.displayMedium, fontSize: 20 },
  btn: { flex: 1, height: 50, flexDirection: 'row', gap: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: '#232327' },
  primary: { backgroundColor: colors.text },
});
