/*
 * Health Connect n'existe que sur Android (voir health.android.ts) : ailleurs, rien n'est lu.
 * Les deux fichiers exposent la même API.
 */

export type HealthMetric = 'steps' | 'sleep';

/** Une nuit lue dans Health Connect : début et fin, en heure locale. */
export type HealthNight = { start: Date; end: Date };

export const healthSupported = false;

export async function healthAvailable() {
  return false;
}

export async function requestHealthAccess(_metric: HealthMetric) {
  return false;
}

export async function grantedHealthMetrics(): Promise<Set<HealthMetric>> {
  return new Set();
}

export async function readDailySteps(_from: Date, _to: Date): Promise<{ start: Date; count: number }[]> {
  return [];
}

export async function readNights(_from: Date, _to: Date): Promise<HealthNight[]> {
  return [];
}

export function openHealthSettings() {}
