#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner (see .github/workflows/release.yml and
# emulator.yml): installs the release APK, puts the scanned fixture in Downloads, and runs the
# Maestro smoke flow. The APK is arm64-only; the x86_64 Google APIs image runs it through
# Android's ARM translation. On failure it prints what the app and the screen were doing, because
# the screenshots live in an artifact that is not always reachable.
set -euxo pipefail
OUT="${1:-emulator-results}"
PKG=dev.someshmohapatra.labtrends
mkdir -p "$OUT"
APK=$(ls apk/*.apk | head -1)

adb install -r "$APK"
adb shell pm list packages | grep -q "$PKG"
adb shell dumpsys package "$PKG" | grep -E 'primaryCpuAbi|permission' > "$OUT/package.txt" || true

adb push fixtures/sample_report_1_scanned.pdf /sdcard/Download/sample_report_1_scanned.pdf
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/sample_report_1_scanned.pdf || true

adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT=$!

diagnose() {
  set +e
  echo "::group::Diagnostics: what the app and the screen were doing"
  echo "--- app process:"; adb shell pidof "$PKG" || echo "not running"
  echo "--- top activity:"; adb shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | head -3
  echo "--- crashes and app errors:"
  grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|ReactNative|SIGSEGV|SIGILL|UnsatisfiedLinkError|dlopen|$PKG" "$OUT/logcat.txt" | tail -120
  echo "--- screen text:"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui.xml | grep -oE 'text="[^"]+"' | sort -u | head -60
  adb exec-out screencap -p > "$OUT/final-screen.png" 2>/dev/null
  echo "::endgroup::"
}

# Cold start once by hand and give it time, so a crash shows up here with its own log.
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 20
echo "app pid after 20 s: $(adb shell pidof "$PKG" || echo none)"
adb shell input keyevent KEYCODE_HOME

status=0
maestro test .maestro/smoke.yaml --format junit --output "$OUT/report.xml" --test-output-dir "$OUT" || status=$?
[ "$status" -eq 0 ] || diagnose
kill "$LOGCAT" || true
exit "$status"
