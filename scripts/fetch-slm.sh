#!/usr/bin/env bash
# Downloads the GGUF that CI packs into the release APK (see plugins/withBundledSlm.js). Runs on the
# CI runner only; the app itself never touches the network. The file goes to $1, never into git.
# The download is checked against the SHA-256 pinned in eval/slm/bundled-model.env.
set -euo pipefail
OUT="${1:?usage: fetch-slm.sh <output.gguf>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../eval/slm/bundled-model.env
source "$HERE/../eval/slm/bundled-model.env"

mkdir -p "$(dirname "$OUT")"
curl -fL --retry 5 --retry-delay 10 -o "$OUT" "https://huggingface.co/$SLM_REPO/resolve/$SLM_REVISION/$SLM_FILE"
ACTUAL="$(sha256sum "$OUT" | cut -d' ' -f1)"
echo "model: $SLM_REPO/$SLM_FILE@$SLM_REVISION"
echo "sha256: $ACTUAL"
echo "bytes: $(stat -c %s "$OUT")"
if [ -z "${SLM_SHA256:-}" ]; then
  echo "::warning::SLM_SHA256 is not pinned yet; copy the sha256 above into eval/slm/bundled-model.env"
elif [ "$ACTUAL" != "$SLM_SHA256" ]; then
  echo "::error::Model checksum mismatch: expected $SLM_SHA256"
  exit 1
fi
