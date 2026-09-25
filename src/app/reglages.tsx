import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { BackHeader, Screen } from '@/components/screen';
import { clearAllData } from '@/db/seed';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { colors, fonts } from '@/theme/tokens';

type Category = { id: number; name: string; color: string };

export default function SettingsScreen() {
  const mutate = useDbMutation();
  const { data } = useDbQuery(async (db) => {
    const [categories, demo] = await Promise.all([
      db.getAllAsync<Category>('SELECT id, name, color FROM categories ORDER BY sort'),
      db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'demo_data'"),
    ]);
    return { categories, demo: demo?.value === '1' };
  });

  const confirmClear = () =>
    Alert.alert(
      "Effacer les données d'exemple ?",
      "Tous les rendez-vous, tâches, objectifs et anniversaires seront supprimés. Les catégories sont gardées.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Effacer', style: 'destructive', onPress: () => mutate(clearAllData) },
      ],
    );

  return (
    <Screen>
      <BackHeader title="Réglages" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 20, paddingBottom: 40 }}>
        <Section title="Catégories">
          {data?.categories.map((c, i) => (
            <View key={c.id} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={[styles.swatch, { backgroundColor: c.color }]} />
              <AppText variant="bodyMedium" style={{ flex: 1 }}>
                {c.name}
              </AppText>
            </View>
          ))}
          <AppText variant="caption" style={styles.hint}>
            Modifier, ajouter et associer aux agendas Google : prochaine étape.
          </AppText>
        </Section>

        <Section title="Google Agenda">
          <AppText variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>
            Import en lecture seule des agendas du téléphone (rien n&apos;est renvoyé vers Google). Arrive à une
            prochaine étape.
          </AppText>
        </Section>

        {data?.demo && (
          <Section title="Données d'exemple">
            <AppText variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>
              L&apos;app a été remplie avec quelques éléments pour montrer à quoi elle ressemble.
            </AppText>
            <Pressable onPress={confirmClear} accessibilityRole="button" style={styles.danger}>
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }} color={colors.late}>
                Effacer les données d&apos;exemple
              </AppText>
            </Pressable>
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="overline" style={{ paddingHorizontal: 4 }}>
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 10,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  hint: { paddingTop: 4 },
  danger: {
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lateBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
