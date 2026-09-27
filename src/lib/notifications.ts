import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import AlarmClock, { type AlarmSpec } from '../../modules/alarm-clock';
import DayNotification, { type DayUpdate } from '../../modules/day-notification';

import { getDayUpdates, getNotifSettings, planNotifications, type NotifChannel, type PlannedNotif } from '@/db/notification-plan';
import { dayKey, parseStamp, shiftDay } from '@/lib/dates';

/*
 * Notifications locales (rien ne passe par un serveur) :
 * - « Ma journée » : notification épinglée, remplacée chaque matin et à chaque changement ;
 * - rappels planifiés (rendez-vous, tâches, échéances, anniversaires, envies), tous replanifiés
 *   à chaque synchronisation — le plan complet vient de db/notification-plan ;
 * - alarmes (rendez-vous, objectifs, suivis) : sonnerie et écran plein, par le module natif alarm-clock
 *   (sans lui, en Expo Go : de simples notifications).
 */

const JOURNEE_ID = 'journee';
const JOURNEE_CHANNEL = 'journee';

const CHANNELS: { id: NotifChannel | typeof JOURNEE_CHANNEL; name: string; description: string; importance: Notifications.AndroidImportance }[] = [
  { id: JOURNEE_CHANNEL, name: 'Ma journée', description: 'Résumé épinglé : rendez-vous du jour, anniversaires, retards.', importance: Notifications.AndroidImportance.LOW },
  { id: 'rappels', name: 'Rappels', description: 'Avant un rendez-vous ou l’échéance d’une tâche.', importance: Notifications.AndroidImportance.HIGH },
  { id: 'retards', name: 'Échéances passées', description: 'Échéance dépassée et relances quotidiennes.', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'anniversaires', name: 'Anniversaires', description: 'J-7, J-1, le jour même et le cadeau à acheter.', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'envies', name: 'Envies', description: 'Une envie qui attend depuis 30 jours.', importance: Notifications.AndroidImportance.LOW },
];

let ready: Promise<boolean> | null = null;

/** Canaux Android, affichage quand l'app est ouverte, puis demande d'autorisation (une seule fois). */
export function setupNotifications() {
  ready ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        const pinned = n.request.content.data?.kind === JOURNEE_ID;
        return { shouldShowBanner: !pinned, shouldShowList: true, shouldPlaySound: !pinned, shouldSetBadge: false };
      },
    });
    if (Platform.OS === 'android') {
      for (const c of CHANNELS) {
        await Notifications.setNotificationChannelAsync(c.id, {
          name: c.name,
          description: c.description,
          importance: c.importance,
          lightColor: '#F4F4F2',
        });
      }
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  })();
  return ready;
}

export async function notificationsAllowed() {
  return (await Notifications.getPermissionsAsync()).granted;
}

let running: Promise<void> | null = null;
let again = false;

/** Recalcule et replanifie tout. Les appels rapprochés sont regroupés (un seul calcul à la fois). */
export function syncNotifications(db: SQLiteDatabase) {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce(db);
      } while (again);
    } catch (e) {
      console.warn('Notifications : synchronisation impossible', e);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(db: SQLiteDatabase) {
  if (!(await setupNotifications())) return;
  const now = new Date();
  const settings = await getNotifSettings(db);
  const plan = await planNotifications(db, settings, now);

  // Alarmes : au module natif s'il est là, sinon notifications comme les autres.
  const alarms = AlarmClock ? plan.filter((n) => n.alarm) : [];
  AlarmClock?.setAlarms(JSON.stringify(alarms.map(alarmSpec)));

  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of plan) {
    if (AlarmClock && n.alarm) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: { url: n.url }, color: '#F4F4F2' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: n.channel },
    });
  }

  /*
   * « Ma journée » : celle d'aujourd'hui tout de suite (après l'heure choisie), puis ses mises à jour
   * (rdv terminé, échéance passée…) et celles du prochain matin, planifiées d'avance.
   */
  if (!settings.journee) {
    await Notifications.dismissNotificationAsync(JOURNEE_ID);
    DayNotification?.cancel();
    return;
  }
  const today = dayKey(now);
  const todayAt = parseStamp(`${today}T${settings.journeeTime}`);
  const current = now >= todayAt ? await getDayUpdates(db, today, now) : [];
  const nextDay = now >= todayAt ? shiftDay(today, 1) : today;
  const nextAt = parseStamp(`${nextDay}T${settings.journeeTime}`);
  const next = await getDayUpdates(db, nextDay, nextAt);

  // Build natif de l'app : mise en page de la maquette (modules/day-notification).
  if (DayNotification) {
    await Notifications.dismissNotificationAsync(JOURNEE_ID); // ancienne version texte
    const updates: DayUpdate[] = [...current, ...next].map((u) => ({ at: u.at.getTime(), payload: u.summary.payload }));
    DayNotification.plan(JSON.stringify(updates));
    return;
  }

  // Sinon (Expo Go) : notification texte standard, sans les mises à jour de la journée.
  if (current.length) {
    await Notifications.scheduleNotificationAsync({
      identifier: JOURNEE_ID,
      content: journeeContent(current[0].summary.title, current[0].summary.body),
      trigger: { channelId: JOURNEE_CHANNEL }, // tout de suite, dans le canal « Ma journée »
    });
  }
  await Notifications.scheduleNotificationAsync({
    identifier: JOURNEE_ID,
    content: journeeContent(next[0].summary.title, next[0].summary.body),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextAt, channelId: JOURNEE_CHANNEL },
  });
}

/** Lien profond vers l'écran de l'alarme (« Ouvrir dans l'app »), avec le schéma de cette variante de l'app. */
function alarmSpec(n: PlannedNotif): AlarmSpec {
  const scheme = [Constants.expoConfig?.scheme].flat()[0] ?? 'mypersonallife';
  return { id: n.id, at: n.at.getTime(), title: n.title, body: n.body, link: `${scheme}://${n.url.replace(/^\//, '')}`, health: n.health };
}

/** Android 14+ : l'écran plein des alarmes demande une autorisation (accordée d'office hors Play Store, en général). */
export function alarmsFullScreenAllowed() {
  return AlarmClock ? AlarmClock.canUseFullScreen() : true;
}

export function openAlarmFullScreenSettings() {
  AlarmClock?.openFullScreenSettings();
}

export const nativeAlarms = !!AlarmClock;

/** Développement : une alarme dans 10 s (sans le module natif, rien). */
export function testAlarm() {
  if (!AlarmClock) return false;
  AlarmClock.test(10, 'Alarme de test', 'Arrêter, répéter ou ouvrir');
  return true;
}

function journeeContent(title: string, body: string): Notifications.NotificationContentInput {
  return {
    title,
    body,
    subtitle: 'Ma journée',
    data: { url: '/', kind: JOURNEE_ID },
    sticky: true,
    autoDismiss: false,
    color: '#F4F4F2',
  };
}

/** Toucher une notification ouvre l'écran lié (au lancement de l'app comme quand elle tourne). */
export function listenNotificationTaps() {
  const open = (n: Notifications.Notification) => {
    const url = n.request.content.data?.url;
    if (typeof url === 'string' && url !== '/') router.push(url as never);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last?.notification) {
    open(last.notification);
    Notifications.clearLastNotificationResponse();
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
  return () => sub.remove();
}

/** Développement : un rappel dans 10 s (canal « Rappels »), qui ouvre les envies au toucher. */
export async function testNotification() {
  if (!(await setupNotifications())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Point équipe', body: 'dans 15 min · 09:30 · Salle B', data: { url: '/envies' }, color: '#F4F4F2' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 10, channelId: 'rappels' },
  });
  return true;
}
