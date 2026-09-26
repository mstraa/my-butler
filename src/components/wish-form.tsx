import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { FieldLabel, TextField } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import { formatEuros, parseEuros } from '@/db/tasks';
import type { WishDraft } from '@/db/wishes';
import { dayOf, nowStamp, parseDay, type Stamp } from '@/lib/dates';
import { extractUrl, fetchLinkPreview } from '@/lib/link-preview';
import { LEVELS } from '@/lib/wish-format';
import { pickWishImage } from '@/lib/wish-image';
import { colors, fonts } from '@/theme/tokens';

type Props = {
  title: string;
  initial: WishDraft;
  /** Date d'entrée dans la liste (modification) ; absente : aujourd'hui, automatiquement. */
  createdAt?: Stamp;
  onSave: (d: WishDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
};

/** Formulaire « Nouvelle envie » / « Modifier l'envie » (maquette HF-NouvelleEnvie). */
export function WishForm({ title, initial, createdAt, onSave, onDelete }: Props) {
  const [d, setD] = useState<WishDraft>(initial);
  const [priceText, setPriceText] = useState(initial.priceCents !== null ? formatEuros(initial.priceCents) : '');
  const [loading, setLoading] = useState(false);
  // Lien déjà lu (ex. arrivé par un partage) : pas de nouvelle lecture.
  const [lookedUp, setLookedUp] = useState<string | null>(initial.url || null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  // Valeurs saisies à la main : l'aperçu du lien ne les écrase pas.
  const touched = useRef({ title: !!initial.title, price: initial.priceCents !== null });
  const set = (patch: Partial<WishDraft>) => setD((c) => ({ ...c, ...patch }));

  const priceCents = priceText.trim() ? parseEuros(priceText) : null;
  const titleError = !d.title.trim() ? "Donne un nom à l'envie." : null;
  const priceError = priceText.trim() && priceCents === null ? 'Prix illisible.' : null;

  /** Lit le lien (nom, prix, image) et remplit ce qui est encore vide. */
  const lookup = async (raw: string) => {
    const url = extractUrl(raw);
    if (!url || url === lookedUp) return;
    setLookedUp(url);
    setLoading(true);
    const p = await fetchLinkPreview(url);
    setLoading(false);
    setD((c) => ({
      ...c,
      title: !touched.current.title && p.title ? p.title : c.title,
      imageUri: c.imageUri ?? p.imageUrl,
      source: c.imageUri ? c.source : p.imageUrl ? 'lien' : c.source ?? 'lien',
    }));
    if (!touched.current.price && p.priceCents !== null) setPriceText(formatEuros(p.priceCents));
    if (p.title || p.priceCents !== null || p.imageUrl) Haptics.selectionAsync();
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    const url = extractUrl(text);
    if (!url) {
      showDialog('Aucun lien copié', 'Copie le lien de la page (bouton Partager → Copier), puis réessaie.');
      return;
    }
    set({ url });
    lookup(url);
  };

  const pick = async (from: 'camera' | 'library') => {
    const res = await pickWishImage(from);
    if (res === 'denied') {
      showDialog(
        from === 'camera' ? "Pas d'accès à l'appareil photo" : 'Pas d’accès aux photos',
        "Autorise l'accès dans les réglages du téléphone pour ajouter une image.",
      );
      return;
    }
    if (res) set({ imageUri: res.uri, source: res.source });
  };

  const save = async () => {
    if (titleError || priceError) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...d, title: d.title.trim(), url: d.url.trim(), priceCents });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setSaving(false);
      showDialog("Impossible d'enregistrer", e instanceof Error ? e.message : String(e));
    }
  };

  const entered = parseDay(dayOf(createdAt ?? nowStamp()));
  const enteredText = `${String(entered.getDate()).padStart(2, '0')}/${String(entered.getMonth() + 1).padStart(2, '0')}/${entered.getFullYear()}`;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.iconBtn}>
          <Icon name="x" />
        </Pressable>
        <AppText variant="display" numberOfLines={1} style={{ flex: 1, fontSize: 24 }}>
          {title}
        </AppText>
        <Pressable
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.7 }]}>
          <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.onLight}>
            Enregistrer
          </AppText>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Animated.View entering={FadeInDown.duration(300)} style={[styles.imageBox, d.imageUri && styles.imageBoxFull]}>
            {d.imageUri ? (
              <>
                <Image source={{ uri: d.imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                <Pressable
                  onPress={() => set({ imageUri: null, source: d.url ? 'lien' : null })}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer l'image"
                  style={styles.removeImage}>
                  <Icon name="x" size={16} strokeWidth={2.2} />
                </Pressable>
              </>
            ) : (
              <>
                <Icon name="image" size={32} color={colors.textTertiary} strokeWidth={1.6} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <ImageButton icon="camera" label="Photo" onPress={() => pick('camera')} />
                  <ImageButton icon="phone" label="Capture / galerie" onPress={() => pick('library')} />
                </View>
              </>
            )}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(300)} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Lien"
                  value={d.url}
                  onChangeText={(url) => set({ url })}
                  onEndEditing={() => lookup(d.url)}
                  placeholder="https://…"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <Pressable onPress={paste} accessibilityRole="button" style={({ pressed }) => [styles.pasteBtn, pressed && { backgroundColor: colors.row }]}>
                <Icon name="clipboard" size={16} strokeWidth={1.8} />
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }}>Coller</AppText>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 18 }}>
              {loading && <ActivityIndicator size="small" color={colors.textTertiary} />}
              <AppText variant="caption">
                {loading ? 'Lecture de la page…' : "Nom, prix et image récupérés depuis le lien quand c'est possible"}
              </AppText>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(300)} style={{ gap: 6 }}>
            <TextField
              label="Nom"
              value={d.title}
              onChangeText={(t) => {
                touched.current.title = true;
                set({ title: t });
              }}
              placeholder="Ex. Casque audio"
              autoFocus={!initial.title && !initial.url}
            />
            {showErrors && titleError && <ErrorText>{titleError}</ErrorText>}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(300)} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <TextField
                label="Prix"
                value={priceText}
                onChangeText={(t) => {
                  touched.current.price = true;
                  setPriceText(t.replace(/[^\d,.\s]/g, ''));
                }}
                keyboardType="decimal-pad"
                placeholder="0,00 €"
                style={{ fontFamily: fonts.displayMedium, fontSize: 18 }}
              />
              {showErrors && priceError && <ErrorText>{priceError}</ErrorText>}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <FieldLabel>Date d&apos;entrée</FieldLabel>
              <View style={styles.dateBox}>
                <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 18 }}>{enteredText}</AppText>
                {!createdAt && (
                  <View style={styles.autoPill}>
                    <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 11 }} color={colors.textSecondary}>
                      auto
                    </AppText>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(300)} style={{ gap: 8 }}>
            <FieldLabel>Niveau d&apos;envie</FieldLabel>
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
              {LEVELS.map((l) => {
                const on = d.level === l.value;
                return (
                  <Pressable
                    key={l.value}
                    onPress={() => {
                      Haptics.selectionAsync();
                      set({ level: l.value });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[styles.level, on && styles.levelOn]}>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      {Array.from({ length: l.dots }, (_, i) => (
                        <View key={i} style={[styles.dot, { backgroundColor: on ? colors.onLight : colors.textTertiary }]} />
                      ))}
                    </View>
                    <AppText style={{ fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 14 }} color={on ? colors.onLight : '#D4D4D8'}>
                      {l.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {onDelete && (
            <Animated.View entering={FadeIn.delay(300).duration(300)}>
              <Pressable
                onPress={() =>
                  showDialog('Supprimer cette envie ?', "Elle disparaît de la liste, quel que soit son état.", [
                    { text: 'Garder', style: 'cancel' },
                    {
                      text: 'Supprimer',
                      style: 'destructive',
                      onPress: async () => {
                        await onDelete();
                        router.back();
                      },
                    },
                  ])
                }
                accessibilityRole="button"
                style={styles.ghostBtn}>
                <Icon name="trash" size={16} color={colors.textSecondary} />
                <AppText variant="label" color={colors.textSecondary}>
                  Supprimer
                </AppText>
              </Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ImageButton({ icon, label, onPress }: { icon: 'camera' | 'phone'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.imageBtn, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={16} color="#D4D4D8" strokeWidth={1.8} />
      <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color="#D4D4D8">
        {label}
      </AppText>
    </Pressable>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="caption" color="#FF6B6B" accessibilityLiveRegion="polite">
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4, paddingRight: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { height: 40, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 16 },
  imageBox: {
    height: 160, alignItems: 'center', justifyContent: 'center', gap: 14, overflow: 'hidden',
    borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderDashed, backgroundColor: colors.surface,
  },
  imageBoxFull: { height: 200, borderStyle: 'solid', borderColor: colors.border },
  removeImage: {
    position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,14,16,0.8)',
  },
  imageBtn: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 16, borderRadius: 999, backgroundColor: '#232327' },
  pasteBtn: {
    height: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 16,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed,
  },
  dateBox: {
    height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14, paddingRight: 12,
    borderRadius: 14, borderWidth: 1, borderColor: colors.row, backgroundColor: colors.surface,
  },
  autoPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#232327' },
  level: {
    flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed,
  },
  levelOn: { backgroundColor: colors.text, borderColor: colors.text },
  dot: { width: 6, height: 6, borderRadius: 3 },
  ghostBtn: {
    height: 48, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderDashed,
  },
});
