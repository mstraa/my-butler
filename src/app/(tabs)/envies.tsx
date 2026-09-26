import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { useTabBarSpace } from '@/components/tab-bar';
import { listWishes, OLD_DAYS, type Wish, type WishSort, type WishState } from '@/db/wishes';
import { useDbQuery } from '@/db/use-query';
import { euros, SOURCES, STATES, sinceLabel, stateWord } from '@/lib/wish-format';
import { colors, fonts } from '@/theme/tokens';

const GAP = 10;
const PAD = 16;

/** Onglet Envies : les envies d'achat en grille, filtrées par état (maquette HF-Envies). */
export default function EnviesScreen() {
  const bottom = useTabBarSpace();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<WishState>('waiting');
  const [sort, setSort] = useState<WishSort>('age');
  const { data: wishes } = useDbQuery((db) => listWishes(db, state, sort), `${state}:${sort}`, { cacheId: 'envies' });

  const cardW = (width - PAD * 2 - GAP) / 2;
  const total = (wishes ?? []).reduce((a, w) => a + (w.priceCents ?? 0), 0);
  const n = wishes?.length ?? 0;

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(300)} style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="display" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36, letterSpacing: -0.6 }}>
            Envies d&apos;achat
          </AppText>
          <Pressable
            onPress={() => router.push('/envie/nouvelle')}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle envie"
            style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}>
            <View style={styles.newIcon}>
              <Icon name="plus" size={14} color={colors.text} strokeWidth={2.6} />
            </View>
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
              Envie
            </AppText>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }} accessibilityLiveRegion="polite">
          <AppText variant="body" color={colors.textSecondary}>
            {n} {stateWord(state, n)} · total
          </AppText>
          <AppText style={styles.total}>
            {euros(total)}
            <AppText style={styles.totalUnit}> €</AppText>
          </AppText>
        </View>
      </Animated.View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
          {STATES.map((s) => {
            const on = s.value === state;
            return (
              <Pressable
                key={s.value}
                onPress={() => setState(s.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}>
                <AppText style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 13 }} color={on ? colors.onLight : '#D4D4D8'}>
                  {s.label}
                </AppText>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setSort((v) => (v === 'price' ? 'age' : 'price'))}
            accessibilityRole="button"
            accessibilityHint="Changer le tri"
            style={[styles.chip, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <Icon name="sort" size={14} color="#D4D4D8" strokeWidth={2} />
            <AppText style={{ fontFamily: fonts.bodyMedium, fontSize: 13 }} color="#D4D4D8">
              {sort === 'price' ? 'Tri : prix' : 'Tri : ancienneté'}
            </AppText>
          </Pressable>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={[styles.grid, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}>
        {wishes?.map((w, i) => (
          <WishCard key={`${state}-${w.id}`} w={w} width={cardW} index={i} />
        ))}
        {wishes && n === 0 && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
            <Icon name="heart" size={28} color={colors.textMuted} strokeWidth={1.6} />
            <AppText variant="bodyStrong" color={colors.textSecondary}>
              {STATES.find((s) => s.value === state)!.empty}
            </AppText>
            <AppText variant="caption" style={{ textAlign: 'center', fontSize: 13 }}>
              Une envie qui tient plus de {OLD_DAYS} jours mérite peut-être d&apos;être achetée.
            </AppText>
          </Animated.View>
        )}
      </ScrollView>
    </Screen>
  );
}

function WishCard({ w, width, index }: { w: Wish; width: number; index: number }) {
  const source = w.source ? SOURCES[w.source] : null;
  const old = w.state === 'waiting' && w.days >= OLD_DAYS;
  const open = () => router.push({ pathname: '/envie/[id]', params: { id: String(w.id) } });
  return (
    <Animated.View entering={FadeInDown.delay(60 + Math.min(index, 8) * 50).duration(380)} style={{ width }}>
      <Pressable
        onPress={open}
        onLongPress={() => router.push({ pathname: '/envie/modifier/[id]', params: { id: String(w.id) } })}
        accessibilityRole="button"
        accessibilityLabel={`${w.title}${w.priceCents !== null ? `, ${euros(w.priceCents)} €` : ''}, ${sinceLabel(w.createdAt, w.days)}`}
        style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.97 }] }]}>
        <View style={styles.thumb}>
          {w.imageUri ? (
            <Image source={{ uri: w.imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Icon name="image" size={30} color="#4A4A50" strokeWidth={1.6} />
          )}
          {source && (
            <View style={[styles.badge, { left: 8 }]}>
              <Icon name={source.icon} size={12} color={colors.text} strokeWidth={2} />
              <AppText style={styles.badgeText}>{source.label}</AppText>
            </View>
          )}
          {old && (
            <View style={[styles.badge, styles.oldBadge]}>
              <AppText style={[styles.badgeText, { fontFamily: fonts.bodyBold }]} color={colors.late}>
                {OLD_DAYS} j+
              </AppText>
            </View>
          )}
        </View>
        <View style={{ gap: 2, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 }}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>
            {w.title}
          </AppText>
          <AppText style={styles.price} color={w.priceCents === null ? colors.textMuted : colors.text}>
            {w.priceCents === null ? '—' : euros(w.priceCents)}
            {w.priceCents !== null && <AppText style={styles.priceUnit}> €</AppText>}
          </AppText>
          <AppText variant="caption" numberOfLines={1} style={{ fontSize: 11 }}>
            {sinceLabel(w.createdAt, w.days)}
          </AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  titleRow: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newBtn: {
    height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 16,
    borderRadius: 999, backgroundColor: colors.text,
  },
  newIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.onLight, alignItems: 'center', justifyContent: 'center' },
  total: { fontFamily: fonts.displayLight, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: colors.text },
  totalUnit: { fontSize: 18, color: colors.textMuted },
  chips: { gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: PAD },
  card: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: 'hidden' },
  thumb: { height: 88, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingLeft: 6, paddingRight: 8, borderRadius: 999, backgroundColor: 'rgba(14,14,16,0.8)',
  },
  oldBadge: { right: 8, paddingLeft: 8, backgroundColor: 'rgba(28,22,12,0.9)', borderWidth: 1, borderColor: 'rgba(255,181,71,0.4)' },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.text },
  price: { fontFamily: fonts.displayLight, fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },
  priceUnit: { fontSize: 15, color: colors.textMuted },
  empty: {
    width: '100%', alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 24,
    backgroundColor: colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: 22,
  },
});
