import {
  aggregateRecord, getGrantedPermissions, getSdkStatus, initialize, openHealthConnectSettings, readRecords,
  requestPermission, SdkAvailabilityStatus,
} from 'react-native-health-connect';

import type { HealthMetric, HealthNight } from './health';

export type { HealthMetric, HealthNight } from './health';

/*
 * Lecture de Health Connect (pas et sommeil), où Zepp et les autres apps santé écrivent leurs
 * données. Tout reste sur le téléphone. Aucune fonction ne lève d'erreur : sans Health Connect
 * ou sans permission, on renvoie simplement « rien ».
 */

const RECORD = { steps: 'Steps', sleep: 'SleepSession' } as const;

export const healthSupported = true;

let ready: Promise<boolean> | null = null;

/** Health Connect installé et client initialisé (une fois par lancement). */
export function healthAvailable() {
  ready ??= (async () => {
    try {
      if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
      return await initialize();
    } catch {
      return false;
    }
  })().then((ok) => {
    if (!ok) ready = null; // Health Connect a pu être installé entre-temps : on réessaiera.
    return ok;
  });
  return ready;
}

/** Ouvre la demande d'accès en lecture ; renvoie true si l'accès est accordé. */
export async function requestHealthAccess(metric: HealthMetric) {
  if (!(await healthAvailable())) return false;
  try {
    const granted = await requestPermission([{ accessType: 'read', recordType: RECORD[metric] }]);
    return granted.some((p) => p.accessType === 'read' && p.recordType === RECORD[metric]);
  } catch {
    return false;
  }
}

export async function grantedHealthMetrics() {
  const out = new Set<HealthMetric>();
  if (!(await healthAvailable())) return out;
  try {
    const granted = await getGrantedPermissions();
    for (const m of Object.keys(RECORD) as HealthMetric[]) {
      if (granted.some((p) => p.accessType === 'read' && p.recordType === RECORD[m])) out.add(m);
    }
  } catch {}
  return out;
}

/**
 * Pas de chaque jour entre `from` et `to` (minuits locaux). L'agrégat de Health Connect
 * dédoublonne les sources (montre, téléphone) selon les priorités réglées par l'utilisateur.
 * Les jours sans aucune donnée sont omis.
 */
export async function readDailySteps(from: Date, to: Date) {
  const out: { start: Date; count: number }[] = [];
  for (let d = new Date(from); d < to; d = nextMidnight(d)) {
    const end = nextMidnight(d);
    const res = await aggregateRecord({
      recordType: 'Steps',
      timeRangeFilter: { operator: 'between', startTime: d.toISOString(), endTime: end.toISOString() },
    });
    if (res.dataOrigins.length) out.push({ start: new Date(d), count: res.COUNT_TOTAL });
  }
  return out;
}

/** Sessions de sommeil qui se terminent entre `from` et `to`. */
export async function readNights(from: Date, to: Date): Promise<HealthNight[]> {
  const nights: HealthNight[] = [];
  let pageToken: string | undefined;
  do {
    const res = await readRecords('SleepSession', {
      // Une nuit commence la veille : on élargit le début pour ne pas la couper.
      timeRangeFilter: { operator: 'between', startTime: new Date(from.getTime() - 86_400_000).toISOString(), endTime: to.toISOString() },
      pageToken,
    });
    for (const r of res.records) {
      const end = new Date(r.endTime);
      if (end >= from && end < to) nights.push({ start: new Date(r.startTime), end });
    }
    pageToken = res.pageToken || undefined;
  } while (pageToken);
  return nights;
}

export function openHealthSettings() {
  try {
    openHealthConnectSettings();
  } catch {}
}

function nextMidnight(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
