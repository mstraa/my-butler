import type { SQLiteDatabase } from 'expo-sqlite';

import { seedDemoData } from './seed';

/**
 * Schéma local. Chaque entrée de MIGRATIONS fait passer la base à la version suivante
 * (suivie par PRAGMA user_version). On n'édite jamais une migration déjà publiée :
 * on en ajoute une nouvelle à la fin.
 */
const MIGRATIONS: string[] = [
  /* v1 — schéma initial */ `
  CREATE TABLE categories (
    id INTEGER PRIMARY KEY NOT NULL,
    key TEXT NOT NULL UNIQUE,          -- work, friends, health…
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  );

  -- Rendez-vous (créés dans l'app ou importés de Google Agenda, lecture seule)
  CREATE TABLE events (
    id INTEGER PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,           -- 'YYYY-MM-DDTHH:mm' (heure locale)
    ends_at TEXT,
    all_day INTEGER NOT NULL DEFAULT 0,
    category_id INTEGER REFERENCES categories(id),
    location TEXT,
    notes TEXT,
    icon TEXT,                         -- icône propre, sinon celle de la catégorie
    source TEXT NOT NULL DEFAULT 'app',-- 'app' | 'google'
    external_id TEXT,                  -- id de l'évènement dans l'agenda du téléphone
    calendar_id TEXT,
    cancelled_at TEXT,
    cancel_reason TEXT,
    cancel_mode TEXT,                  -- 'keep' (barré) | 'hide' (masqué, historique)
    deadline_at TEXT,                  -- échéance liée (ex. « confirmer avant mardi »)
    deadline_label TEXT,
    deadline_state TEXT,               -- 'open' | 'done' | 'abandoned'
    created_at TEXT NOT NULL
  );
  CREATE INDEX events_starts ON events(starts_at);
  CREATE UNIQUE INDEX events_external ON events(source, external_id) WHERE external_id IS NOT NULL;

  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    day TEXT,                          -- jour prévu 'YYYY-MM-DD'
    due_at TEXT,                       -- échéance 'YYYY-MM-DDTHH:mm'
    category_id INTEGER REFERENCES categories(id),
    tracks_expense INTEGER NOT NULL DEFAULT 0,
    estimate_cents INTEGER,
    state TEXT NOT NULL DEFAULT 'open',-- 'open' | 'done' | 'abandoned'
    state_at TEXT,
    abandon_reason TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX tasks_day ON tasks(day);
  CREATE INDEX tasks_due ON tasks(due_at);

  -- Historique daté de chaque action sur une échéance
  CREATE TABLE deadline_log (
    id INTEGER PRIMARY KEY NOT NULL,
    item_type TEXT NOT NULL,           -- 'task' | 'event'
    item_id INTEGER NOT NULL,
    action TEXT NOT NULL,              -- 'done' | 'postponed' | 'abandoned'
    at TEXT NOT NULL,
    from_due TEXT,
    to_due TEXT,
    note TEXT
  );

  CREATE TABLE goals (
    id INTEGER PRIMARY KEY NOT NULL,
    key TEXT UNIQUE,                   -- pour la saisie rapide (ex. 'fruits')
    title TEXT NOT NULL,
    period TEXT NOT NULL,              -- 'day' | 'week' | 'month'
    kind TEXT NOT NULL,                -- 'counter' | 'value' | 'duration' | 'bool'
    target REAL,
    unit TEXT,
    color TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE goal_entries (
    goal_id INTEGER NOT NULL REFERENCES goals(id),
    day TEXT NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (goal_id, day)
  );

  CREATE TABLE sleep_log (
    day TEXT PRIMARY KEY NOT NULL,
    woke_at TEXT,                      -- 'HH:mm'
    slept_at TEXT                      -- 'HH:mm' (coucher de la veille au soir)
  );
  CREATE TABLE eliquid_log (
    day TEXT PRIMARY KEY NOT NULL,
    ml REAL NOT NULL DEFAULT 0         -- par pas de 0,5 ml
  );

  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY NOT NULL,
    amount_cents INTEGER NOT NULL,
    label TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    spent_at TEXT NOT NULL,
    task_id INTEGER REFERENCES tasks(id)
  );
  CREATE INDEX expenses_spent ON expenses(spent_at);
  CREATE TABLE budgets (
    month TEXT PRIMARY KEY NOT NULL,   -- 'YYYY-MM'
    amount_cents INTEGER NOT NULL
  );

  CREATE TABLE wishes (
    id INTEGER PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    image_uri TEXT,
    price_cents INTEGER,
    state TEXT NOT NULL DEFAULT 'waiting', -- 'waiting' | 'bought' | 'abandoned'
    state_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE birthdays (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    year INTEGER,                      -- inconnue possible
    category_id INTEGER REFERENCES categories(id),
    remind_d7 INTEGER NOT NULL DEFAULT 1,
    remind_d1 INTEGER NOT NULL DEFAULT 1,
    remind_d0 INTEGER NOT NULL DEFAULT 1,
    remind_time TEXT NOT NULL DEFAULT '09:00',
    buy_before TEXT                    -- date limite d'achat du cadeau
  );
  CREATE TABLE gift_ideas (
    id INTEGER PRIMARY KEY NOT NULL,
    birthday_id INTEGER NOT NULL REFERENCES birthdays(id),
    title TEXT NOT NULL,
    price_cents INTEGER,
    wish_id INTEGER REFERENCES wishes(id),
    bought INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE gifts_given (
    id INTEGER PRIMARY KEY NOT NULL,
    birthday_id INTEGER NOT NULL REFERENCES birthdays(id),
    year INTEGER NOT NULL,
    title TEXT NOT NULL,
    price_cents INTEGER
  );

  CREATE TABLE day_notes (
    day TEXT PRIMARY KEY NOT NULL,
    text TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );
  `,
  /* v2 — répétition et rappel des rendez-vous */ `
  ALTER TABLE events ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'; -- none | daily | weekly | monthly | yearly
  ALTER TABLE events ADD COLUMN reminder_min INTEGER;                   -- minutes avant ; NULL = pas de rappel
  `,
  /* v3 — tâches : rappel, affichage « En retard », relance */ `
  ALTER TABLE tasks ADD COLUMN reminder_min INTEGER;                    -- minutes avant l'échéance ; NULL = pas de rappel
  ALTER TABLE tasks ADD COLUMN show_late INTEGER NOT NULL DEFAULT 1;    -- échéance passée → « En retard »
  ALTER TABLE tasks ADD COLUMN nag_at TEXT;                             -- relance quotidienne 'HH:mm' ; NULL = aucune
  `,
  /* v4 — note des tâches */ `
  ALTER TABLE tasks ADD COLUMN notes TEXT;
  `,
  /* v5 — anniversaires : suivi des cadeaux */ `
  ALTER TABLE birthdays ADD COLUMN track_gifts INTEGER NOT NULL DEFAULT 1;  -- idées cadeaux + « acheter avant »
  ALTER TABLE birthdays ADD COLUMN buy_days INTEGER NOT NULL DEFAULT 3;     -- acheter le cadeau N jours avant
  ALTER TABLE gift_ideas ADD COLUMN given_id INTEGER REFERENCES gifts_given(id); -- idée marquée « offert »
  `,
  /* v6 — objectifs : icône */ `
  ALTER TABLE goals ADD COLUMN icon TEXT;
  UPDATE goals SET icon = 'fruit' WHERE key = 'fruits';
  UPDATE goals SET icon = 'steps' WHERE key = 'steps';
  UPDATE goals SET icon = 'book' WHERE key = 'reading';
  UPDATE goals SET icon = 'pill' WHERE key = 'vitamins';
  `,
  /* v7 — objectifs : date de création (début de l'historique) */ `
  ALTER TABLE goals ADD COLUMN created_at TEXT;                         -- 'YYYY-MM-DD'
  UPDATE goals SET created_at = COALESCE(
    (SELECT MIN(day) FROM goal_entries WHERE goal_id = goals.id), date('now', 'localtime'));
  `,
  /* v8 — suivis personnalisés (remplacent sommeil et e-liquide codés en dur) */ `
  CREATE TABLE trackers (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,                -- 'duration' | 'time' | 'quantity' | 'volume'
    unit TEXT NOT NULL DEFAULT '',     -- h | min ; ml | cl | L ; libre pour une quantité
    step REAL NOT NULL,                -- pas des boutons − / + (minutes pour durée et heure)
    goal REAL,                         -- repère facultatif sur le graphique
    icon TEXT,
    color TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL           -- 'YYYY-MM-DD'
  );
  CREATE TABLE tracker_entries (
    tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    value REAL NOT NULL,               -- minutes (durée), minutes depuis minuit (heure), nombre, volume
    PRIMARY KEY (tracker_id, day)
  );
  `,
  /* v9 — suivis de type sommeil : coucher et lever, la durée de la nuit en découle */ `
  ALTER TABLE tracker_entries ADD COLUMN slept_at REAL;  -- coucher de la veille au soir (minutes depuis minuit)
  ALTER TABLE tracker_entries ADD COLUMN woke_at REAL;   -- lever du jour (minutes depuis minuit)
  `,
  /* v10 — envies d'achat : niveau, origine de l'image, dépense liée */ `
  ALTER TABLE wishes ADD COLUMN level TEXT NOT NULL DEFAULT 'envie';     -- 'bof' | 'envie' | 'besoin'
  ALTER TABLE wishes ADD COLUMN source TEXT;                             -- 'lien' | 'photo' | 'screen' (capture)
  ALTER TABLE wishes ADD COLUMN expense_id INTEGER REFERENCES expenses(id); -- dépense créée à l'achat
  `,
  /* v11 — suivis remplis depuis Health Connect (pas, sommeil de Zepp…) */ `
  ALTER TABLE trackers ADD COLUMN source TEXT;  -- 'health' : valeurs importées de Health Connect ; NULL : saisie
  `,
  /* v12 — rendez-vous Google : lien de visio Google Meet */ `
  ALTER TABLE events ADD COLUMN meet_url TEXT;  -- lu dans la description de l'évènement Google, à chaque synchro
  `,
];

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  const freshInstall = version === 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }

  if (freshInstall) {
    await seedDemoData(db);
  }
}
