import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { type Food, foodMacros, type Macros } from '@/db/meals';
import { type DayKey, shiftDay, todayKey, weekIndex, weekRangeLabel } from '@/lib/dates';
import { containerText, fmtNum, MACRO_COLORS, macroLine, parseNum } from '@/lib/meal-format';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/** Protéines, glucides, lipides en trois pastilles ; `big` : totaux du jour. */
export function MacroPills({ m, big }: { m: Macros; big?: boolean }) {
  const items = [
    ['P', m.protein, MACRO_COLORS.protein, 'protéines'],
    ['G', m.carbs, MACRO_COLORS.carbs, 'glucides'],
    ['L', m.fat, MACRO_COLORS.fat, 'lipides'],
  ] as const;
  return (
    <View style={{ flexDirection: 'row', gap: big ? 8 : 6 }}>
      {items.map(([k, v, c, name]) => (
        <View
          key={k}
          accessible
          accessibilityLabel={`${Math.round(v)} grammes de ${name}`}
          style={[styles.pill, big && styles.pillBig, { backgroundColor: withAlpha(c, 0.12) }]}>
          <AppText style={{ fontFamily: fonts.bodyBold, fontSize: big ? 12 : 11 }} color={c}>
            {k}
          </AppText>
          <AppText style={{ fontFamily: fonts.displayMedium, fontSize: big ? 15 : 12 }} color={colors.text}>
            {Math.round(v)}
            <AppText style={{ fontFamily: fonts.body, fontSize: big ? 12 : 10 }} color={colors.textTertiary}>
              {' '}g
            </AppText>
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** − [portions] + : pas de ½ portion, saisie libre au clavier. */
export function PortionStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(fmtNum(value, 2));
  const [editing, setEditing] = useState(false);
  const step = (d: number) => {
    const n = Math.max(0.5, Math.round((value + d) * 2) / 2);
    if (n === value) return;
    Haptics.selectionAsync();
    onChange(n);
    setText(fmtNum(n, 2));
  };
  return (
    <View style={styles.stepper}>
      <StepBtn icon="minus" label="Une demi-portion de moins" onPress={() => step(-0.5)} disabled={value <= 0.5} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <TextInput
          value={editing ? text : fmtNum(value, 2)}
          onFocus={() => {
            setEditing(true);
            setText(fmtNum(value, 2));
          }}
          onChangeText={(t) => {
            setText(t);
            const n = parseNum(t);
            if (n !== null && !Number.isNaN(n) && n > 0) onChange(n);
          }}
          onBlur={() => setEditing(false)}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel="Nombre de portions"
          cursorColor={colors.text}
          style={styles.stepperInput}
        />
        <AppText variant="caption" style={{ marginTop: -4 }}>
          portion{value >= 2 ? 's' : ''}
        </AppText>
      </View>
      <StepBtn icon="plus" label="Une demi-portion de plus" onPress={() => step(0.5)} />
    </View>
  );
}

function StepBtn({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: colors.borderStrong }, disabled && { opacity: 0.35 }]}>
      <Icon name={icon} size={20} strokeWidth={2.2} />
    </Pressable>
  );
}

/** ‹ 29 sept. – 5 oct. › ; toucher le libellé revient à la semaine en cours. */
export function WeekNav({ day, onChange, compact }: { day: DayKey; onChange: (d: DayKey) => void; compact?: boolean }) {
  const offset = weekIndex(day) - weekIndex(todayKey());
  const current = offset === 0;
  const tag = current ? 'Cette semaine' : offset === -1 ? 'Semaine dernière' : offset === 1 ? 'Semaine prochaine' : offset < 0 ? `Il y a ${-offset} semaines` : `Dans ${offset} semaines`;
  const go = (n: number) => {
    Haptics.selectionAsync();
    onChange(shiftDay(day, n * 7));
  };
  return (
    <View style={[styles.weekNav, compact && { height: 48 }]}>
      <Pressable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Semaine précédente" style={styles.navBtn}>
        <Icon name="back" size={18} strokeWidth={2} />
      </Pressable>
      <Pressable
        onPress={() => !current && onChange(todayKey())}
        accessibilityRole="button"
        accessibilityLabel={`${weekRangeLabel(day)}, ${tag}`}
        accessibilityHint={current ? undefined : 'Revenir à cette semaine'}
        style={{ flex: 1, alignItems: 'center' }}>
        <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 16 }}>{weekRangeLabel(day)}</AppText>
        <AppText variant="caption" color={current ? colors.textTertiary : colors.late}>
          {tag}
        </AppText>
      </Pressable>
      <Pressable onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Semaine suivante" style={styles.navBtn}>
        <Icon name="arrowRight" size={18} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

/** Champ « Chercher un aliment » (loupe, effacer). */
export function SearchField({ value, onChange, autoFocus }: { value: string; onChange: (t: string) => void; autoFocus?: boolean }) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={18} color={colors.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Chercher un aliment"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel="Chercher un aliment"
        cursorColor={colors.text}
        selectionColor={colors.textSecondary}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.searchInput}
      />
      {!!value && (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Effacer la recherche" hitSlop={8}>
          <Icon name="x" size={16} color={colors.textTertiary} />
        </Pressable>
      )}
    </View>
  );
}

/** Un aliment du catalogue : nom, portion, contenant, macros d'une portion. */
export function FoodLine({ food, onPress, hint }: { food: Food; onPress: () => void; hint?: string }) {
  const m = foodMacros(food, 1);
  const sub = [food.portionLabel && `1 portion = ${food.portionLabel}`, containerText(food)].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={hint}
      style={({ pressed }) => [styles.food, pressed && { backgroundColor: colors.row }]}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
          {food.name}
        </AppText>
        {!!sub && (
          <AppText variant="caption" numberOfLines={1}>
            {sub}
          </AppText>
        )}
        <AppText variant="caption" numberOfLines={1} color={colors.textMuted}>
          {macroLine(m)}
        </AppText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 17 }}>{Math.round(m.kcal)}</AppText>
        <AppText variant="caption" style={{ fontSize: 10 }}>
          kcal
        </AppText>
      </View>
    </Pressable>
  );
}

/** Ligne d'action d'une feuille (icône ronde + libellé). */
export function ActionRow({
  icon, label, sub, onPress, destructive, selected,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
}) {
  const tint = destructive ? '#FF6B6B' : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selected !== undefined ? { selected } : undefined}
      style={({ pressed }) => [styles.action, (pressed || selected) && { backgroundColor: colors.row }]}>
      <View style={[styles.actionIcon, destructive && { backgroundColor: withAlpha('#FF6B6B', 0.14) }]}>
        <Icon name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyMedium" style={{ fontSize: 15 }} color={tint}>
          {label}
        </AppText>
        {sub && <AppText variant="caption">{sub}</AppText>}
      </View>
      {selected && <Icon name="check" size={18} strokeWidth={2.2} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  pillBig: { paddingHorizontal: 10, paddingVertical: 5 },
  stepper: {
    height: 72, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8,
    borderRadius: 22, backgroundColor: colors.segmented, borderWidth: 1, borderColor: colors.borderStrong,
  },
  stepBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  stepperInput: {
    minWidth: 80, padding: 0, textAlign: 'center', color: colors.text, fontFamily: fonts.displayLight, fontSize: 30,
  },
  weekNav: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 4 },
  navBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderDashed,
  },
  search: {
    height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
    borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.segmented,
  },
  searchInput: { flex: 1, height: 46, padding: 0, color: colors.text, fontFamily: fonts.body, fontSize: 15 },
  food: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
  },
  action: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 16 },
  actionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
});
