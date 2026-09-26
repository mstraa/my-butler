import type { SQLiteDatabase } from 'expo-sqlite';

import { clearAllData } from '@/db/seed';
import { type DayKey, nowStamp, shiftDay, todayKey } from '@/lib/dates';
import { categoryColors } from '@/theme/tokens';

/*
 * Données de test (Réglages, mode développement) : remplace toutes les données par un jeu fourni
 * sur plusieurs mois — agenda chargé, tâches en retard, dépenses sur 4 mois, historique d'objectifs,
 * une quinzaine d'anniversaires. Tirages pseudo-aléatoires mais reproductibles (même graine).
 * Marqué comme données d'exemple : « Effacer les données d'exemple » le retire.
 */

/** Petit générateur pseudo-aléatoire (mulberry32) : même suite à chaque chargement. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENTS: [string, string, string?][] = [
  ['Point équipe', 'work', 'Salle B'], ['Réunion projet', 'work'], ['Client', 'work', 'Visio'], ['1:1 manager', 'work'],
  ['Revue de sprint', 'work'], ['Déjeuner avec Julie', 'friends'], ['Apéro', 'friends'], ['Ciné', 'friends'],
  ['Resto', 'friends'], ['Dîner chez maman', 'family'], ['Appel famille', 'family'], ['Médecin', 'health', 'Cabinet Dr Martin'],
  ['Dentiste', 'health'], ['Kiné', 'health'], ['Yoga', 'sport'], ['Piscine', 'sport'], ['Coiffeur', 'personal'],
  ['Garage', 'personal'], ['Courses du week-end', 'groceries'],
];
const TASKS: [string, string, number?][] = [
  ['Renvoyer dossier mutuelle', 'personal'], ['Payer facture électricité', 'personal', 8400], ['Appeler le plombier', 'personal'],
  ['Préparer présentation', 'work'], ['Répondre au client', 'work'], ['Faire les courses', 'groceries', 6000],
  ['Acheter cadeau', 'friends', 3500], ['Prendre RDV ophtalmo', 'health'], ['Réserver billets de train', 'personal', 12000],
  ['Renouveler abonnement salle', 'sport', 2990], ['Déclarer impôts', 'personal'], ['Rendre les livres', 'personal'],
  ['Changer les pneus', 'personal', 30000], ['Envoyer photos à maman', 'family'], ['Commander lunettes', 'health', 18000],
];
const SPENDS: [string, string, number, number][] = [
  // libellé, catégorie, montant mini, montant maxi (centimes)
  ['Courses Carrefour', 'groceries', 2500, 9500], ['Boulangerie', 'groceries', 250, 900], ['Marché', 'groceries', 800, 3500],
  ['Resto', 'friends', 1800, 6500], ['Bar', 'friends', 800, 3000], ['Ciné', 'friends', 900, 1500],
  ['Pharmacie', 'health', 500, 3500], ['Médecin', 'health', 2500, 5000], ['Salle de sport', 'sport', 2990, 2990],
  ['Équipement sport', 'sport', 1500, 8000], ['Cadeau', 'birthday', 2000, 6000], ['Essence', 'personal', 4000, 8000],
  ['Abonnement streaming', 'personal', 1399, 1399], ['Livres', 'personal', 800, 3000], ['Sortie famille', 'family', 2000, 7000],
];
const NAMES = [
  'Julie', 'Marc', 'Maman', 'Papa', 'Tom', 'Léa', 'Hugo', 'Chloé', 'Nico', 'Sarah', 'Mamie', 'Paul', 'Inès', 'Karim', 'Emma',
];
const GIFTS = ['Livre', 'Places de concert', 'Bon resto', 'Parfum', 'Jeu de société', 'Plante', 'Vinyle', 'Casque audio', 'Bougie', 'Carnet'];

export async function seedTestData(db: SQLiteDatabase) {
  await clearAllData(db);
  const r = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const between = (a: number, b: number) => Math.round(a + r() * (b - a));
  const t = todayKey();
  const created = nowStamp();
  const hh = (h: number, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  await db.withTransactionAsync(async () => {
    const cats = await db.getAllAsync<{ id: number; key: string }>('SELECT id, key FROM categories');
    const cat = (key: string) => cats.find((c) => c.key === key)?.id ?? null;

    /* Rendez-vous : 60 jours avant → 45 jours après, 0 à 3 par jour, quelques annulés. */
    for (let d = -60; d <= 45; d++) {
      const day = shiftDay(t, d);
      const n = between(0, 3);
      for (let i = 0; i < n; i++) {
        const [title, catKey, location] = pick(EVENTS);
        const h = between(8, 20);
        const start = `${day}T${hh(h, pick([0, 15, 30, 45]))}`;
        const end = r() < 0.6 ? `${day}T${hh(Math.min(23, h + between(1, 2)), 0)}` : null;
        const cancelled = r() < 0.07;
        await db.runAsync(
          `INSERT INTO events (title, starts_at, ends_at, category_id, location, reminder_min,
             cancelled_at, cancel_reason, cancel_mode, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          title, start, end, cat(catKey), location ?? null, pick([null, 15, 60]),
          cancelled ? created : null, cancelled ? pick(['Empêchement', 'Malade', "Annulé par l'autre"]) : null,
          cancelled ? 'keep' : null, created,
        );
      }
    }
    // Répétés : sport le lundi et le jeudi, réunion d'équipe le mardi.
    const monday = shiftDay(t, -((new Date().getDay() + 6) % 7) - 56);
    await db.runAsync(
      "INSERT INTO events (title, starts_at, ends_at, category_id, recurrence, created_at) VALUES ('Sport', ?, ?, ?, 'weekly', ?)",
      `${monday}T18:30`, `${monday}T19:30`, cat('sport'), created,
    );
    await db.runAsync(
      "INSERT INTO events (title, starts_at, ends_at, category_id, recurrence, created_at) VALUES ('Sport', ?, ?, ?, 'weekly', ?)",
      `${shiftDay(monday, 3)}T18:30`, `${shiftDay(monday, 3)}T19:30`, cat('sport'), created,
    );
    await db.runAsync(
      "INSERT INTO events (title, starts_at, ends_at, category_id, location, recurrence, created_at) VALUES ('Réunion d''équipe', ?, ?, ?, 'Salle B', 'weekly', ?)",
      `${shiftDay(monday, 1)}T10:00`, `${shiftDay(monday, 1)}T11:00`, cat('work'), created,
    );
    // Rendez-vous à venir avec une échéance (dont une déjà passée → « En retard »).
    for (const [title, days, due, label] of [['Dîner chez Marc', 8, -2, 'Confirmer'], ['Mariage de Léa', 30, 10, 'Répondre au faire-part']] as const) {
      await db.runAsync(
        `INSERT INTO events (title, starts_at, category_id, deadline_at, deadline_label, deadline_state, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
        title, `${shiftDay(t, days)}T20:00`, cat('friends'), `${shiftDay(t, due)}T18:00`, label, created,
      );
    }

    /* Tâches : passées (faites, abandonnées ou en retard) et à venir. */
    for (let i = 0; i < 45; i++) {
      const [title, catKey, estimate] = pick(TASKS);
      const d = between(-30, 30);
      const day = shiftDay(t, d);
      const due = r() < 0.8 ? `${day}T${hh(between(9, 20))}` : null;
      const past = d < 0;
      const state = past ? (r() < 0.75 ? 'done' : r() < 0.3 ? 'abandoned' : 'open') : r() < 0.1 ? 'done' : 'open';
      const tracks = estimate !== undefined ? 1 : 0;
      const res = await db.runAsync(
        `INSERT INTO tasks (title, day, due_at, category_id, tracks_expense, estimate_cents, state, state_at,
                            reminder_min, show_late, nag_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        title, day, due, cat(catKey), tracks, estimate ?? null, state, state === 'open' ? null : `${day}T${hh(18)}`,
        due ? pick([null, 60, 1440]) : null, due ? pick([null, '09:00']) : null, created,
      );
      if (state === 'done' && tracks) {
        await db.runAsync(
          'INSERT INTO expenses (amount_cents, label, category_id, spent_at, task_id) VALUES (?, ?, ?, ?, ?)',
          Math.round((estimate ?? 0) * (0.8 + r() * 0.4)), title, cat(catKey), `${day}T${hh(18)}`, res.lastInsertRowId,
        );
      }
      if (past && due && r() < 0.3) {
        await db.runAsync(
          "INSERT INTO deadline_log (item_type, item_id, action, at, from_due, to_due) VALUES ('task', ?, 'postponed', ?, ?, ?)",
          res.lastInsertRowId, `${shiftDay(day, -2)}T20:00`, `${shiftDay(day, -2)}T18:00`, due,
        );
      }
    }

    /* Dépenses : 4 mois, 0 à 4 par jour ; budgets sur les deux derniers mois. */
    for (let d = -120; d <= 0; d++) {
      const day = shiftDay(t, d);
      const n = between(0, 4);
      for (let i = 0; i < n; i++) {
        const [label, catKey, min, max] = pick(SPENDS);
        await db.runAsync(
          'INSERT INTO expenses (amount_cents, label, category_id, spent_at) VALUES (?, ?, ?, ?)',
          between(min, max), label, cat(catKey), `${day}T${hh(between(8, 21), between(0, 59))}`,
        );
      }
    }
    // Ce mois-ci sous le budget, le mois dernier au-dessus : les deux états de la barre.
    await db.runAsync('INSERT INTO budgets (month, amount_cents) VALUES (?, 300000)', t.slice(0, 7));
    await db.runAsync('INSERT INTO budgets (month, amount_cents) VALUES (?, 180000)', shiftDay(`${t.slice(0, 8)}01`, -1).slice(0, 7));

    /* Objectifs, avec 60 jours d'historique (atteints ~70 % du temps). */
    const goals: [string, string, string, string, number, string | null, string][] = [
      ['fruits', 'Fruits & légumes', 'day', 'counter', 5, null, 'fruit'],
      ['steps', 'Pas', 'day', 'value', 8000, 'pas', 'steps'],
      ['reading', 'Lecture', 'day', 'duration', 20, 'min', 'book'],
      ['vitamins', 'Vitamines', 'day', 'bool', 1, null, 'pill'],
      ['water', 'Eau', 'day', 'counter', 8, 'verres', 'drop'],
      ['sport', 'Sport', 'week', 'counter', 3, 'séances', 'sport'],
      ['books', 'Livres', 'month', 'counter', 2, 'livres', 'book'],
    ];
    for (const [i, [key, title, period, kind, target, unit, icon]] of goals.entries()) {
      const res = await db.runAsync(
        'INSERT INTO goals (key, title, period, kind, target, unit, sort, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        key, title, period, kind, target, unit, i, icon,
      );
      const id = res.lastInsertRowId;
      for (let d = -60; d <= 0; d++) {
        const day: DayKey = shiftDay(t, d);
        let v = 0;
        if (period === 'day') {
          const hit = r() < 0.7;
          v = kind === 'bool' ? (hit ? 1 : 0) : Math.round(target * (hit ? 1 + r() * 0.3 : r() * 0.9));
          if (d === 0) v = Math.round(v * 0.6); // aujourd'hui : en cours
        } else if (period === 'week') v = r() < 0.4 ? 1 : 0;
        else v = r() < 0.05 ? 1 : 0;
        if (v > 0 || kind === 'bool') await db.runAsync('INSERT INTO goal_entries (goal_id, day, value) VALUES (?, ?, ?)', id, day, v);
      }
    }

    /* Suivi : un exemple de chaque type, sur 60 jours. */
    const tracker = async (name: string, kind: string, unit: string, step: number, goal: number | null, icon: string, color: string) =>
      (await db.runAsync(
        'INSERT INTO trackers (name, kind, unit, step, goal, icon, color, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        name, kind, unit, step, goal, icon, color, 0, shiftDay(t, -60),
      )).lastInsertRowId;
    const sleep = await tracker('Sommeil', 'sleep', 'h', 15, 7 * 60, 'moon', categoryColors.sport);
    const lunch = await tracker('Déjeuner', 'time', '', 5, null, 'sun', categoryColors.groceries);
    const reading = await tracker('Lecture', 'duration', 'min', 5, 30, 'book', categoryColors.health);
    const liquid = await tracker('E-liquide', 'volume', 'ml', 0.5, null, 'drop', categoryColors.work);
    const coffee = await tracker('Cafés', 'quantity', 'cafés', 1, 3, 'glass', categoryColors.friends);
    await db.runAsync('UPDATE trackers SET sort = id');
    for (let d = -60; d <= 0; d++) {
      const day = shiftDay(t, d);
      const entry = (id: number, v: number) =>
        db.runAsync('INSERT INTO tracker_entries (tracker_id, day, value) VALUES (?, ?, ?)', id, day, v);
      // Coucher la veille entre 22:30 et 00:59, lever entre 06:00 et 08:30.
      const slept = (between(22 * 60 + 30, 24 * 60 + 59)) % 1440;
      const woke = between(6 * 60, 8 * 60 + 30);
      await db.runAsync(
        'INSERT INTO tracker_entries (tracker_id, day, value, slept_at, woke_at) VALUES (?, ?, ?, ?, ?)',
        sleep, day, (((woke - slept) % 1440) + 1440) % 1440, slept, woke,
      );
      await entry(lunch, between(12 * 60, 13 * 60 + 45));
      if (r() < 0.7) await entry(reading, between(2, 12) * 5);
      await entry(liquid, between(4, 12) / 2);
      if (d < 0 || r() < 0.5) await entry(coffee, between(1, 5));
    }

    /* Envies d'achat : en attente (dont plusieurs de plus de 30 jours), achetées, abandonnées. */
    const WISHES: [string, number][] = [
      ['Casque audio', 329], ['Veste de pluie', 149], ['Lampe de bureau', 89], ['Clavier mécanique', 179],
      ['Sac à dos', 120], ['Montre sport', 374], ['Liseuse', 139], ['Plaid', 45], ['Enceinte portable', 99],
      ['Chaussures de trail', 135], ['Machine à café', 249], ['Objectif photo', 520], ['Tapis de yoga', 35],
      ['Jeu de société', 42], ['Tente 2 places', 189],
    ];
    for (const [i, [title, euros]] of WISHES.entries()) {
      const state = i < 8 ? 'waiting' : i < 12 ? 'bought' : 'abandoned';
      const age = between(1, 90);
      await db.runAsync(
        'INSERT INTO wishes (title, url, price_cents, level, source, state, state_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        title, r() < 0.5 ? 'https://www.example.com/' : null, r() < 0.9 ? euros * 100 : null, pick(['bof', 'envie', 'besoin']),
        pick(['lien', 'photo', 'screen', null]), state,
        state === 'waiting' ? null : `${shiftDay(t, -between(0, Math.max(0, age - 1)))}T18:00`, `${shiftDay(t, -age)}T12:00`,
      );
    }

    /* Anniversaires : un par prénom, dates étalées sur l'année ; idées et cadeaux passés. */
    const year = Number(t.slice(0, 4));
    for (const [i, name] of NAMES.entries()) {
      const k = shiftDay(t, i === 0 ? 1 : between(2, 360));
      const catKey = ['Maman', 'Papa', 'Mamie'].includes(name) ? 'family' : i % 4 === 0 ? 'work' : 'friends';
      const res = await db.runAsync(
        'INSERT INTO birthdays (name, month, day, year, category_id, buy_days) VALUES (?, ?, ?, ?, ?, ?)',
        name, Number(k.slice(5, 7)), Number(k.slice(8, 10)), r() < 0.8 ? year - between(20, 70) : null, cat(catKey), pick([1, 3, 7]),
      );
      const id = res.lastInsertRowId;
      for (let j = 0; j < between(0, 3); j++) {
        await db.runAsync(
          'INSERT INTO gift_ideas (birthday_id, title, price_cents, created_at) VALUES (?, ?, ?, ?)',
          id, pick(GIFTS), r() < 0.6 ? between(15, 90) * 100 : null, created,
        );
      }
      for (let y = 1; y <= between(0, 4); y++) {
        await db.runAsync(
          'INSERT INTO gifts_given (birthday_id, year, title, price_cents) VALUES (?, ?, ?, ?)',
          id, year - y, pick(GIFTS), between(15, 90) * 100,
        );
      }
    }

    await db.runAsync("INSERT INTO settings (key, value) VALUES ('demo_data', '1')");
  });
}
