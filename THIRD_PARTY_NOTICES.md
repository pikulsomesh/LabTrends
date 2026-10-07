# Third-party notices

LabTrends' own code is licensed under the PolyForm Noncommercial License 1.0.0 (see LICENSE).
That license covers only this project's code. The components below are not ours and keep their
own licenses, which still apply when you build or redistribute the app.

## Shipped in the release APK

| Component | License | Notes |
| --- | --- | --- |
| Qwen3-0.6B (GGUF Q4_K_M, from `unsloth/Qwen3-0.6B-GGUF`) | Apache-2.0 | Model weights by the Qwen team, Alibaba Cloud. Packed into release builds as an Android asset; see `eval/slm/bundled-model.env`. Anyone redistributing the APK must pass on a copy of the Apache-2.0 license (https://www.apache.org/licenses/LICENSE-2.0). |
| ML Kit Text Recognition (Latin model) | Google ML Kit Terms of Service | Pulled in by `@react-native-ml-kit/text-recognition` (MIT). |
| npm runtime dependencies (React Native, Expo, llama.rn and llama.cpp, react-native-gifted-charts, @noble/ciphers, @noble/hashes and others) | Mostly MIT, plus ISC, BSD and Apache-2.0 | Each package's license is in its `node_modules/<package>/LICENSE` and in `package-lock.json`. |

## Build and development only (not shipped)

- lightningcss (MPL-2.0) and caniuse-lite (CC-BY-4.0), used by the bundler at build time.
- Models in the SLM eval ladder (`eval/slm/models.json`), which run in CI only. Gemma-3-270M is under the Gemma Terms of Use; the others are Apache-2.0.
