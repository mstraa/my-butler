import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { WeekNav } from '@/components/meal-parts';
import { BackHeader, Screen } from '@/components/screen';
import { clearShoppingChecks, getShoppingList, setShoppingCheck, type ShoppingLine } from '@/db/meals';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { type DayKey, todayKey, weekRangeLabel, weekStart } from '@/lib/dates';
import { fmtNum, portionsText } from '@/lib/meal-format';
import { colors, fonts } from '@/theme/tokens';

/** Contenants à acheter pour les repas d'une semaine, à cocher en faisant les courses. */
export default function ShoppingScreen() {
  const p = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState<DayKey>(p.day && /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : todayKey());
  const week = weekStart(day);
  const mutate = useDbMutation();
  const { data: lines, loadedKey } = useDbQuery((db) => getShoppingList(db, week), week, { cacheId: 'courses' });
  const list = loadedKey === week ? lines : undefined;
  const todo = (list ?? []).filter((l) => !l.checked);
  const done = (list ?? []).filter((l) => l.checked);

  const toggle = async (l: ShoppingLine) => {
    Haptics.selectionAsync();
    await mutate((db) => setShoppingCheck(db, week, l.food.id, !l.checked));
  };

  const share = () => {
    const text = [`Courses · semaine du ${weekRangeLabel(week)}`, ...todo.map((l) => `• ${lineTitle(l)}`)].join('\n');
    Share.share({ message: text });
  };

  return (
    <Screen>
      <BackHeader
        title="Courses"
        right={
          todo.length > 0 ? (
            <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Partager la liste" style={styles.iconBtn}>
              <Icon name="external" size={20} />
            </Pressable>
          ) : null
        }
      />
      <View style={{ paddingHorizontal: 16 }}>
        <WeekNav day={day} onChange={setDay} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {list && list.length > 0 && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.summary}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.big} accessibilityLiveRegion="polite">
                {done.length}
                <AppText style={styles.bigUnit}> / {list.length}</AppText>
              </AppText>
              <AppText variant="caption">{todo.length ? 'dans le panier' : 'Tout est dans le panier'}</AppText>
            </View>
            {done.length > 0 && (
              <Pressable
                onPress={() => mutate((db) => clearShoppingChecks(db, week))}
                accessibilityRole="button"
                style={({ pressed }) => [styles.ghostBtn, pressed && { backgroundColor: colors.row }]}>
                <Icon name="undo" size={14} strokeWidth={2} />
                <AppText variant="label">Tout décocher</AppText>
              </Pressable>
            )}
          </Animated.View>
        )}

        {todo.map((l) => (
          <Line key={l.food.id} l={l} onPress={() => toggle(l)} />
        ))}
        {done.length > 0 && (
          <AppText variant="overline" style={{ marginTop: 10, paddingHorizontal: 4 }}>
            Dans le panier
          </AppText>
        )}
        {done.map((l) => (
          <Line key={l.food.id} l={l} onPress={() => toggle(l)} />
        ))}

        {list && list.length === 0 && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
            <Icon name="cart" size={28} color={colors.textMuted} strokeWidth={1.6} />
            <AppText variant="bodyStrong" color={colors.textSecondary}>
              Rien à acheter
            </AppText>
            <AppText variant="caption" style={{ textAlign: 'center', fontSize: 13 }}>
              La liste se remplit avec les aliments prévus dans les repas de la semaine.
            </AppText>
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}

/** « 3 × sachet 1 kg de Riz basmati » ou « Riz basmati · 4 portions ». */
function lineTitle(l: ShoppingLine) {
  if (l.containers === null) return `${l.food.name} · ${portionsText(l.portions)}`;
  return `${l.containers} × ${l.food.containerLabel || 'contenant'} · ${l.food.name}`;
}

function Line({ l, onPress }: { l: ShoppingLine; onPress: () => void }) {
  const sub =
    l.containers === null
      ? l.food.containerLabel
        ? `${l.food.containerLabel} · portions par contenant non renseignées`
        : 'Contenant non renseigné'
      : `${portionsText(l.portions)} prévue${l.portions >= 2 ? 's' : ''}` +
        (l.spare > 0.001 ? ` · il restera ${fmtNum(l.spare, 2)} portion${l.spare >= 2 ? 's' : ''}` : '');
  return (
    <Animated.View layout={LinearTransition.duration(220)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: l.checked }}
        accessibilityLabel={lineTitle(l)}
        style={({ pressed }) => [styles.line, pressed && { backgroundColor: colors.row }, l.checked && { opacity: 0.55 }]}>
        <View style={[styles.box, l.checked && styles.boxOn]}>
          {l.checked && <Icon name="check" size={16} color={colors.onLight} strokeWidth={2.6} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={[{ fontSize: 15 }, l.checked && styles.struck]}>
            {l.food.name}
          </AppText>
          <AppText variant="caption" numberOfLines={2}>
            {sub}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end', maxWidth: '40%' }}>
          <AppText style={styles.qty}>{l.containers ?? fmtNum(l.portions, 2)}</AppText>
          <AppText variant="caption" numberOfLines={1} style={{ fontSize: 11 }}>
            {l.containers === null ? `portion${l.portions >= 2 ? 's' : ''}` : l.food.containerLabel || `contenant${l.containers > 1 ? 's' : ''}`}
          </AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginBottom: 4, borderRadius: 24,
    backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
  },
  big: { fontFamily: fonts.displayLight, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, color: colors.text },
  bigUnit: { fontSize: 18, color: colors.textMuted },
  ghostBtn: {
    height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 14,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed,
  },
  line: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
  },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.borderDashed, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.success, borderColor: colors.success },
  struck: { textDecorationLine: 'line-through' },
  qty: { fontFamily: fonts.displayMedium, fontSize: 22, lineHeight: 26, color: colors.text },
  empty: {
    alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 24, marginTop: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: 22,
  },
});
