import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { Icon, type IconName } from '@/components/icon';
import { type CloseSheet, Sheet } from '@/components/sheet';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { getWish, OLD_DAYS, setWishState, type Wish, type WishState } from '@/db/wishes';
import { hostOf } from '@/lib/link-preview';
import { euros, LEVELS, shortDate, sinceLabel, SOURCES } from '@/lib/wish-format';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

/** Aperçu d'une envie : image, prix, lien ; « Je l'ai achetée » ou « Abandonner » en bas. */
export default function WishPreviewSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mutate = useDbMutation();
  const { data: w } = useDbQuery((db) => getWish(db, Number(id)), id);

  const change = async (close: CloseSheet, state: WishState, expense = false) => {
    if (!w) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await mutate((db) => setWishState(db, w.id, state, expense));
    close();
  };

  const buy = (close: CloseSheet) => {
    if (!w) return;
    if (w.priceCents === null) return change(close, 'bought');
    showDialog('Ajouter aux dépenses ?', `${euros(w.priceCents)} € « ${w.title} » dans les dépenses d'aujourd'hui.`, [
      { text: 'Non', style: 'cancel', onPress: () => change(close, 'bought') },
      { text: 'Ajouter', onPress: () => change(close, 'bought', true) },
    ]);
  };

  return (
    <Sheet label="Envie">
      {(close) =>
        w === undefined ? (
          <View style={{ height: 360 }} />
        ) : !w ? (
          <AppText variant="title">Envie introuvable</AppText>
        ) : (
          <>
            <View style={styles.topRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <LevelChip w={w} />
                <AppText variant="caption">Envie d&apos;achat</AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/envie/modifier/[id]', params: { id: String(w.id) } })}
                  accessibilityRole="button"
                  accessibilityLabel="Modifier"
                  style={styles.roundBtn}>
                  <Icon name="edit" size={16} color={colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => close()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.roundBtn}>
                  <Icon name="x" size={16} color={colors.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            {w.imageUri && (
              <View style={styles.image}>
                <Image source={{ uri: w.imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
              </View>
            )}

            <View style={{ gap: 2, paddingHorizontal: 4 }}>
              <AppText
                accessibilityRole="header"
                style={[styles.title, w.state === 'abandoned' && { color: colors.textTertiary, textDecorationLine: 'line-through' }]}>
                {w.title}
              </AppText>
              <AppText style={styles.price} color={w.priceCents === null ? colors.textMuted : colors.text}>
                {w.priceCents === null ? 'Prix inconnu' : euros(w.priceCents)}
                {w.priceCents !== null && <AppText style={styles.priceUnit}> €</AppText>}
              </AppText>
            </View>

            <Infos w={w} />

            {w.state === 'waiting' ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => change(close, 'abandoned')}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.btn, styles.btnGhost, { flex: 1 }, pressed && { opacity: 0.85 }]}>
                  <AppText variant="bodyStrong" color="#D4D4D8" style={{ fontSize: 15 }}>
                    Abandonner
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => buy(close)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.btn, styles.btnLight, { flex: 1.4 }, pressed && { opacity: 0.85 }]}>
                  <Icon name="check" size={18} color={colors.onLight} strokeWidth={2.2} />
                  <AppText variant="bodyStrong" color={colors.onLight} style={{ fontSize: 15 }}>
                    Je l&apos;ai achetée
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => change(close, 'waiting')}
                accessibilityRole="button"
                accessibilityHint={w.expenseId !== null ? 'La dépense créée à l’achat est retirée' : undefined}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && { opacity: 0.85 }]}>
                <Icon name="undo" size={18} color="#D4D4D8" />
                <AppText variant="bodyStrong" color="#D4D4D8" style={{ fontSize: 15 }}>
                  Remettre en attente
                </AppText>
              </Pressable>
            )}
          </>
        )
      }
    </Sheet>
  );
}

function LevelChip({ w }: { w: Wish }) {
  const level = LEVELS.find((l) => l.value === w.level) ?? LEVELS[1];
  const c = categoryColors.family;
  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(c, 0.15) }]}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: level.dots }, (_, i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
        ))}
      </View>
      <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={c}>
        {level.label}
      </AppText>
    </View>
  );
}

function Infos({ w }: { w: Wish }) {
  type Info = { icon: IconName; label: string; value: string; color?: string; onPress?: () => void };
  const old = w.state === 'waiting' && w.days >= OLD_DAYS;
  const all: (Info | null)[] = [
    {
      icon: 'clock',
      label: 'Dans la liste',
      value: sinceLabel(w.createdAt, w.days),
      color: old ? colors.late : undefined,
    },
    w.state !== 'waiting' && w.stateAt
      ? {
          icon: w.state === 'bought' ? 'check' : 'x',
          label: w.state === 'bought' ? 'Achetée' : 'Abandonnée',
          value: `le ${shortDate(w.stateAt)}${w.expenseId !== null ? ' · ajoutée aux dépenses' : ''}`,
          color: w.state === 'bought' ? colors.success : undefined,
        }
      : null,
    w.url
      ? {
          icon: 'link',
          label: 'Lien',
          value: hostOf(w.url),
          onPress: () => WebBrowser.openBrowserAsync(w.url),
        }
      : null,
    w.source && w.source !== 'lien' ? { icon: SOURCES[w.source].icon, label: 'Image', value: w.source === 'photo' ? 'Photo' : 'Capture' } : null,
  ];
  const infos = all.filter((i): i is Info => i !== null);
  return (
    <View style={styles.infos}>
      {infos.map((it, i) => {
        const body = (
          <>
            <View style={[styles.infoIcon, { backgroundColor: withAlpha(it.color ?? colors.textSecondary, 0.12) }]}>
              <Icon name={it.icon} size={15} color={it.color ?? colors.textSecondary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="caption" style={{ fontSize: 11 }}>
                {it.label}
              </AppText>
              <AppText variant="bodyMedium" numberOfLines={1} color={it.color ?? colors.text} style={{ fontSize: 14 }}>
                {it.value}
              </AppText>
            </View>
            {it.onPress && <Icon name="external" size={16} color={colors.textTertiary} />}
          </>
        );
        return it.onPress ? (
          <Pressable
            key={it.label}
            onPress={it.onPress}
            accessibilityRole="link"
            accessibilityLabel={`Ouvrir ${it.value}`}
            style={({ pressed }) => [styles.infoRow, i > 0 && styles.infoBorder, pressed && { backgroundColor: colors.row }]}>
            {body}
          </Pressable>
        ) : (
          <View key={it.label} style={[styles.infoRow, i > 0 && styles.infoBorder]}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingLeft: 10, paddingRight: 12, borderRadius: 999 },
  roundBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  image: { height: 190, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.row },
  title: { fontFamily: fonts.displayLight, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: colors.text },
  price: { fontFamily: fonts.displayThin, fontSize: 40, lineHeight: 46, letterSpacing: -1 },
  priceUnit: { fontFamily: fonts.displayLight, fontSize: 22, color: colors.textMuted },
  infos: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.row, borderRadius: 20, overflow: 'hidden' },
  infoRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 14 },
  infoBorder: { borderTopWidth: 1, borderTopColor: colors.row },
  infoIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnLight: { backgroundColor: colors.text },
  btnGhost: { backgroundColor: '#232327' },
});
