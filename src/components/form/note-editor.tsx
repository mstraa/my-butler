import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FieldLabel } from '@/components/form/fields';
import { Markdown } from '@/components/markdown';
import { colors, fonts } from '@/theme/tokens';

/**
 * Champ « Note » des formulaires : texte libre, mis en forme à l'affichage (Markdown, sans le dire).
 * « Aperçu » montre le rendu ; les cases à cocher s'y cochent.
 */
export function NoteEditor({
  value, onChange, onCommit, placeholder, label = 'Note',
}: {
  value: string;
  onChange: (v: string) => void;
  /** Texte à enregistrer : en quittant le champ, ou quand on coche une case dans l'aperçu. */
  onCommit?: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [preview, setPreview] = useState(false);
  const [focused, setFocused] = useState(false);
  const id = `lbl-note-${label}`;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.head}>
        <FieldLabel nativeID={id}>{label}</FieldLabel>
        <View style={styles.segment}>
          {(['Écrire', 'Aperçu'] as const).map((m) => {
            const on = (m === 'Aperçu') === preview;
            return (
              <Pressable
                key={m}
                onPress={() => setPreview(m === 'Aperçu')}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.segBtn, on && { backgroundColor: colors.text }]}>
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 12 }} color={on ? colors.onLight : colors.textSecondary}>
                  {m}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
      {preview ? (
        <View style={styles.preview}>
          {value.trim() ? (
            <Markdown
              source={value}
              onToggle={(next) => {
                onChange(next);
                onCommit?.(next);
              }}
            />
          ) : (
            <AppText variant="body" color={colors.textTertiary}>
              Rien à afficher.
            </AppText>
          )}
        </View>
      ) : (
        <TextInput
          accessibilityLabelledBy={id}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          cursorColor={colors.text}
          selectionColor={colors.textSecondary}
          multiline
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onCommit?.(value);
          }}
          style={[styles.input, focused && { borderColor: colors.text }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segment: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: 999,
    backgroundColor: colors.segmented,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segBtn: { height: 26, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  input: {
    minHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    backgroundColor: colors.segmented,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  preview: {
    minHeight: 120,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
});
