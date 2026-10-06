# Architecture

## Folders

| Path | What lives there | Phase |
|---|---|---|
| `App.tsx` | Root component. Sweeps leftover import files from the cache, opens the database, then shows the screen stack (landing, profile home, add report; dev builds can open the Phase 0 spike). | 1, 3, 4 |
| `src/screens` | One file per screen: `ProfilesScreen` (landing), `ProfileHomeScreen` (dashboard), `IngestScreen` (add, check and save a report), `MarkerScreen` (trend chart and values), `ChatScreen`. | 3+ |
| `src/dashboard` | Pure chart helpers: unit grouping (units are never converted), y-axis scale, date labels. | 7 |
| `src/state` | Active profile (`ActiveProfileProvider`, remembered in the `app_state` table) and the screen-stack reducer. No navigation library, so no extra native modules. | 3 |
| `src/components` | Shared UI pieces (`Disclaimer`, `ProfileNameModal`, `VerifyForm`, `TrendChart`, `useSecureScreen`). | 3+ |
| `src/verify` | Verification: extraction output as an editable draft, validation, duplicate lookup by file hash, and `saveDraft`, the only save path for lab values. | 6 |
| `src/db` | SQLite schema, migrations, CRUD, alias seed. | 2 |
| `src/ingest` | Camera, image and PDF input. `ingest.ts` is the pure pipeline (unit-tested with fakes); `native.ts` wires in the pickers, camera, ML Kit and the local module. Text stays in memory; cache files are deleted. | 0, 4 |
| `src/utils` | Pure logic: row parser, alias normalizer, dashboard panels, OCR row rebuild, text-layer checks. Unit-tested. | 0, 2, 7 |
| `src/ai` | Extraction: parser first, then the user-imported GGUF model via llama.rn for unread lines, with schema-constrained JSON and a check that every number is printed on its line. See `src/ai/README.md`. | 5 |
| `src/chat` | Data-only chat: rule-based intents, alias and fuzzy marker matching, template answers. See `src/chat/README.md`. | 7 |
| `src/spike` | Phase 0 spike screen. Dev builds only; removed once Phase 4 and 5 replace it. | 0 |
| `modules/pdf-page-renderer` | Local Expo module with two native modules: `PdfPageRenderer` (Android `PdfRenderer`) and `IngestFiles` (photo prep, SHA-256, FLAG_SECURE). | 0, 4 |
| `plugins` | Expo config plugins. | 1 |

## Ingestion (Phase 4)

The user opens **Add a report** from a profile and picks one of:

| Input | How it is read |
|---|---|
| Take a photo | `expo-image-picker` camera (asks for CAMERA at that moment). One page per shot; more pages can be added. |
| Choose photos | Android photo picker, several at once in tap order. No storage permission. |
| Choose a PDF | `expo-document-picker`. Text layer first; render + OCR when it is missing or unusable (see `docs/PHASE0.md`). |

Every photo goes through `IngestFiles.prepareImage` before ML Kit: EXIF rotation applied, transparency
flattened onto white (ML Kit reads transparent pixels as empty), long side capped at 4000 px. OCR
lines are rebuilt into rows with `rebuildRows`.

What happens to the files:

- Each input is hashed with SHA-256 (natively, streamed) before extraction. The hashes travel with
  the text for duplicate detection when the report is saved in Phase 6.
- Picker and camera copies, rendered PDF pages and prepared photos are deleted as soon as they are
  read, also when extraction fails. Only files under the app cache are ever deleted, never a file
  the user owns.
- At startup the app empties `cache/DocumentPicker`, `cache/ImagePicker`, `cache/pdf-render` and
  `cache/ingest-image`, in case an import was interrupted.
- The text is kept in the import screen's state only. Leaving the screen or tapping Discard drops it.
  The screen sets FLAG_SECURE while open, so no screenshots and a blank recents thumbnail.

Permissions: CAMERA is the only one added. `RECORD_AUDIO` and the legacy storage permissions are
blocked in `app.json`.

## Builds

Android only, `arm64-v8a` only (`expo-build-properties` in `app.json`).

| Build | Command | INTERNET permission |
|---|---|---|
| Dev client on a phone | `npx expo run:android --device` | Kept, so Metro can serve JS |
| Local debug APK (dev client) | `eas build -p android --profile development --local` | Kept |
| Local release APK | `eas build -p android --profile preview --local` | Removed |
| Release APK without EAS | `npx expo prebuild -p android && cd android && ./gradlew :app:assembleRelease` | Removed |

`eas build --local` runs on your machine but still needs `eas login` and an Expo project id. The
plain Gradle route needs neither and is what CI uses.

`plugins/withReleaseNoNetwork.js` writes `android/app/src/release/AndroidManifest.xml`, which marks
INTERNET and the network-state permissions `tools:node="remove"`. The manifest merger then drops them
from release builds even when a library adds them.

## CI (GitHub Actions)

- `ci.yml`, on every push and PR: typecheck, unit tests, and `scripts/check-no-network.mjs`
  (fails on network APIs in app code or on telemetry and network packages in `package.json`).
- `release.yml`, on a `v*` tag or a manual run: builds the release APK, fails if the APK requests
  any network permission or ships a non-arm64 native library, then uploads the APK and its SHA-256.
  A tag also creates a draft GitHub Release with both files.

Release signing: set the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Without them the APK is signed with the debug key and
its file name ends in `-debugsigned`; use that only for testing.
