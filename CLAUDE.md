# CLAUDE.md: project rules for Claude Code

Project: offline Android app for multi-profile lab-report trends. Author: Somesh Mohapatra. License: MIT.

## Stack

- React Native + Expo (expo-dev-client, TypeScript), Android only, arm64-only builds.
- Storage: expo-sqlite (consider SQLCipher for encryption at rest).
- OCR: ML Kit bundled Latin model via `@react-native-ml-kit/text-recognition` (verify the package name and that it is maintained before installing).
- PDF text: extract the text layer first. Render scanned pages to images only when no text layer exists.
- Extraction fallback SLM: llama.rn with Qwen2.5-1.5B-Instruct Q4 (default) or Qwen2.5-0.5B (low RAM). GGUF is imported by the user, never bundled in git.
- Chat: deterministic intent and entity matching (see PLAN.md Phase 7). Optional tiny ONNX embedding model via onnxruntime-react-native for fuzzy matching only.
- Charts: react-native-gifted-charts.

## Hard guardrails (never violate)

1. Zero cloud connectivity. No network calls of any kind. No analytics, crash reporters, or telemetry. Remove the INTERNET permission in release builds.
2. No raw file storage. The DB must never contain image blobs, PDFs, or raw OCR strings. Delete picker and camera cache files after extraction.
3. Verification checkpoint. AI or parser output is never written to the DB directly. It goes through the Verification screen first.
4. Not a medical device. The chat and UI retrieve and plot data only. Never diagnose, interpret, recommend, or label values as good or bad beyond showing the printed reference range.
5. Numbers come from deterministic parsing first. The SLM is a fallback, with grammar or JSON-schema constrained output.

## Engineering rules

- Schema: profiles; reports (profile_id, date, category, lab_name, source_file_hash); biomarkers (report_id, name, canonical_name, value REAL, unit, ref_low, ref_high, raw_ref_text). Alias table maps SGPT to ALT and similar. Foreign keys with ON DELETE CASCADE. Use PRAGMA user_version for migrations.
- Every data query filters by the active profile_id.
- Android: allowBackup=false, FLAG_SECURE on sensitive screens, optional biometric lock.
- Backups: AES-GCM with a PBKDF2 or Argon2 derived key from a proven library. Never hand-roll crypto.
- Add unit tests for the parser and the alias normalizer using the fixtures in /fixtures.
- Work phase by phase per PLAN.md. Stop and ask for confirmation between phases.
