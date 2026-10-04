# PLAN.md: revised phases

Stop for confirmation after each phase.

## Phase 0: Feasibility spike (do first)
- Minimal Expo dev-client app. Run PDF text extraction, ML Kit OCR, and the parser on /fixtures plus 5 to 10 real, consented reports (Thyrocare, Lal PathLabs, Metropolis, Dr Lal, local labs).
- Run Qwen2.5-0.5B and 1.5B Q4 through llama.rn on a real mid-range phone. Record RAM, latency, and accuracy.
- Decide whether the SLM fallback is even needed.

## Phase 1: Init and architecture
Expo + TypeScript, folders (components, screens, db, utils, ai, chat), eas.json for local APK builds, arm64 only, GitHub Actions for release builds.

## Phase 2: Database
Schema from CLAUDE.md, CRUD helpers, alias table seeded with common Indian lab names, migrations.

## Phase 3: Profiles and navigation
Landing screen, create-profile modal, active profile_id in state.

## Phase 4: Ingestion
Camera, image, and PDF input. PDF text layer first, OCR for scans. Return text in memory only. Delete cache files.

## Phase 5: Extraction
1. Deterministic row parser (name, value, unit, range).
2. SLM fallback with constrained JSON output for unparsed lines.
3. Context released after extraction.

## Phase 6: Verification screen
Editable form with the source snippet beside each field. Duplicate detection via file hash. Confirm and Save writes to SQLite and wipes OCR and JSON from memory.

## Phase 7: Dashboard and data-only chat
- Category tabs and line charts with reference-range bands.
- Chat architecture (mostly deterministic):
  1. Normalize the question and match intent by rules (trend, latest, compare, list, range).
  2. Match biomarker with alias table plus fuzzy matching. Optional: all-MiniLM-L6-v2 int8 ONNX (about 20 to 25 MB) via onnxruntime-react-native for semantic matching when fuzzy matching fails.
  3. Run a fixed SQL query for the profile.
  4. Answer from templates, with an inline chart. No generated medical text.
  5. Out-of-scope questions get a fixed "I can only show your recorded data" reply.

## Phase 8: Export and backup
PDF export via expo-print and expo-sharing. Encrypted passphrase backup and restore.

## Later: model packaging
Publish GGUF and ONNX files as GitHub Release assets with checksums. In-app import via document picker with SHA-256 verification.
