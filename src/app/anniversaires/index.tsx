import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { BackHeader, Screen } from '@/components/screen';
import { type BirthdaySummary, colorOf, listBirthdays, untilLabel } from '@/db/birthdays';
import { useDbQuery } from '@/db/use-query';
import { mediumDayLabel, monthName } from '@/lib/dates';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

/** Liste des anniversaires : le prochain en grand, puis les suivants par mois (maquette HF-Anniversaires). */
export default function BirthdaysScreen() {
  const insets = useSafeAreaInsets();
  const { data } = useDbQuery((db) => listBirthdays(db), '', { cacheId: 'anniversaires' });
  const [first, ...rest] = data ?? [];

  // Regroupe par mois de la prochaine occurrence (dans l'ordre chronologique).
  const months: { key: string; label: string; items: BirthdaySummary[] }[] = [];
  for (const b of rest) {
    const key = b.next.slice(0, 7);
    let m = months.find((x) => x.key === key);
    if (!m) months.push((m = { key, label: monthName(b.next), items: [] }));
    m.items.push(b);
  }

  const open = (b: BirthdaySummary) => router.push({ pathname: '/anniversaires/[id]', params: { id: String(b.id) } });

  return (
    <Screen>
      <BackHeader title="Anniversaires" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 110 }]}>
        {data && data.length === 0 && (
          <View style={styles.empty}>
            <View style={[styles.cake, { width: 44, height: 44, borderRadius: 14 }]}>
              <Icon name="cake" size={22} color={categoryColors.birthday} />
            </View>
            <AppText variant="title">Aucun anniversaire</AppText>
            <AppText variant="body" color={colors.textTertiary} style={{ textAlign: 'center' }}>
              Ajoute ceux de tes proches : rappels, idées cadeaux et ce que tu as déjà offert.
            </AppText>
          </View>
        )}

        {first && <NextCard b={first} onPress={() => open(first)} />}

        {months.map((m, mi) => (
          <Animated.View key={m.key} entering={FadeInDown.delay(40 + Math.min(mi, 6) * 30).duration(260)} style={{ gap: 8 }}>
            <AppText style={styles.month}>{m.label}</AppText>
            <View style={styles.group}>
              {m.items.map((b, i) => (
                <Pressable
                  key={b.id}
                  onPress={() => open(b)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { backgroundColor: colors.row }]}>
                  <AppText style={styles.day}>{String(Number(b.next.slice(8, 10))).padStart(2, '0')}</AppText>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15, flexShrink: 1 }}>
                        {b.name}
                        <AppText variant="body" color={colors.textTertiary} style={{ fontSize: 15 }}>
                          {b.age !== null ? ` · ${b.age} ans` : ' · année inconnue'}
                        </AppText>
                      </AppText>
                      <View style={[styles.dot, { backgroundColor: colorOf(b) }]} />
                    </View>
                    <AppText variant="caption" numberOfLines={1}>
                      {subline(b)}
                    </AppText>
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.textSecondary} />
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/anniversaires/nouveau')}
        accessibilityRole="button"
        accessibilityLabel="Ajouter un anniversaire"
        style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 20 }, pressed && { transform: [{ scale: 0.95 }] }]}>
        <Icon name="plus" size={24} color={colors.onLight} strokeWidth={2} />
      </Pressable>
    </Screen>
  );
}

/** « dans 8 j · Potes · 3 idées · 3 cadeaux déjà offerts » */
function subline(b: BirthdaySummary) {
  const parts = [untilLabel(b.inDays)];
  if (b.category) parts.push(b.category.name);
  if (b.trackGifts) parts.push(b.ideas ? `${b.ideas} idée${b.ideas > 1 ? 's' : ''}` : 'aucune idée');
  if (b.given) parts.push(`${b.given} cadeau${b.given > 1 ? 'x' : ''} déjà offert${b.given > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function NextCard({ b, onPress }: { b: BirthdaySummary; onPress: () => void }) {
  const c = colorOf(b);
  const when = b.inDays === 0 ? "Aujourd'hui" : b.inDays === 1 ? 'Demain' : `Dans ${b.inDays} j`;
  return (
    <Animated.View entering={FadeInDown.duration(260)}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Prochain anniversaire : ${b.name}, ${when.toLowerCase()}`} style={styles.next}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.cake}>
            <Icon name="cake" size={16} color={categoryColors.birthday} />
          </View>
          <AppText style={styles.when}>{when}</AppText>
          <AppText variant="caption" color={colors.textSecondary} style={{ fontSize: 13 }}>
            · {mediumDayLabel(b.next)}
          </AppText>
        </View>

        <View style={styles.nextMain}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8, flexShrink: 1 }}>
            <View style={[styles.avatar, { backgroundColor: withAlpha(c, 0.13) }]}>
              <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 20 }} color={c}>
                {b.name.trim().charAt(0).toUpperCase()}
              </AppText>
            </View>
            <View style={{ flexShrink: 1 }}>
              <AppText numberOfLines={1} style={styles.nextName}>
                {b.name}
              </AppText>
              <AppText variant="caption" style={{ fontSize: 13 }}>
                {b.age !== null ? 'fête ses' : b.category?.name ?? 'anniversaire'}
              </AppText>
            </View>
          </View>
          {b.age !== null && (
            <AppText style={styles.age}>
              {b.age}
              <AppText style={styles.ageUnit}> ans</AppText>
            </AppText>
          )}
        </View>

        <View style={{ gap: 6, marginTop: 14 }}>
          {b.trackGifts && (
            <Animated.View entering={FadeInRight.delay(80).duration(220)} style={styles.line}>
              <AppText variant="caption" style={styles.lineLabel}>
                Cadeau
              </AppText>
              <AppText variant="bodyMedium" numberOfLines={1} style={{ flex: 1, fontSize: 14 }} color={b.gift ? colors.text : colors.textTertiary}>
                {b.gift?.title ?? 'aucune idée'}
              </AppText>
              {b.gift?.given && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="check" size={14} color={colors.success} strokeWidth={2.4} />
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={colors.success}>
                    offert
                  </AppText>
                </View>
              )}
            </Animated.View>
          )}
          <Animated.View entering={FadeInRight.delay(110).duration(220)} style={styles.line}>
            <AppText variant="caption" style={styles.lineLabel}>
              Rappels
            </AppText>
            <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
              {([['J-7', b.remindD7], ['J-1', b.remindD1]] as const).map(([label, on]) =>
                on ? (
                  <View key={label} style={styles.remChip}>
                    <AppText style={{ fontFamily: fonts.bodyMedium, fontSize: 12 }} color={colors.textSecondary}>
                      {label}
                    </AppText>
                    <Icon name="check" size={11} color={colors.success} strokeWidth={3} />
                  </View>
                ) : null,
              )}
              {b.remindD0 && (
                <View style={[styles.remChip, { backgroundColor: colors.text }]}>
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={colors.onLight}>
                    le jour <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 12 }} color={colors.onLight}>{b.remindTime}</AppText>
                  </AppText>
                </View>
              )}
              {!b.remindD7 && !b.remindD1 && !b.remindD0 && (
                <AppText variant="caption">aucun</AppText>
              )}
            </View>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 2, gap: 10 },
  next: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  cake: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: withAlpha(categoryColors.birthday, 0.13),
    alignItems: 'center',
    justifyContent: 'center',
  },
  when: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', color: categoryColors.birthday },
  nextMain: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4, gap: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  nextName: { fontFamily: fonts.displayMedium, fontSize: 30, lineHeight: 34, color: colors.text },
  age: { fontFamily: fonts.displayThin, fontSize: 88, lineHeight: 88, letterSpacing: -3, color: colors.text },
  ageUnit: { fontFamily: fonts.displayLight, fontSize: 20, letterSpacing: 0, color: colors.textTertiary },
  line: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, backgroundColor: colors.row, borderRadius: 14 },
  lineLabel: { width: 62 },
  remChip: { height: 24, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors.surfaceRaised },
  month: { marginTop: 6, marginHorizontal: 4, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.textTertiary },
  group: { paddingHorizontal: 4, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border, borderRadius: 0 },
  day: { width: 48, fontFamily: fonts.displayLight, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: colors.text },
  dot: { width: 7, height: 7, borderRadius: 4 },
  fab: {
    position: 'absolute',
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
