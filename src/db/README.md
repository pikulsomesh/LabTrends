# src/db

SQLite access (expo-sqlite). Phase 2.

- `openDatabase()` (`open.ts`) opens `labtrends.db` once, turns on foreign keys and WAL, runs
  migrations and tops up the alias seed. Everything else takes the returned `Db`.
- `schema.ts`: migrations, tracked with `PRAGMA user_version`. Append new ones; never edit a shipped
  one. A database from a newer app version is refused rather than touched.
- `profiles.ts`, `reports.ts`, `biomarkers.ts`: CRUD and read queries. Every data query takes the
  active `profile_id`.
- `appState.ts`: the remembered active profile (one-row `app_state` table, cleared by
  `ON DELETE SET NULL` when that profile is deleted) and the date order setting (`date_pref`:
  `auto` follows the phone's region, or `dmy`, `mdy`, `ymd`).
- `aliases.ts`: the alias table, seeded from `src/utils/aliases.ts` (`ALIAS_SEED`), plus aliases
  the user adds. Seeding never overwrites a row, so user mappings win.
- `transaction.ts`: queued transactions on the main connection (expo-sqlite's exclusive
  transactions use a second connection, where foreign keys would be off).
- `testDb.ts`: the same `Db` interface over `node:sqlite`, for unit tests only.

Rules:

- A value is a number (`value`) or a result printed as words (`value_text`, up to 60 characters,
  such as "Trace" or "Pale yellow"), never both. A CHECK constraint enforces it.
- Only verified, structured values are stored. No image blobs, PDFs or raw OCR text. Text columns
  have length limits and the file hash must be SHA-256 hex.
- `saveVerifiedReport` is the only write path for lab values. Call it from the Verification
  screen, never straight from the parser or the SLM.
