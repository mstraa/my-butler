import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

type Variant =
  | 'hero' // chiffre géant du jour (Outfit 200)
  | 'display' // titre d'écran (Outfit 300)
  | 'title' // titre de section (Outfit 500)
  | 'number' // heures, montants (Outfit 500)
  | 'body'
  | 'bodyMedium'
  | 'bodyStrong'
  | 'label' // petit texte gras
  | 'caption'
  | 'overline';

export type AppTextProps = TextProps & {
  variant?: Variant;
  color?: string;
};

/**
 * Sur Android, `fontWeight` n'agit pas sur une police chargée : chaque graisse
 * est une famille distincte. Ce composant choisit la bonne famille par variante.
 */
export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[styles[variant], color ? { color } : null, style]} />;
}

const styles = StyleSheet.create({
  hero: { fontFamily: fonts.displayThin, fontSize: 84, lineHeight: 84, letterSpacing: -3, color: colors.text },
  display: { fontFamily: fonts.displayLight, fontSize: 26, letterSpacing: -0.3, color: colors.text },
  title: { fontFamily: fonts.displayMedium, fontSize: 20, color: colors.text },
  number: { fontFamily: fonts.displayMedium, fontSize: 13, color: colors.textSecondary },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  bodyStrong: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  overline: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
});
