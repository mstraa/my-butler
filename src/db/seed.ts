import type { SQLiteDatabase } from 'expo-sqlite';

import { nowStamp, shiftDay, todayKey } from '@/lib/dates';
import { categoryColors } from '@/theme/tokens';

export const DEFAULT_CATEGORIES = [
  { key: 'work', name: 'Travail', color: categoryColors.work, icon: 'work' },
  { key: 'friends', name: 'Potes', color: categoryColors.friends, icon: 'friends' },
  { key: 'family', name: 'Famille', color: categoryColors.family, icon: 'home' },
  { key: 'health', name: 'Santé', color: categoryColors.health, icon: 'health' },
  { key: 'groceries', name: 'Courses', color: categoryColors.groceries, icon: 'cart' },
  { key: 'sport', name: 'Sport', color: categoryColors.sport, icon: 'sport' },
  { key: 'birthday', name: 'Anniversaire', color: categoryColors.birthday, icon: 'cake' },
  { key: 'personal', name: 'Perso', color: categoryColors.personal, icon: 'note' },
] as const;

/**
 * Catégories par défaut + quelques données d'exemple placées autour d'aujourd'hui,
 * pour que l'app ne soit pas vide au premier lancement. Elles sont marquées
 * (settings.demo_data = '1') et s'effacent depuis les Réglages.
 */
export async function seedDemoData(db: SQLiteDatabase) {
  const t = todayKey();
  const at = (offset: number, hhmm: string) => `${shiftDay(t, offset)}T${hhmm}`;
  const created = nowStamp();

  await db.withTransactionAsync(async () => {
    for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
      await db.runAsync(
        'INSERT INTO categories (key, name, color, icon, sort) VALUES (?, ?, ?, ?, ?)',
        c.key, c.name, c.color, c.icon, i,
      );
    }
    const cats = await db.getAllAsync<{ id: number; key: string }>('SELECT id, key FROM categories');
    const cat = (key: string) => cats.find((c) => c.key === key)?.id ?? null;

    const ev = (
      title: string, start: string, end: string | null, catKey: string,
      extra: { icon?: string; location?: string; cancel?: string; deadline?: string; deadlineLabel?: string } = {},
    ) =>
      db.runAsync(
        `INSERT INTO events (title, starts_at, ends_at, category_id, icon, location,
           cancelled_at, cancel_reason, cancel_mode, deadline_at, deadline_label, deadline_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        title, start, end, cat(catKey), extra.icon ?? null, extra.location ?? null,
        extra.cancel ? created : null, extra.cancel ?? null, extra.cancel ? 'keep' : null,
        extra.deadline ?? null, extra.deadlineLabel ?? null, extra.deadline ? 'open' : null, created,
      );

    await ev('1:1 manager', at(-1, '09:00'), at(-1, '09:30'), 'work');
    await ev('Ciné', at(-1, '20:00'), null, 'friends', { icon: 'glass' });
    await ev('Point équipe', at(0, '09:30'), at(0, '10:30'), 'work', { location: 'Salle B' });
    await ev('Déjeuner avec Julie', at(0, '12:30'), null, 'friends');
    await ev('Kiné', at(0, '14:30'), null, 'health', { cancel: 'Empêchement' });
    await ev('Apéro chez Tom', at(1, '19:00'), null, 'friends', { icon: 'glass' });
    await ev('Réunion', at(3, '09:00'), at(3, '10:00'), 'work');
    await ev('Sport', at(3, '18:00'), null, 'sport');
    await ev('Client', at(4, '10:00'), null, 'work');
    await ev('Dîner chez Marc', at(8, '20:00'), null, 'friends', {
      icon: 'glass', deadline: at(-2, '18:00'), deadlineLabel: 'Confirmer',
    });

    const task = (title: string, day: string | null, due: string | null, catKey: string, tracks = 0, estimate: number | null = null) =>
      db.runAsync(
        `INSERT INTO tasks (title, day, due_at, category_id, tracks_expense, estimate_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        title, day, due, cat(catKey), tracks, estimate, created,
      );
    await task('Faire les courses', shiftDay(t, 0), at(0, '19:00'), 'groceries', 1);
    await task('Renvoyer dossier mutuelle', shiftDay(t, -1), at(-1, '18:00'), 'personal');
    await task('Payer facture électricité', shiftDay(t, -3), at(-3, '12:00'), 'personal', 1, 8400);

    // Dépenses : quelques-unes ce mois-ci et le mois dernier (comparaison).
    const spend = (label: string, cents: number, offset: number, hhmm: string, catKey: string) =>
      db.runAsync(
        'INSERT INTO expenses (amount_cents, label, category_id, spent_at) VALUES (?, ?, ?, ?)',
        cents, label, cat(catKey), at(offset, hhmm),
      );
    await spend('Courses Carrefour', 5840, -2, '18:20', 'groceries');
    await spend('Cadeau Julie', 3200, -3, '12:10', 'birthday');
    await spend('Ciné', 1150, -1, '19:45', 'friends');
    await spend('Pharmacie', 1290, -8, '10:05', 'health');
    await spend('Boulangerie', 420, -8, '08:30', 'groceries');
    await spend('Salle de sport', 2990, -12, '07:00', 'sport');
    await spend('Courses Lidl', 6310, -34, '17:40', 'groceries');
    await spend('Resto', 4200, -40, '20:30', 'friends');
    await spend('Abonnement sport', 2990, -42, '07:00', 'sport');

    const year = Number(t.slice(0, 4));
    const bday = (name: string, offset: number, age: number | null, catKey: string) => {
      const k = shiftDay(t, offset);
      return db.runAsync(
        'INSERT INTO birthdays (name, month, day, year, category_id) VALUES (?, ?, ?, ?, ?)',
        name, Number(k.slice(5, 7)), Number(k.slice(8, 10)), age === null ? null : year - age, cat(catKey),
      );
    };
    await bday('Julie', 1, 30, 'friends');
    await bday('Marc', 8, 34, 'friends');
    await bday('Maman', 22, null, 'family');
    const marc = (await db.getFirstAsync<{ id: number }>("SELECT id FROM birthdays WHERE name = 'Marc'"))!.id;
    for (const [title, price] of [['Places de concert', 9000], ['Bon pour un resto', null]] as const) {
      await db.runAsync(
        'INSERT INTO gift_ideas (birthday_id, title, price_cents, created_at) VALUES (?, ?, ?, ?)', marc, title, price, created,
      );
    }
    for (const [ago, title, price] of [[1, 'Casque vélo', 6500], [2, 'Jeu de société', 4000], [3, 'Bouteille de whisky', 5500]] as const) {
      await db.runAsync(
        'INSERT INTO gifts_given (birthday_id, year, title, price_cents) VALUES (?, ?, ?, ?)', marc, year - ago, title, price,
      );
    }

    const goal = (key: string, title: string, kind: string, target: number, unit: string | null, sort: number, icon: string) =>
      db.runAsync(
        "INSERT INTO goals (key, title, period, kind, target, unit, sort, icon) VALUES (?, ?, 'day', ?, ?, ?, ?, ?)",
        key, title, kind, target, unit, sort, icon,
      );
    await goal('fruits', 'Fruits & légumes', 'counter', 5, null, 0, 'fruit');
    await goal('steps', 'Pas', 'value', 8000, 'pas', 1, 'steps');
    await goal('reading', 'Lecture', 'duration', 20, 'min', 2, 'book');
    await goal('vitamins', 'Vitamines', 'bool', 1, null, 3, 'pill');
    // Objectifs de la semaine et du mois (onglet Objectifs, vue Semaine).
    await db.runAsync(
      "INSERT INTO goals (key, title, period, kind, target, unit, sort, icon) VALUES ('sport', 'Sport', 'week', 'counter', 3, 'séances', 4, 'sport')",
    );
    await db.runAsync(
      "INSERT INTO goals (key, title, period, kind, target, unit, sort, icon) VALUES ('books', 'Livres', 'month', 'counter', 1, 'livre', 5, 'book')",
    );
    const goals = await db.getAllAsync<{ id: number; key: string }>('SELECT id, key FROM goals');
    const g = (key: string) => goals.find((x) => x.key === key)!.id;
    for (const [key, value] of [['fruits', 3], ['steps', 4200], ['reading', 25], ['vitamins', 1]] as const) {
      await db.runAsync('INSERT INTO goal_entries (goal_id, day, value) VALUES (?, ?, ?)', g(key), t, value);
    }
    // Série en cours : fruits atteints les 4 jours précédents ; une séance de sport hier.
    for (let d = 1; d <= 4; d++) {
      await db.runAsync('INSERT INTO goal_entries (goal_id, day, value) VALUES (?, ?, 5)', g('fruits'), shiftDay(t, -d));
    }
    await db.runAsync('INSERT INTO goal_entries (goal_id, day, value) VALUES (?, ?, 1)', g('sport'), shiftDay(t, -1));

    // Pas de suivi par défaut : l'onglet Suivi invite à créer les siens.

    // Quelques envies d'achat, dont une qui attend depuis plus de 30 jours.
    for (const [title, cents, days, level, url] of [
      ['Casque audio', 32900, 44, 'besoin', 'https://www.fnac.com/'],
      ['Veste de pluie', 14900, 23, 'envie', null],
      ['Lampe de bureau', 8900, 15, 'bof', null],
      ['Clavier mécanique', 17900, 5, 'envie', 'https://www.ldlc.com/'],
    ] as const) {
      await db.runAsync(
        "INSERT INTO wishes (title, url, price_cents, level, source, state, created_at) VALUES (?, ?, ?, ?, ?, 'waiting', ?)",
        title, url, cents, level, url ? 'lien' : null, at(-days, '20:00'),
      );
    }
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('demo_data', '1')");
  });
}

/** Efface toutes les données (exemple compris) en gardant les catégories. */
export async function clearAllData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM gift_ideas; DELETE FROM gifts_given; DELETE FROM birthdays;
      DELETE FROM deadline_log; DELETE FROM expenses; DELETE FROM tasks; DELETE FROM events;
      DELETE FROM goal_entries; DELETE FROM goals; DELETE FROM sleep_log; DELETE FROM eliquid_log;
      DELETE FROM tracker_entries; DELETE FROM trackers;
      DELETE FROM wishes; DELETE FROM budgets; DELETE FROM day_notes;
      DELETE FROM settings WHERE key = 'demo_data' OR key LIKE 'chrono:%';
    `);
  });
}
