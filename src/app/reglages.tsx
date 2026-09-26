import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { Chip, SwitchRow } from '@/components/form/fields';
import { GoogleCalendarSettings } from '@/components/google-calendar-settings';
import { Icon } from '@/components/icon';
import { BackHeader, Screen } from '@/components/screen';
import { getNotifSettings, type NotifSettings, setNotifSetting } from '@/db/notification-plan';
import { clearAllData } from '@/db/seed';
import { seedTestData } from '@/db/test-data';
import { invalidate, useDbMutation, useDbQuery } from '@/db/use-query';
import { notificationsAllowed, setupNotifications, testNotification } from '@/lib/notifications';
import { colors, fonts } from '@/theme/tokens';

const JOURNEE_TIMES = ['07:00', '07:30', '08:00', '09:00'];

type Category = { id: number; key: string; name: string; color: string };

export default function SettingsScreen() {
  const mutate = useDbMutation();
  const { data } = useDbQuery(async (db) => {
    const [categories, demo, notif, allowed] = await Promise.all([
      db.getAllAsync<Category>('SELECT id, key, name, color FROM categories ORDER BY sort'),
      db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'demo_data'"),
      getNotifSettings(db),
      notificationsAllowed(),
    ]);
    return { categories, demo: demo?.value === '1', notif, allowed };
  });

  const setNotif = <K extends keyof NotifSettings>(key: K, value: NotifSettings[K]) => {
    Haptics.selectionAsync();
    mutate((db) => setNotifSetting(db, key, value));
  };
  const allow = async () => {
    // Refusée une fois pour de bon : seuls les réglages du téléphone peuvent la rendre.
    if (!(await setupNotifications())) Linking.openSettings();
    invalidate(); // relit l'autorisation
  };

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
        {data && (
          <Section title="Notifications">
            {!data.allowed && (
              <View style={{ gap: 10, paddingBottom: 4 }}>
                <AppText variant="body" color={colors.late} style={{ lineHeight: 20 }}>
                  Les notifications sont bloquées : aucun rappel ne s&apos;affichera.
                </AppText>
                <Pressable onPress={allow} accessibilityRole="button" style={styles.devBtn}>
                  <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }}>Autoriser les notifications</AppText>
                </Pressable>
              </View>
            )}
            <SwitchRow icon="pin" label="Ma journée (épinglée)" value={data.notif.journee} onChange={(v) => setNotif('journee', v)} />
            {data.notif.journee && (
              <View style={{ gap: 8, paddingLeft: 44 }}>
                <AppText variant="caption">
                  Rendez-vous du jour, anniversaires et retards, mis à jour en continu. Nouvelle chaque matin à :
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {JOURNEE_TIMES.map((t) => (
                    <Chip key={t} label={t} selected={data.notif.journeeTime === t} onPress={() => setNotif('journeeTime', t)} />
                  ))}
                </View>
              </View>
            )}
            <SwitchRow icon="bell" label="Rappels et échéances" value={data.notif.rappels} onChange={(v) => setNotif('rappels', v)} />
            <SwitchRow icon="cake" label="Anniversaires" value={data.notif.anniversaires} onChange={(v) => setNotif('anniversaires', v)} />
            <SwitchRow icon="heart" label="Envies de 30 jours" value={data.notif.envies} onChange={(v) => setNotif('envies', v)} />
            <AppText variant="caption" style={styles.hint}>
              Les rappels se règlent aussi sur chaque rendez-vous, tâche et anniversaire.
            </AppText>
          </Section>
        )}

        <Section title="Catégories">
          {data?.categories.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/categorie/${c.id}`)}
              accessibilityRole="button"
              accessibilityHint="Modifier la catégorie"
              style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { opacity: 0.6 }]}>
              <View style={[styles.swatch, { backgroundColor: c.color }]} />
              <AppText variant="bodyMedium" style={{ flex: 1 }}>
                {c.name}
              </AppText>
              <Icon name="edit" size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push('/categorie/nouvelle')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { opacity: 0.6 }]}>
            <Icon name="plus" size={16} color={colors.textSecondary} />
            <AppText variant="bodyMedium" color={colors.textSecondary} style={{ flex: 1 }}>
              Nouvelle catégorie
            </AppText>
          </Pressable>
          <AppText variant="caption" style={styles.hint}>
            Chaque agenda Google importé peut recevoir une catégorie, juste en dessous.
          </AppText>
        </Section>

        <Section title="Google Agenda">
          <GoogleCalendarSettings categories={data?.categories ?? []} />
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
            <Pressable
              onPress={async () => {
                if (await testNotification()) showDialog('Notification dans 10 s', 'Tu peux quitter l’app pour la voir arriver.');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.devBtn, pressed && { opacity: 0.7 }]}>
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }}>Notification de test (10 s)</AppText>
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
