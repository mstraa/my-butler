import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { Chip, FieldLabel, SwitchRow, TextField } from '@/components/form/fields';
import { Icon, type IconName } from '@/components/icon';
import { TrackerChart } from '@/components/tracker-charts';
import { GOAL_COLORS } from '@/db/agenda';
import { syncHealth } from '@/db/health-sync';
import { healthMetricOf, type TrackerDraft, type TrackerKind } from '@/db/tracking';
import { shiftDay, todayKey } from '@/lib/dates';
import { healthAvailable, healthSupported, requestHealthAccess } from '@/lib/health';
import { fmtDuration, fmtNum, fmtStep, isDuration, parseDraft } from '@/lib/tracker-format';
import { categoryColors, colors, fonts, withAlpha } from '@/theme/tokens';

const KINDS: { value: TrackerKind; label: string; hint: string; icon: IconName }[] = [
  { value: 'duration', label: 'Temps', hint: 'Une durée : lecture, méditation…', icon: 'timer' },
  { value: 'time', label: 'Heure', hint: 'Un moment : lever, coucher…', icon: 'clock' },
  { value: 'quantity', label: 'Quantité', hint: 'Un nombre : cafés, cigarettes…', icon: 'task' },
  { value: 'volume', label: 'Volume', hint: 'Un liquide : eau, e-liquide…', icon: 'drop' },
  { value: 'sleep', label: 'Sommeil', hint: 'Heure de coucher et de lever : la durée de la nuit se calcule toute seule', icon: 'moon' },
];

/** Unités proposées ; une quantité accepte aussi une unité libre. */
const UNITS: Record<TrackerKind, { value: string; label: string }[]> = {
  duration: [{ value: 'h', label: 'Heures' }, { value: 'min', label: 'Minutes' }],
  time: [],
  sleep: [],
  quantity: [
    { value: 'fois', label: 'fois' }, { value: 'verres', label: 'verres' }, { value: 'cafés', label: 'cafés' },
    { value: 'cigarettes', label: 'cigarettes' }, { value: 'pas', label: 'pas' }, { value: '', label: 'Aucune' },
  ],
  volume: [{ value: 'ml', label: 'ml' }, { value: 'cl', label: 'cl' }, { value: 'L', label: 'L' }],
};

/** Pas proposés, selon le type et l'unité (minutes pour le temps et l'heure). */
function stepsFor(kind: TrackerKind, unit: string): number[] {
  if (kind === 'duration') return unit === 'min' ? [1, 5, 10, 15, 30] : [5, 10, 15, 30, 60];
  if (kind === 'time') return [1, 5, 10, 15, 30];
  if (kind === 'sleep') return [];
  if (kind === 'volume') return unit === 'L' ? [0.1, 0.25, 0.5, 1] : unit === 'cl' ? [1, 5, 10, 25, 33] : [0.5, 1, 5, 10, 50, 100, 250];
  return unit === 'pas' ? [100, 500, 1000] : [1, 2, 5, 10];
}

const DEFAULTS: Record<TrackerKind, { unit: string; step: number }> = {
  duration: { unit: 'h', step: 15 },
  time: { unit: '', step: 5 },
  sleep: { unit: 'h', step: 15 },
  quantity: { unit: 'fois', step: 1 },
  volume: { unit: 'ml', step: 50 },
};

/** Sommeil et pas : importés de Health Connect par défaut quand le téléphone le permet. */
const HEALTH = healthSupported ? 'health' : null;

/** Modèles pour démarrer vite (création seulement). */
const TEMPLATES: (TrackerDraft & { label: string })[] = [
  { label: 'Sommeil', name: 'Sommeil', kind: 'sleep', unit: 'h', step: 15, goal: 7 * 60, icon: 'moon', color: categoryColors.sport, source: HEALTH },
  { label: 'Pas', name: 'Pas', kind: 'quantity', unit: 'pas', step: 1000, goal: 8000, icon: 'steps', color: categoryColors.health, source: HEALTH },
  { label: 'Lever', name: 'Lever', kind: 'time', unit: '', step: 5, goal: null, icon: 'sun', color: categoryColors.groceries, source: null },
  { label: 'Eau', name: 'Eau', kind: 'volume', unit: 'L', step: 0.25, goal: 1.5, icon: 'glass', color: categoryColors.work, source: null },
  { label: 'E-liquide', name: 'E-liquide', kind: 'volume', unit: 'ml', step: 0.5, goal: null, icon: 'drop', color: categoryColors.work, source: null },
  { label: 'Cafés', name: 'Cafés', kind: 'quantity', unit: 'cafés', step: 1, goal: null, icon: 'glass', color: categoryColors.friends, source: null },
];

const ICONS: IconName[] = ['pulse', 'task', 'moon', 'sun', 'drop', 'glass', 'flame', 'timer', 'clock', 'book', 'sport', 'steps', 'pill', 'fruit'];
const COLORS = [...GOAL_COLORS, categoryColors.personal];

/** Données d'exemple pour l'aperçu du graphique. */
const SAMPLE: Record<TrackerKind, number[]> = {
  duration: [0.9, 0.75, 1, 0.85, 0.7, 1.1, 0.95],
  time: [0, 25, -15, 10, 40, -5, 5],
  sleep: [0.9, 0.75, 1, 0.85, 0.7, 1.1, 0.95],
  quantity: [2, 3, 1, 4, 2, 0, 3],
  volume: [0.8, 1, 0.6, 1.2, 0.9, 0.7, 1],
};

type Props = {
  title: string;
  initial: TrackerDraft;
  isNew?: boolean;
  onSave: (d: TrackerDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
};

/** Formulaire « Nouveau suivi » / « Modifier le suivi ». */
export function TrackerForm({ title, initial, isNew, onSave, onDelete }: Props) {
  const db = useSQLiteContext();
  const [d, setD] = useState<TrackerDraft>(initial);
  const [stepText, setStepText] = useState(stepsFor(initial.kind, initial.unit).includes(initial.step) ? '' : fmtNum(initial.step));
  const [goalText, setGoalText] = useState(goalToText(initial));
  const [customUnit, setCustomUnit] = useState(initial.kind === 'quantity' && !UNITS.quantity.some((u) => u.value === initial.unit));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TrackerDraft>) => setD((c) => ({ ...c, ...patch }));
  const color = d.color ?? COLORS[0];

  const pickKind = (kind: TrackerKind) => {
    if (kind === d.kind) return;
    set({ kind, ...DEFAULTS[kind], icon: d.icon === KINDS.find((k) => k.value === d.kind)?.icon || d.icon === 'pulse' ? KINDS.find((k) => k.value === kind)!.icon : d.icon });
    setStepText('');
    setGoalText('');
    setCustomUnit(false);
  };
  const pickUnit = (unit: string) => {
    const steps = stepsFor(d.kind, unit);
    set({ unit, step: steps.includes(d.step) ? d.step : steps[Math.min(1, steps.length - 1)] });
    setStepText('');
  };
  const applyTemplate = (tpl: TrackerDraft) => {
    setD({ ...tpl });
    setStepText('');
    setGoalText(goalToText(tpl));
    setCustomUnit(false);
  };

  // Pas libre : minutes pour le temps et l'heure, sinon dans l'unité.
  const customStep = stepText ? Number(stepText.replace(',', '.')) : null;
  const step = customStep ?? d.step;
  const goal = d.kind === 'time' || !goalText.trim() ? null : parseDraft({ ...d, step }, goalText);

  const nameError = !d.name.trim() ? 'Donne un nom au suivi.' : null;
  const stepError = !(step > 0) ? 'Le pas doit être supérieur à 0.' : null;
  const goalError = goalText.trim() && d.kind !== 'time' && !(goal && goal > 0) ? "L'objectif n'est pas un nombre valide." : null;

  const save = async () => {
    if (nameError || stepError || goalError) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const draft = { ...d, name: d.name.trim(), unit: d.unit.trim(), step, goal, color };
    const metric = healthMetricOf(draft);
    if (!metric) draft.source = null;
    const kindChanged = !isNew && initial.kind !== d.kind;
    const doSave = async (withHealth = true) => {
      if (!withHealth) draft.source = null;
      if (metric && draft.source === 'health' && !(await requestHealthAccess(metric))) {
        const available = await healthAvailable();
        showDialog(
          available ? 'Accès refusé' : 'Health Connect indisponible',
          available
            ? `Sans l'accès ${metric === 'steps' ? 'aux pas' : 'au sommeil'}, le suivi ne peut pas être rempli depuis Health Connect.`
            : "Health Connect n'est pas installé ou pas à jour sur ce téléphone.",
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Saisir à la main', onPress: () => doSave(false) },
          ],
        );
        return;
      }
      setSaving(true);
      try {
        await onSave(draft);
        if (draft.source === 'health') syncHealth(db);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } catch (e) {
        setSaving(false);
        showDialog("Impossible d'enregistrer", e instanceof Error ? e.message : String(e));
      }
    };
    if (kindChanged) {
      showDialog('Changer de type ?', 'Les valeurs déjà notées ne correspondent plus : elles seront effacées.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Changer', style: 'destructive', onPress: () => doSave() },
      ]);
    } else doSave();
  };

  const preview = previewDays(d.kind, goal, step > 0 ? step : d.step);
  const unitLabel = isDuration(d.kind) || d.kind === 'time' ? 'min' : d.unit;

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
          {isNew && (
            <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 8 }}>
              <FieldLabel>Modèles</FieldLabel>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {TEMPLATES.map(({ label, ...tpl }) => (
                  <Chip key={label} label={label} dot={tpl.color ?? undefined} selected={d.name === tpl.name && d.kind === tpl.kind && d.unit === tpl.unit && d.step === tpl.step} onPress={() => applyTemplate(tpl)} />
                ))}
              </ScrollView>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(20).duration(260)} style={{ gap: 6 }}>
            <TextField
              label="Suivi"
              big
              value={d.name}
              onChangeText={(name) => set({ name })}
              placeholder="Ex. Eau, Sommeil, Cafés"
              autoFocus={isNew}
            />
            {showErrors && nameError && <ErrorText>{nameError}</ErrorText>}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(40).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Type</FieldLabel>
            <View style={styles.kinds} accessibilityRole="radiogroup">
              {KINDS.map((k) => {
                const on = d.kind === k.value;
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => pickKind(k.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[styles.kind, on && styles.kindOn]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Icon name={k.icon} size={16} color={on ? colors.text : colors.textTertiary} />
                      <AppText variant="bodyStrong" style={{ fontSize: 15 }}>
                        {k.label}
                      </AppText>
                    </View>
                    <AppText variant="caption" color={on ? colors.textSecondary : colors.textTertiary}>
                      {k.hint}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {d.kind !== 'time' && d.kind !== 'sleep' && (
            <Animated.View key={`unit-${d.kind}`} entering={FadeIn.duration(200)} style={{ gap: 8 }}>
              <FieldLabel>Unité</FieldLabel>
              <View style={styles.chips}>
                {UNITS[d.kind].map((u) => (
                  <Chip
                    key={u.label}
                    label={u.label}
                    selected={!customUnit && d.unit === u.value}
                    onPress={() => {
                      setCustomUnit(false);
                      pickUnit(u.value);
                    }}
                  />
                ))}
                {d.kind === 'quantity' && (
                  <Chip label="Autre…" dashed selected={customUnit} onPress={() => { setCustomUnit(true); set({ unit: '' }); }} />
                )}
              </View>
              {d.kind === 'quantity' && customUnit && (
                <TextField label="Unité" value={d.unit} onChangeText={(unit) => set({ unit })} placeholder="Ex. clopes, pages, km" autoFocus />
              )}
            </Animated.View>
          )}

          {healthSupported && healthMetricOf(d) && (
            <Animated.View key={`health-${healthMetricOf(d)}`} entering={FadeIn.duration(200)} style={{ gap: 6 }}>
              <SwitchRow
                label="Importer depuis Health Connect"
                icon="pulse"
                value={d.source === 'health'}
                onChange={(on) => set({ source: on ? 'health' : null })}
              />
              <AppText variant="caption">
                {`${healthMetricOf(d) === 'steps' ? 'Pas repris' : 'Nuits reprises'} de Zepp ou d'une autre app santé à chaque ouverture de l'app. Les valeurs ne se modifient plus à la main.`}
              </AppText>
            </Animated.View>
          )}

          {d.kind !== 'sleep' && (
          <Animated.View key={`step-${d.kind}-${d.unit}`} entering={FadeIn.duration(200)} style={{ gap: 8 }}>
            <FieldLabel>Pas des boutons − / +</FieldLabel>
            <View style={styles.chips}>
              {stepsFor(d.kind, d.unit).map((v) => (
                <Chip
                  key={v}
                  label={fmtStep({ kind: d.kind, unit: d.unit, step: v })}
                  selected={!stepText && d.step === v}
                  onPress={() => {
                    setStepText('');
                    set({ step: v });
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={`Autre pas${unitLabel ? ` (${unitLabel})` : ''}`}
                  value={stepText}
                  onChangeText={(t) => setStepText(t.replace(/[^\d,.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder={fmtNum(d.step)}
                  style={{ fontFamily: fonts.displayMedium, fontSize: 17 }}
                />
              </View>
            </View>
            {showErrors && stepError && <ErrorText>{stepError}</ErrorText>}
          </Animated.View>
          )}

          {d.kind !== 'time' && (
            <Animated.View key={`goal-${d.kind}`} entering={FadeIn.duration(200)} style={{ gap: 6 }}>
              <TextField
                label={`${d.kind === 'sleep' ? 'Objectif par nuit' : 'Objectif par jour'} (facultatif)${isDuration(d.kind) ? '' : d.unit ? ` · ${d.unit}` : ''}`}
                value={goalText}
                onChangeText={setGoalText}
                keyboardType={isDuration(d.kind) ? 'numbers-and-punctuation' : 'decimal-pad'}
                placeholder={isDuration(d.kind) ? (d.unit === 'min' ? '30' : '7h30') : d.kind === 'volume' ? '1,5' : '3'}
                style={{ fontFamily: fonts.displayMedium, fontSize: 17 }}
              />
              <AppText variant="caption">Une ligne en pointillés sur le graphique.</AppText>
              {showErrors && goalError && <ErrorText>{goalError}</ErrorText>}
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(60).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Aperçu</FieldLabel>
            <View style={styles.preview}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.iconBox, { backgroundColor: withAlpha(color, 0.13) }]}>
                  <Icon name={d.icon as IconName} size={16} color={color} />
                </View>
                <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1, fontSize: 16 }}>
                  {d.name.trim() || 'Mon suivi'}
                </AppText>
                {d.kind !== 'sleep' && <AppText variant="caption">pas de {fmtStep({ kind: d.kind, unit: d.unit, step: step > 0 ? step : d.step })}</AppText>}
              </View>
              <TrackerChart
                key={`${d.kind}-${goal ?? ''}`}
                kind={d.kind}
                unit={d.unit}
                step={step > 0 ? step : d.step}
                days={preview}
                color={color}
                goal={goal}
                label="Aperçu du graphique"
              />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(260)} style={{ gap: 8 }}>
            <FieldLabel>Icône et couleur</FieldLabel>
            <View style={styles.icons}>
              {ICONS.map((ic) => {
                const on = d.icon === ic;
                return (
                  <Pressable
                    key={ic}
                    onPress={() => set({ icon: ic })}
                    accessibilityRole="radio"
                    accessibilityLabel={`Icône ${ic}`}
                    accessibilityState={{ checked: on }}
                    style={[styles.iconChoice, { backgroundColor: on ? withAlpha(color, 0.18) : colors.surface }, on && { borderColor: color }]}>
                    <Icon name={ic} size={18} color={on ? color : colors.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.colors}>
              {COLORS.map((c) => {
                const on = color === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => set({ color: c })}
                    accessibilityRole="radio"
                    accessibilityLabel={`Couleur ${c}`}
                    accessibilityState={{ checked: on }}
                    style={[styles.swatchRing, on && { borderColor: c }]}>
                    <View style={[styles.swatch, { backgroundColor: c }]} />
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {onDelete && (
            <Pressable
              onPress={() =>
                showDialog('Supprimer ce suivi ?', 'Toutes ses valeurs sont supprimées aussi.', [
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
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function goalToText(d: TrackerDraft) {
  if (d.goal === null || d.kind === 'time') return '';
  if (isDuration(d.kind)) return d.unit === 'min' ? String(d.goal) : fmtDuration(d.goal).replace(' h ', 'h').replace(' h', 'h').replace(' min', '');
  return fmtNum(d.goal);
}

/** 7 jours d'exemple, à l'échelle de l'objectif s'il y en a un. */
function previewDays(kind: TrackerKind, goal: number | null, step: number) {
  const t = todayKey();
  const base = isDuration(kind) ? goal ?? 7 * 60 : kind === 'volume' ? goal ?? step * 6 : kind === 'time' ? 7 * 60 + 15 : step;
  return SAMPLE[kind].map((f, i) => ({
    day: shiftDay(t, i - 6),
    value: kind === 'time' ? base + f : kind === 'quantity' ? (f === 0 ? null : f * base) : Math.round(base * f * 100) / 100,
  }));
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
  saveBtn: { height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.text, justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: 4,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  kindOn: { borderColor: colors.text, backgroundColor: colors.row },
  preview: { gap: 14, padding: 16, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 24 },
  iconBox: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  swatchRing: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  ghostBtn: {
    height: 48,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderDashed,
  },
});
