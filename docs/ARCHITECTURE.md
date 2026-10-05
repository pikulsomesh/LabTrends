# Architecture

## Folders

| Path | What lives there | Phase |
|---|---|---|
| `App.tsx` | Root component. Opens the database, then shows the screen stack (landing, profile home; dev builds can open the Phase 0 spike). | 1, 3 |
| `src/screens` | One file per screen: `ProfilesScreen` (landing), `ProfileHomeScreen`. | 3+ |
| `src/state` | Active profile (`ActiveProfileProvider`, remembered in the `app_state` table) and the screen-stack reducer. No navigation library, so no extra native modules. | 3 |
| `src/components` | Shared UI pieces (`Disclaimer`, `ProfileNameModal`, later charts and form fields). | 3+ |
| `src/db` | SQLite schema, migrations, CRUD, alias seed. | 2 |
| `src/ingest` | Camera, image and PDF input. Text stays in memory; cache files are deleted. | 4 |
| `src/utils` | Pure logic: row parser, alias normalizer, OCR row rebuild, text-layer checks. Unit-tested. | 0, 5 |
| `src/ai` | llama.rn SLM fallback with constrained JSON output. | 5 |
| `src/chat` | Deterministic intent and entity matching for the data-only chat. | 7 |
| `src/spike` | Phase 0 spike screen. Dev builds only; removed once Phase 4 and 5 replace it. | 0 |
| `modules/pdf-page-renderer` | Local Expo module wrapping Android `PdfRenderer`. | 0 |
| `plugins` | Expo config plugins. | 1 |

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
