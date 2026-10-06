#!/usr/bin/env bash
# Builds the arm64 release APK on your own machine, with the fallback model packed in, so it needs
# no GitHub Actions minutes. Needs JDK 17 and the Android SDK (docs/MACBOOK_SETUP.md steps 1 and 2).
# The result is dist/labtrends-local.apk, signed with the debug key (fine for installing on your own
# phone). Install it with: adb install -r dist/labtrends-local.apk
set -euo pipefail
cd "$(dirname "$0")/.."

: "${JAVA_HOME:?Set JAVA_HOME to a JDK 17 (see docs/MACBOOK_SETUP.md)}"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK (see docs/MACBOOK_SETUP.md)}"

npm ci
npm run check:network

MODEL="$PWD/.cache/slm/model.gguf"   # .cache is git-ignored; the model never goes into git
if [ ! -f "$MODEL" ]; then ./scripts/fetch-slm.sh "$MODEL"; fi

export LABTRENDS_SLM_GGUF="$MODEL"
export EXPO_PUBLIC_BUNDLED_SLM="slm/model.gguf"
npx expo prebuild --platform android --no-install --clean
(cd android && ./gradlew :app:assembleRelease --console=plain)

APK=android/app/build/outputs/apk/release/app-release.apk
BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
if "$BT/aapt2" dump permissions "$APK" | grep -E 'android\.permission\.(INTERNET|ACCESS_NETWORK_STATE|ACCESS_WIFI_STATE)'; then
  echo "Release APK requests a network permission" >&2
  exit 1
fi
unzip -Z1 "$APK" | grep -qx 'assets/slm/model.gguf' || { echo "The model is missing from the APK" >&2; exit 1; }

mkdir -p dist
cp "$APK" dist/labtrends-local.apk
(cd dist && shasum -a 256 labtrends-local.apk | tee SHA256SUMS-local)
echo "Done: dist/labtrends-local.apk"
