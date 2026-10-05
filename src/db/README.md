# src/db

SQLite access (expo-sqlite). Phase 2.

- Schema, migrations (`PRAGMA user_version`), CRUD helpers and the alias table seed.
- Every data query takes the active `profile_id`.
- Only verified, structured values are stored. No image blobs, PDFs or raw OCR text.
- Writes come from the Verification screen only, never straight from the parser or the SLM.
