import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { colors, fonts } from '@/theme/tokens';

/*
 * Rendu Markdown léger pour les notes (pas de dépendance) :
 * # titres, listes - * 1., cases - [ ] / - [x], > citations, ``` blocs de code ```, ---,
 * et dans le texte **gras**, *italique*, ~~barré~~, `code`, [lien](https://…).
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'bullet'; text: string; indent: number }
  | { kind: 'number'; n: string; text: string; indent: number }
  | { kind: 'check'; text: string; checked: boolean; indent: number; line: number }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      out.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) continue;
    const indent = Math.floor((raw.match(/^\s*/)?.[0].length ?? 0) / 2);
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*(#{1,3})\s+(.*)$/))) out.push({ kind: 'heading', level: m[1].length, text: m[2] });
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) out.push({ kind: 'rule' });
    else if ((m = line.match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/)))
      out.push({ kind: 'check', checked: m[1] !== ' ', text: m[2], indent, line: i });
    else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) out.push({ kind: 'bullet', text: m[1], indent });
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) out.push({ kind: 'number', n: m[1], text: m[2], indent });
    else if ((m = line.match(/^\s*>\s?(.*)$/))) {
      const prev = out[out.length - 1];
      if (prev?.kind === 'quote') prev.text += `\n${m[1]}`;
      else out.push({ kind: 'quote', text: m[1] });
    } else {
      // Lignes qui se suivent = un seul paragraphe (retour à la ligne gardé).
      const prev = out[out.length - 1];
      const prevRaw = lines[i - 1] ?? '';
      if (prev?.kind === 'para' && prevRaw.trim()) prev.text += `\n${line.trim()}`;
      else out.push({ kind: 'para', text: line.trim() });
    }
  }
  return out;
}

/** Coche / décoche la case de la ligne `line` dans le texte source. */
export function toggleCheckbox(src: string, line: number) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  lines[line] = lines[line].replace(/\[([ xX])\]/, (_, c: string) => (c === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function Inline({ text, muted }: { text: string; muted?: boolean }) {
  const parts = text.split(INLINE).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (/^(\*\*|__)/.test(p)) return <AppText key={i} style={{ fontFamily: fonts.bodyBold }}>{p.slice(2, -2)}</AppText>;
        if (p.startsWith('~~')) return <AppText key={i} style={{ textDecorationLine: 'line-through' }}>{p.slice(2, -2)}</AppText>;
        if (p.startsWith('`')) return <AppText key={i} style={styles.inlineCode}>{p.slice(1, -1)}</AppText>;
        const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (link) {
          const url = /^[a-z]+:/i.test(link[2]) ? link[2] : `https://${link[2]}`;
          return (
            <AppText
              key={i}
              accessibilityRole="link"
              onPress={() => WebBrowser.openBrowserAsync(url)}
              style={{ textDecorationLine: 'underline' }}
              color={colors.text}>
              {link[1]}
            </AppText>
          );
        }
        if (/^[*_]/.test(p) && p.length > 2) return <AppText key={i} style={{ fontStyle: 'italic' }}>{p.slice(1, -1)}</AppText>;
        return <AppText key={i} color={muted ? colors.textMuted : undefined}>{p}</AppText>;
      })}
    </>
  );
}

/** Affiche une note Markdown. `onToggle` : rend les cases cochables (reçoit le nouveau texte). */
export function Markdown({ source, onToggle }: { source: string; onToggle?: (next: string) => void }) {
  const blocks = parse(source);
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return (
              <AppText key={i} accessibilityRole="header" style={[styles.heading, { fontSize: [0, 22, 18, 16][b.level] }]}>
                <Inline text={b.text} />
              </AppText>
            );
          case 'rule':
            return <View key={i} style={styles.rule} />;
          case 'code':
            return (
              <View key={i} style={styles.codeBlock}>
                <AppText style={styles.code}>{b.text}</AppText>
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={styles.quote}>
                <AppText variant="body" color={colors.textSecondary} style={styles.text}>
                  <Inline text={b.text} />
                </AppText>
              </View>
            );
          case 'bullet':
          case 'number':
            return (
              <View key={i} style={[styles.item, { paddingLeft: b.indent * 16 }]}>
                <AppText variant="body" color={colors.textTertiary} style={[styles.text, styles.marker]}>
                  {b.kind === 'bullet' ? '•' : `${b.n}.`}
                </AppText>
                <AppText variant="body" style={[styles.text, { flex: 1 }]}>
                  <Inline text={b.text} />
                </AppText>
              </View>
            );
          case 'check':
            return (
              <Pressable
                key={i}
                disabled={!onToggle}
                onPress={() => onToggle?.(toggleCheckbox(source, b.line))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: b.checked }}
                style={[styles.item, { paddingLeft: b.indent * 16, minHeight: onToggle ? 32 : undefined }]}>
                <View style={[styles.box, b.checked && styles.boxOn]}>
                  {b.checked && <Icon name="check" size={11} color={colors.onLight} strokeWidth={3.2} />}
                </View>
                <AppText
                  variant="body"
                  color={b.checked ? colors.textMuted : undefined}
                  style={[styles.text, { flex: 1 }, b.checked && { textDecorationLine: 'line-through' }]}>
                  <Inline text={b.text} muted={b.checked} />
                </AppText>
              </Pressable>
            );
          default:
            return (
              <AppText key={i} variant="body" style={styles.text}>
                <Inline text={b.text} />
              </AppText>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22 },
  heading: { fontFamily: fonts.displayMedium, color: colors.text, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  marker: { minWidth: 14 },
  box: {
    width: 18,
    height: 18,
    marginTop: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.text, borderColor: colors.text },
  quote: { paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.borderDashed },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  inlineCode: { fontFamily: 'monospace', fontSize: 13, backgroundColor: colors.row, color: colors.text },
  codeBlock: { padding: 10, borderRadius: 10, backgroundColor: colors.row },
  code: { fontFamily: 'monospace', fontSize: 13, lineHeight: 18, color: colors.text },
});
