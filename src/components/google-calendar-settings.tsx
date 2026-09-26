import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { Chip, SwitchRow } from '@/components/form/fields';
import { getGoogleSettings, setCalendarCategory, setCalendarEnabled } from '@/db/google';
import { invalidate, useDbMutation, useDbQuery } from '@/db/use-query';
import { lateSince } from '@/lib/dates';
import {
  calendarAllowed, calendarSupported, listPhoneCalendars, type PhoneCalendar, requestCalendarAccess, syncGoogle,
} from '@/lib/google-calendar';
import { colors, fonts } from '@/theme/tokens';

type Category = { id: number; key: string; name: string; color: string };

/** Réglages › Google Agenda : accès, agendas importés et leur catégorie, synchro. */
export function GoogleCalendarSettings({ categories }: { categories: Category[] }) {
  const mutate = useDbMutation();
  const [syncing, setSyncing] = useState(false);
  const { data } = useDbQuery(async (db) => {
    const allowed = await calendarAllowed();
    const [settings, calendars] = await Promise.all([
      getGoogleSettings(db),
      allowed ? listPhoneCalendars() : Promise.resolve([] as PhoneCalendar[]),
    ]);
    return { allowed, settings, calendars };
  });

  if (!calendarSupported) {
    return (
      <AppText variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>
        Disponible sur Android seulement.
      </AppText>
    );
  }
  if (!data) return <View style={{ height: 46 }} />;

  const sync = async () => {
    setSyncing(true);
    try {
      await mutate(syncGoogle);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      showDialog('Synchro impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const allow = async () => {
    // Refusé une fois pour de bon : seuls les réglages du téléphone peuvent le rendre.
    if (!(await requestCalendarAccess())) Linking.openSettings();
    invalidate();
  };

  const toggle = async (id: string, on: boolean) => {
    Haptics.selectionAsync();
    await mutate((db) => setCalendarEnabled(db, id, on));
    if (on) sync();
  };

  const setCategory = (id: string, categoryId: number | null) => {
    Haptics.selectionAsync();
    mutate((db) => setCalendarCategory(db, id, categoryId));
  };

  if (!data.allowed) {
    return (
      <View style={{ gap: 10 }}>
        <AppText variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>
          Affiche les rendez-vous de tes agendas Google (ceux synchronisés sur le téléphone), en lecture seule :
          rien n&apos;est renvoyé vers Google.
        </AppText>
        <Pressable onPress={allow} accessibilityRole="button" style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}>
          <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }}>Autoriser l&apos;accès à l&apos;agenda</AppText>
        </Pressable>
      </View>
    );
  }

  const { settings, calendars } = data;
  const enabledCount = calendars.filter((c) => c.id in settings.calendars).length;

  return (
    <View style={{ gap: 4 }}>
      {calendars.length === 0 && (
        <AppText variant="body" color={colors.textSecondary} style={{ lineHeight: 20 }}>
          Aucun agenda sur le téléphone. Ajoute ton compte Google dans les réglages d&apos;Android.
        </AppText>
      )}
      {calendars.map((c, i) => {
        const on = c.id in settings.calendars;
        const catId = settings.calendars[c.id] ?? null;
        return (
          <View key={c.id} style={[{ gap: 8, paddingVertical: 4 }, i > 0 && styles.rowBorder]}>
            <SwitchRow
              label={c.title}
              sub={c.account === c.title ? undefined : c.account}
              dot={c.color}
              value={on}
              onChange={(v) => toggle(c.id, v)}
            />
            {on && (
              <View style={styles.chips}>
                <Chip label="Sans catégorie" selected={catId === null} onPress={() => setCategory(c.id, null)} />
                {categories
                  .filter((k) => k.key !== 'birthday')
                  .map((k) => (
                    <Chip key={k.id} label={k.name} dot={k.color} selected={catId === k.id} onPress={() => setCategory(c.id, k.id)} />
                  ))}
              </View>
            )}
          </View>
        );
      })}

      {enabledCount > 0 && (
        <View style={{ gap: 10, paddingTop: 8 }}>
          <AppText variant="caption">
            Lecture seule, relue à chaque ouverture de l&apos;app (2 mois passés, 1 an à venir).
            {settings.lastSync ? ` Dernière synchro : ${lastSyncLabel(settings.lastSync)}.` : ''}
          </AppText>
          <Pressable
            onPress={sync}
            disabled={syncing}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, (pressed || syncing) && { opacity: 0.7 }]}>
            {syncing ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 14 }}>Synchroniser maintenant</AppText>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function lastSyncLabel(at: string) {
  const ago = lateSince(at);
  return ago === "il y a moins d'1 h" ? `à ${at.slice(11, 16)}` : ago.replace('depuis hier', 'hier');
}

const styles = StyleSheet.create({
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 22, paddingBottom: 6 },
  btn: {
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
