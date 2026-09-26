import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { TextField } from '@/components/form/fields';
import { Icon } from '@/components/icon';
import { BackHeader, Screen } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import {
  addGiven, addIdea, buyBefore, type BirthdayDetail, colorOf, deleteGiven, deleteIdea, getBirthday, type GiftGiven,
  type GiftIdea, remindersLabel, setIdeaGiven, untilLabel, updateGiven, updateIdea,
} from '@/db/birthdays';
import { formatEuros, parseEuros } from '@/db/tasks';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { dayOf, mediumDayLabel, parseDay, todayKey } from '@/lib/dates';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

type Editing =
  | { kind: 'idea'; idea: GiftIdea }
  | { kind: 'given'; given: GiftGiven | null };

/** Fiche d'un anniversaire : date, idées cadeaux, cadeaux déjà offerts (maquette HF-AnnivDetail). */
export default function BirthdayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const mutate = useDbMutation();
  const { data: b, loadedKey } = useDbQuery((db) => getBirthday(db, Number(id)), id);
  const [showPrices, setShowPrices] = useState(false);
  const [newIdea, setNewIdea] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);

  if (b === undefined || loadedKey !== id) return <Screen />;
  if (!b) {
    return (
      <Screen>
        <BackHeader title="Anniversaire" />
        <AppText variant="title" style={{ padding: 16 }}>
          Anniversaire introuvable
        </AppText>
      </Screen>
    );
  }

  const occYear = Number(b.next.slice(0, 4));
  const color = colorOf(b);
  const price = (cents: number | null, approx = false) =>
    !showPrices ? '•• €' : cents === null ? 'prix ?' : `${approx ? '~' : ''}${formatEuros(cents)} €`;
  const total = b.givenList.reduce((s, g) => s + (g.priceCents ?? 0), 0);
  const years = new Set(b.givenList.map((g) => g.year)).size;
  // Cadeau de cette année pas encore offert : première ligne, pastille vide (comme un élément à venir).
  const pending = b.trackGifts && !b.givenList.some((g) => g.year === occYear);

  const submitIdea = async () => {
    if (!newIdea.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await mutate((db) => addIdea(db, b.id, newIdea));
    setNewIdea('');
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <BackHeader
          title={b.name}
          right={
            <Pressable
              onPress={() => router.push({ pathname: '/anniversaires/modifier/[id]', params: { id: String(b.id) } })}
              accessibilityRole="button"
              accessibilityLabel="Modifier"
              style={styles.iconBtn}>
              <Icon name="edit" size={20} />
            </Pressable>
          }
        />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ gap: 12, paddingHorizontal: 16, paddingBottom: 14 }}>
            <Animated.View entering={sectionEnter()} style={styles.dateCard}>
              <View style={{ width: 52, alignItems: 'center' }}>
                <AppText style={styles.bigDay}>{Number(b.next.slice(8, 10))}</AppText>
                <AppText style={styles.monthAbbr}>{format(parseDay(b.next), 'MMM', { locale: fr })}</AppText>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <AppText variant="bodyStrong" style={{ fontSize: 15 }}>
                  {mediumDayLabel(b.next)}
                  {b.age !== null && (
                    <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 15 }}> · {b.age} ans</AppText>
                  )}
                </AppText>
                <AppText variant="caption" style={{ lineHeight: 17 }}>
                  {untilLabel(b.inDays)}
                  {b.category && (
                    <AppText variant="caption" color={color}>
                      {' '}· {b.category.name}
                    </AppText>
                  )}{' '}
                  · rappels {remindersLabel(b)}
                </AppText>
              </View>
              <View style={styles.cake}>
                <Icon name="cake" size={16} color={categoryColors.birthday} />
              </View>
            </Animated.View>

            {b.trackGifts && (
              <Animated.View entering={sectionEnter(30)} style={styles.ideas}>
                <View style={styles.ideasHead}>
                  <AppText style={styles.h2}>Idées cadeaux</AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name="clock" size={13} color={colors.textSecondary} strokeWidth={2} />
                    <AppText variant="caption" color={colors.textSecondary}>
                      acheter avant{' '}
                      <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 12 }}>
                        {format(parseDay(buyBefore(b, b.next)), 'dd/MM')}
                      </AppText>
                    </AppText>
                  </View>
                </View>

                {b.ideaList.map((it, i) => (
                  <Animated.View key={it.id} entering={rowEnter(60 + Math.min(i, 8) * 30)}>
                    <Pressable
                      onPress={() => setEditing({ kind: 'idea', idea: it })}
                      accessibilityRole="button"
                      accessibilityHint="Modifier l'idée"
                      style={({ pressed }) => [styles.idea, pressed && { backgroundColor: '#2A2A2F' }]}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <AppText variant="bodyMedium" numberOfLines={1} style={{ fontSize: 14 }}>
                          {it.title}
                        </AppText>
                        <AppText variant="caption">
                          {it.fromWish ? 'depuis Envies' : `idée du ${format(parseDay(dayOf(it.createdAt)), 'dd/MM')}`} ·{' '}
                          <AppText
                            style={{ fontFamily: fonts.displayMedium, fontSize: 12 }}
                            color={showPrices ? colors.text : colors.textSecondary}>
                            {price(it.priceCents, true)}
                          </AppText>
                        </AppText>
                      </View>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          mutate((db) => setIdeaGiven(db, it.id, occYear, !it.given));
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: it.given }}
                        accessibilityLabel={`${it.title} : offert`}
                        style={[styles.offer, it.given && styles.offerOn]}>
                        {it.given && (
                          <Animated.View entering={FadeIn.duration(200)}>
                            <Icon name="check" size={14} color={colors.bg} strokeWidth={2.6} />
                          </Animated.View>
                        )}
                        <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 13 }} color={it.given ? colors.bg : colors.text}>
                          Offert
                        </AppText>
                      </Pressable>
                    </Pressable>
                  </Animated.View>
                ))}

                <TextInput
                  value={newIdea}
                  onChangeText={setNewIdea}
                  onSubmitEditing={submitIdea}
                  submitBehavior="submit"
                  returnKeyType="done"
                  placeholder="+ Ajouter une idée"
                  placeholderTextColor={colors.textTertiary}
                  cursorColor={colors.text}
                  accessibilityLabel="Nouvelle idée"
                  style={styles.ideaInput}
                />
              </Animated.View>
            )}
          </View>

          {/* Même mise en page que la vue Jour : encart sombre, rail, pastilles et cartes. */}
          <Animated.View entering={sectionEnter(60)} style={[styles.section, { marginBottom: insets.bottom + 24 }]}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="title">Déjà offert</AppText>
                <AppText variant="caption" style={{ fontSize: 13, marginTop: 2 }}>
                  {b.givenList.length
                    ? `${b.givenList.length} cadeau${b.givenList.length > 1 ? 'x' : ''} · total ${showPrices ? `${formatEuros(total)} €` : '•• €'} sur ${years} an${years > 1 ? 's' : ''}`
                    : "rien de noté pour l'instant"}
                </AppText>
              </View>
              <Pressable
                onPress={() => setShowPrices((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPrices ? 'Masquer les prix' : 'Afficher les prix'}
                accessibilityState={{ selected: showPrices }}
                style={[styles.priceToggle, showPrices && { backgroundColor: colors.text }]}>
                <Icon name={showPrices ? 'eyeOff' : 'eye'} size={16} color={showPrices ? colors.onLight : colors.text} />
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={showPrices ? colors.onLight : colors.text}>
                  Prix
                </AppText>
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 16 }}>
              {(pending || b.givenList.length > 0) && <View style={styles.rail} />}
              <View style={{ gap: 10 }}>
                {pending && (
                  <Row delay={100} node={<View style={[styles.node, styles.nodeTodo]} />}>
                    <Pressable
                      onPress={() => setEditing({ kind: 'given', given: null })}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.card, styles.cardTodo, pressed && { backgroundColor: colors.row }]}>
                      <View style={styles.cardTop}>
                        <AppText variant="bodyStrong" color={colors.textSecondary} style={{ fontSize: 15, flex: 1 }}>
                          Cadeau {occYear}
                        </AppText>
                        <AppText variant="number" style={{ fontSize: 14 }}>
                          avant {format(parseDay(buyBefore(b, b.next)), 'dd/MM')}
                        </AppText>
                      </View>
                      <AppText variant="caption">pas encore offert{b.age !== null ? ` · ${b.age} ans` : ''}</AppText>
                    </Pressable>
                  </Row>
                )}
                {b.givenList.map((g, i) => (
                  <Row key={g.id} delay={100 + Math.min(i + 1, 8) * 30} node={<DoneNode />}>
                    <Pressable
                      onPress={() => setEditing({ kind: 'given', given: g })}
                      accessibilityRole="button"
                      accessibilityHint="Modifier le cadeau"
                      style={({ pressed }) => [styles.card, styles.cardLight, pressed && { backgroundColor: '#2A2A2F' }]}>
                      <View style={styles.cardTop}>
                        <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15, flex: 1 }}>
                          {g.title}
                        </AppText>
                        <AppText variant="number" style={{ fontSize: 14 }} color={showPrices ? colors.text : colors.textTertiary}>
                          {price(g.priceCents)}
                        </AppText>
                      </View>
                      <AppText variant="caption">
                        {g.year}
                        {b.year ? ` · ${g.year - b.year} ans` : ''}
                      </AppText>
                    </Pressable>
                  </Row>
                ))}
              </View>
            </View>

            <Pressable
              onPress={() => setEditing({ kind: 'given', given: null })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addGiven, pressed && { backgroundColor: colors.row }]}>
              <Icon name="plus" size={16} strokeWidth={2} />
              <AppText variant="label">Noter un cadeau offert</AppText>
            </Pressable>
          </Animated.View>
        </ScrollView>

        {editing && <GiftSheet b={b} editing={editing} occYear={occYear} onClose={() => setEditing(null)} />}
      </KeyboardAvoidingView>
    </Screen>
  );
}

/* Entrées courtes, comme la vue Jour : 260 ms pour un bloc, 220 ms par ligne. */
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
const sectionEnter = (delay = 0) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 16 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease },
  })
    .duration(260)
    .delay(delay);
// Une instance par ligne : Keyframe.delay() modifie l'objet.
const rowEnter = (delay: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 8 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease },
  })
    .duration(220)
    .delay(delay);

function Row({ delay, node, children }: { delay: number; node: React.ReactNode; children: React.ReactNode }) {
  return (
    <Animated.View entering={rowEnter(delay)} style={{ flexDirection: 'row', gap: 16 }}>
      <View style={{ width: 16, paddingTop: 16, alignItems: 'center' }}>{node}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </Animated.View>
  );
}

function DoneNode() {
  return (
    <View style={[styles.node, { backgroundColor: colors.text }]}>
      <Icon name="check" size={10} color={colors.onLight} strokeWidth={4} />
    </View>
  );
}

/** Feuille pour modifier une idée, ou noter / modifier un cadeau offert (année, cadeau, prix). */
function GiftSheet({ b, editing, occYear, onClose }: { b: BirthdayDetail; editing: Editing; occYear: number; onClose: () => void }) {
  const mutate = useDbMutation();
  const isIdea = editing.kind === 'idea';
  const src = editing.kind === 'idea' ? editing.idea : editing.given;
  const [title, setTitle] = useState(src?.title ?? '');
  const [priceText, setPriceText] = useState(src?.priceCents != null ? formatEuros(src.priceCents) : '');
  const thisYear = Number(todayKey().slice(0, 4));
  const [yearText, setYearText] = useState(
    String(editing.kind === 'given' && editing.given ? editing.given.year : Math.min(occYear, thisYear)),
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet inline onClosed={onClose} label={isIdea ? "Modifier l'idée" : 'Cadeau offert'}>
      {(close) => {
        const save = async () => {
          const year = Number(yearText);
          const cents = priceText.trim() ? parseEuros(priceText) : null;
          if (!title.trim()) return setError('Donne un nom au cadeau.');
          if (priceText.trim() && cents === null) return setError('Prix illisible.');
          if (!isIdea && (!Number.isInteger(year) || year < 1900 || year > thisYear + 1)) return setError('Année invalide.');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (editing.kind === 'idea') await mutate((db) => updateIdea(db, editing.idea.id, title, cents));
          else if (editing.given) await mutate((db) => updateGiven(db, editing.given!.id, year, title, cents));
          else await mutate((db) => addGiven(db, b.id, year, title, cents));
          close();
        };
        const remove = () =>
          showDialog(isIdea ? 'Supprimer cette idée ?' : 'Supprimer ce cadeau ?', undefined, [
            { text: 'Garder', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: async () => {
                if (editing.kind === 'idea') await mutate((db) => deleteIdea(db, editing.idea.id));
                else if (editing.given) await mutate((db) => deleteGiven(db, editing.given!.id));
                close();
              },
            },
          ]);
        return (
          <>
            <AppText variant="title" style={{ paddingHorizontal: 4 }}>
              {isIdea ? "Modifier l'idée" : src ? 'Modifier le cadeau' : 'Noter un cadeau offert'}
            </AppText>
            <TextField
              label="Cadeau"
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                setError(null);
              }}
              placeholder="Ex. Casque vélo"
              autoFocus={!src}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {!isIdea && (
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Année"
                    value={yearText}
                    onChangeText={(t) => {
                      setYearText(t.replace(/\D/g, '').slice(0, 4));
                      setError(null);
                    }}
                    keyboardType="number-pad"
                    style={{ fontFamily: fonts.displayMedium, fontSize: 17 }}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <TextField
                  label={isIdea ? 'Prix estimé (€)' : 'Prix (€)'}
                  value={priceText}
                  onChangeText={(t) => {
                    setPriceText(t);
                    setError(null);
                  }}
                  placeholder="facultatif"
                  keyboardType="decimal-pad"
                  style={{ fontFamily: fonts.displayMedium, fontSize: 17 }}
                />
              </View>
            </View>
            {error && (
              <AppText variant="caption" color="#FF6B6B" accessibilityLiveRegion="polite">
                {error}
              </AppText>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {src && (
                <Pressable onPress={remove} accessibilityRole="button" style={[styles.sheetBtn, styles.sheetGhost]}>
                  <Icon name="trash" size={16} color="#D4D4D8" />
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color="#D4D4D8">
                    Supprimer
                  </AppText>
                </Pressable>
              )}
              <Pressable onPress={save} accessibilityRole="button" style={[styles.sheetBtn, styles.sheetPrimary]}>
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
                  Enregistrer
                </AppText>
              </Pressable>
            </View>
          </>
        );
      }}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
  },
  bigDay: { fontFamily: fonts.displayThin, fontSize: 44, lineHeight: 46, letterSpacing: -1.5, color: colors.text },
  monthAbbr: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textTertiary },
  cake: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: withAlpha(categoryColors.birthday, 0.13),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ideas: { gap: 6, padding: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 24 },
  ideasHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 4 },
  h2: { fontFamily: fonts.displayMedium, fontSize: 19, color: colors.text },
  idea: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingLeft: 14, paddingRight: 6, backgroundColor: colors.row, borderRadius: 14 },
  offer: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDashed,
  },
  offerOn: { backgroundColor: colors.success, borderColor: colors.success },
  ideaInput: {
    height: 44,
    marginTop: 4,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  section: {
    marginHorizontal: 16,
    paddingBottom: 14,
    gap: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    overflow: 'hidden',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  priceToggle: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.row },
  rail: { position: 'absolute', left: 23, top: 18, bottom: 24, width: 2, backgroundColor: colors.border },
  node: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  nodeTodo: { backgroundColor: colors.surfaceRaised, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.textMuted },
  card: { minHeight: 48, gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cardLight: { backgroundColor: colors.row },
  cardTodo: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderDashed },
  addGiven: {
    height: 44,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderDashed,
  },
  sheetBtn: { flex: 1, height: 50, flexDirection: 'row', gap: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sheetGhost: { backgroundColor: '#232327' },
  sheetPrimary: { backgroundColor: colors.text },
});
