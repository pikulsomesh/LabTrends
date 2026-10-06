// Expo config plugin: packs a GGUF model into the Android APK as an asset, so the fallback SLM works
// with no import and no download (CLAUDE.md guardrail 1: no network at all).
//
// Active only when LABTRENDS_SLM_GGUF points at a file. CI sets it; a local or dev build without it
// ships no model and the app falls back to importing one. The file is copied at prebuild time into
// the generated android/ folder (git-ignored), never into git. `.gguf` is excluded from asset
// compression: the weights are already quantized, and llama.cpp reads the asset in place.
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAppBuildGradle } = require('expo/config-plugins');

/** Asset path llama.rn loads with is_model_asset. Keep in sync with EXPO_PUBLIC_BUNDLED_SLM in CI. */
const ASSET_PATH = 'slm/model.gguf';
const NO_COMPRESS = "        noCompress 'gguf'\n";

function addNoCompress(gradle) {
  if (gradle.includes("noCompress 'gguf'")) return gradle;
  if (/androidResources\s*\{/.test(gradle)) return gradle.replace(/(androidResources\s*\{\n)/, `$1${NO_COMPRESS}`);
  return gradle.replace(/(\n\s*buildTypes\s*\{)/, `\n    androidResources {\n${NO_COMPRESS}    }\n$1`);
}

const withBundledSlm = (config) => {
  const src = process.env.LABTRENDS_SLM_GGUF;
  if (!src) return config;

  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      if (!fs.existsSync(src)) throw new Error(`LABTRENDS_SLM_GGUF does not exist: ${src}`);
      const head = Buffer.alloc(4);
      const fd = fs.openSync(src, 'r');
      fs.readSync(fd, head, 0, 4, 0);
      fs.closeSync(fd);
      if (head.toString('latin1') !== 'GGUF') throw new Error(`Not a GGUF file: ${src}`);
      const dest = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', ASSET_PATH);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      return cfg;
    },
  ]);
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addNoCompress(cfg.modResults.contents);
    return cfg;
  });
};

module.exports = withBundledSlm;
module.exports.ASSET_PATH = ASSET_PATH;
module.exports.addNoCompress = addNoCompress;
