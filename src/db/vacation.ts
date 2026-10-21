import type { SQLiteDatabase } from 'expo-sqlite';

/*
 * Mode vacances : un simple interrupteur gardé dans settings. Tant qu'il est actif, les objectifs et
 * les tâches « liés à la maison » se taisent : objectifs au repos (la série ne casse pas), ni alarme ni rappel.
 */
const KEY = 'vacances';

export async function getVacation(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', KEY);
  return row?.value === '1';
}

export async function setVacation(db: SQLiteDatabase, on: boolean) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    KEY, on ? '1' : '0',
  );
}
