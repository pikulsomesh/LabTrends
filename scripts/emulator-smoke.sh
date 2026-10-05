#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner (see .github/workflows/release.yml): installs
# the release APK, puts the scanned fixture in Downloads, and runs the Maestro smoke flow.
# The APK is arm64-only; the x86_64 Google APIs image runs it through Android's ARM translation.
set -euxo pipefail
OUT="${1:-emulator-results}"
mkdir -p "$OUT"
APK=$(ls apk/*.apk | head -1)

adb install -r "$APK"
adb shell pm list packages | grep -q dev.someshmohapatra.labtrends
adb shell dumpsys package dev.someshmohapatra.labtrends | grep -E 'primaryCpuAbi|permission' > "$OUT/package.txt" || true

adb push fixtures/sample_report_1_scanned.pdf /sdcard/Download/sample_report_1_scanned.pdf
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/sample_report_1_scanned.pdf || true

adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT=$!
status=0
maestro test .maestro/smoke.yaml --format junit --output "$OUT/report.xml" --test-output-dir "$OUT" || status=$?
kill "$LOGCAT" || true
exit "$status"
