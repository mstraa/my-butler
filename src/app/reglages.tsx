import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { BackHeader, Screen } from '@/components/screen';
import { clearAllData } from '@/db/seed';
import { seedTestData } from '@/db/test-data';
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
    showDialog(
      "Effacer les données d'exemple ?",
      "Tous les rendez-vous, tâches, objectifs et anniversaires seront supprimés. Les catégories sont gardées.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Effacer', style: 'destructive', onPress: () => mutate(clearAllData) },
      ],
    );

  const [loading, setLoading] = useState(false);
  const confirmTestData = () =>
    showDialog(
      'Charger des données de test ?',
      'Toutes les données actuelles sont remplacées par un jeu fourni sur plusieurs mois : agenda, tâches, dépenses, objectifs, anniversaires.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Remplacer',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await mutate(seedTestData);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showDialog('Données de test chargées', "Elles s'effacent avec « Effacer les données d'exemple ».");
            } catch (e) {
              showDialog('Échec du chargement', e instanceof Error ? e.message : String(e));
            } finally {
              setLoading(false);
            }
          },
        },
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

        {/* Mode développement seulement (Expo Go, build de dev) : absent d'une version publiée. */}
        {__DEV__ && (
          <Section title="Développement">
            <AppText variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>
              Remplit l&apos;app avec beaucoup de données sur plusieurs mois, pour tester les écrans.
            </AppText>
            <Pressable
              onPress={confirmTestData}
              disabled={loading}
              accessibilityRole="button"
              style={({ pressed }) => [styles.devBtn, (pressed || loading) && { opacity: 0.7 }]}>
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }}>Charger des données de test</AppText>
              )}
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
  devBtn: {
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
  danger: {
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lateBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
