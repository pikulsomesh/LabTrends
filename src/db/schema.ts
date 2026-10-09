// Schema and migrations. PRAGMA user_version holds the number of migrations applied.
// Append new migrations to the end of MIGRATIONS; never edit one that has shipped.
import { seedAliases } from './aliases';
import { transaction } from './transaction';
import type { Db } from './types';

export const MIGRATIONS: readonly string[] = [
  // 1: initial schema (CLAUDE.md). Only verified, structured values: no blobs, files or OCR text.
  `
  CREATE TABLE profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );

  CREATE TABLE reports (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    category TEXT CHECK (length(category) <= 60),
    lab_name TEXT CHECK (length(lab_name) <= 120),
    source_file_hash TEXT CHECK (length(source_file_hash) = 64 AND source_file_hash NOT GLOB '*[^0-9a-f]*'),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX reports_profile_date ON reports(profile_id, date);
  CREATE INDEX reports_profile_hash ON reports(profile_id, source_file_hash);

  CREATE TABLE biomarkers (
    id INTEGER PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    canonical_name TEXT CHECK (length(canonical_name) <= 120),
    value REAL NOT NULL,
    unit TEXT CHECK (length(unit) <= 40),
    ref_low REAL,
    ref_high REAL,
    raw_ref_text TEXT CHECK (length(raw_ref_text) <= 120)
  );
  CREATE INDEX biomarkers_report ON biomarkers(report_id);
  CREATE INDEX biomarkers_canonical ON biomarkers(canonical_name);

  -- Global, not per profile: maps printed test names to canonical names, not patient data.
  CREATE TABLE aliases (
    alias TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('seed', 'user'))
  );
  `,
  // 2: the profile the app opens on. One row; cleared when that profile is deleted.
  `
  CREATE TABLE app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL
  );
  INSERT INTO app_state (id) VALUES (1);
  `,
  // 3: results printed as words ("Trace", "Pale yellow"), kept in value_text with value NULL, and
  // the user's day and month order. SQLite cannot drop NOT NULL in place, so biomarkers is rebuilt.
  `
  CREATE TABLE biomarkers_v3 (
    id INTEGER PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    canonical_name TEXT CHECK (length(canonical_name) <= 120),
    value REAL,
    value_text TEXT CHECK (value_text IS NULL OR length(trim(value_text)) BETWEEN 1 AND 60),
    unit TEXT CHECK (length(unit) <= 40),
    ref_low REAL,
    ref_high REAL,
    raw_ref_text TEXT CHECK (length(raw_ref_text) <= 120),
    CHECK ((value IS NULL) <> (value_text IS NULL))
  );
  INSERT INTO biomarkers_v3 (id, report_id, name, canonical_name, value, unit, ref_low, ref_high, raw_ref_text)
    SELECT id, report_id, name, canonical_name, value, unit, ref_low, ref_high, raw_ref_text FROM biomarkers;
  DROP TABLE biomarkers;
  ALTER TABLE biomarkers_v3 RENAME TO biomarkers;
  CREATE INDEX biomarkers_report ON biomarkers(report_id);
  CREATE INDEX biomarkers_canonical ON biomarkers(canonical_name);

  ALTER TABLE app_state ADD COLUMN date_pref TEXT NOT NULL DEFAULT 'auto'
    CHECK (date_pref IN ('auto', 'dmy', 'mdy', 'ymd'));
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Applies pending migrations, each in its own transaction with its user_version bump. */
export async function migrate(db: Db): Promise<number> {
  const current = await userVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema v${current} is newer than this app (v${SCHEMA_VERSION}). Update the app.`,
    );
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    await transaction(db, async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return SCHEMA_VERSION;
}

export async function userVersion(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  return row?.user_version ?? 0;
}

/** Connection setup, migrations and the alias seed. Run once after opening the database. */
export async function prepareDatabase(db: Db): Promise<void> {
  // foreign_keys is per connection and off by default; ON DELETE CASCADE needs it.
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  await migrate(db);
  await seedAliases(db);
}
