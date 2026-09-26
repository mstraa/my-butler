import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { colors, fonts } from '@/theme/tokens';

export function FieldLabel({ children, nativeID }: { children: React.ReactNode; nativeID?: string }) {
  return (
    <AppText nativeID={nativeID} style={styles.label}>
      {children}
    </AppText>
  );
}

/** Champ texte sombre ; bordure claire au focus. */
export function TextField({
  label, icon, big, style, ...props
}: TextInputProps & { label: string; icon?: IconName; big?: boolean }) {
  const [focused, setFocused] = useState(false);
  const id = `lbl-${label}`;
  return (
    <View style={{ gap: 6 }}>
      <FieldLabel nativeID={id}>{label}</FieldLabel>
      <View>
        {icon && (
          <View style={styles.inputIcon} pointerEvents="none">
            <Icon name={icon} size={18} color={colors.textTertiary} />
          </View>
        )}
        <TextInput
          accessibilityLabelledBy={id}
          placeholderTextColor={colors.textTertiary}
          cursorColor={colors.text}
          selectionColor={colors.textSecondary}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[
            styles.input,
            big && styles.inputBig,
            icon && { paddingLeft: 42 },
            focused && { borderColor: colors.text },
            style,
          ]}
        />
      </View>
    </View>
  );
}

/** Faux champ qui ouvre un sélecteur (date, heure, liste). */
export function PickerField({
  label, value, onPress, disabled, numeric, chevron, flex = 1,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  numeric?: boolean;
  chevron?: boolean;
  flex?: number;
}) {
  return (
    <View style={{ flex, minWidth: 0, gap: 6, opacity: disabled ? 0.35 : 1 }}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${value}`}
        style={({ pressed }) => [styles.input, styles.picker, pressed && { borderColor: colors.textSecondary }]}>
        <AppText
          numberOfLines={1}
          style={numeric ? { fontFamily: fonts.displayMedium, fontSize: 16 } : { fontFamily: fonts.body, fontSize: 15 }}
          color={colors.text}>
          {value}
        </AppText>
        {chevron && (
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Icon name="chevronRight" size={16} color={colors.textTertiary} strokeWidth={2} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** Interrupteur rond (piste 46 × 28), comme dans les maquettes. */
export function SwitchRow({
  label, value, onChange, icon, sub, dot,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: IconName;
  /** Petite ligne sous le libellé. */
  sub?: string;
  /** Pastille de couleur devant le libellé. */
  dot?: string;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={styles.switchRow}>
      {icon && (
        <View style={styles.switchIcon}>
          <Icon name={icon} size={16} />
        </View>
      )}
      {dot && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot }} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant={icon ? 'bodyStrong' : 'body'} numberOfLines={sub ? 1 : undefined} style={{ fontSize: 15 }}>
          {label}
        </AppText>
        {sub && (
          <AppText variant="caption" numberOfLines={1}>
            {sub}
          </AppText>
        )}
      </View>
      <View style={[styles.track, value && { backgroundColor: colors.text }]}>
        <View style={[styles.knob, value && { backgroundColor: colors.onLight, transform: [{ translateX: 18 }] }]} />
      </View>
    </Pressable>
  );
}

export function Chip({
  label, selected, onPress, dot, dashed,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  dot?: string;
  dashed?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.chip,
        selected && { backgroundColor: colors.text, borderColor: colors.text },
        dashed && { borderStyle: 'dashed' },
      ]}>
      {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
      <AppText
        style={{ fontFamily: selected ? fonts.bodySemiBold : fonts.bodyMedium, fontSize: 13 }}
        color={selected ? colors.onLight : '#D4D4D8'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Liste de choix dans une feuille qui monte du bas.
 * `asRoute` : la feuille est tout un écran (transparentModal), ex. au-dessus de la barre d'onglets ;
 * elle se ferme alors par un retour de navigation.
 */
export function OptionSheet<T>({
  visible = true, title, options, value, onPick, onClose, asRoute,
}: {
  visible?: boolean;
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  onClose?: () => void;
  asRoute?: boolean;
}) {
  if (!visible) return null;
  return (
    <Sheet inline={!asRoute} onClosed={asRoute ? undefined : onClose} label={title} style={{ maxHeight: '70%', gap: 8, paddingHorizontal: 12 }}>
      {(close) => (
        <>
          <AppText variant="title" style={{ paddingHorizontal: 8, paddingBottom: 4 }}>
            {title}
          </AppText>
          <FlatList
            data={options}
            keyExtractor={(o) => String(o.value)}
            renderItem={({ item }) => {
              const on = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onPick(item.value);
                    close();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [styles.option, (on || pressed) && { backgroundColor: colors.row }]}>
                  <AppText variant="bodyMedium" style={{ flex: 1, fontSize: 15 }}>
                    {item.label}
                  </AppText>
                  {on && <Icon name="check" size={18} strokeWidth={2.2} />}
                </Pressable>
              );
            }}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textTertiary },
  input: {
    height: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  inputBig: { height: 52, paddingHorizontal: 14, fontFamily: fonts.bodyMedium, fontSize: 17 },
  inputIcon: { position: 'absolute', left: 14, top: 15, zIndex: 1 },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  switchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.row, alignItems: 'center', justifyContent: 'center' },
  track: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.borderDashed, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, marginLeft: 3, backgroundColor: colors.textTertiary },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 12,
    paddingRight: 14,
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderRadius: 999,
  },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: 14 },
});
