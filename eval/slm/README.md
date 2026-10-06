# SLM fallback eval

How well does a small local language model rescue lab-report lines that the deterministic parser
cannot read? This folder holds a golden set, the scoring code and a CI workflow that runs a ladder
of models from about 100 MB up to Qwen2.5-0.5B, with a larger reference at the top.

The app never downloads a model (CLAUDE.md guardrail 1). This eval runs in GitHub Actions only,
and its result decides which model the release build packs into the APK.

## What is tested

The app sends the model only lines the parser could not read, ten at a time, with a fixed prompt and
a JSON schema (`src/ai/slmRows.ts`, `src/ai/extract.ts`). The eval does the same thing:

1. `make-requests.ts` builds those exact prompts from the golden set.
2. `run_models.py` runs each model with llama.cpp: same messages, schema-constrained JSON,
   temperature 0, 768 new tokens at most, 2048-token context, CPU only.
3. `report.ts` scores the raw output with the app's own `acceptSlmRows`, so a row counts only if the
   app would keep it.

## Golden set

`golden.ts` has 99 lines: 78 results and 21 lines with digits that are not results (phone numbers,
page counts, sample IDs, footnotes). A unit test checks that the parser reads none of them, that
every expected number is printed on its line, and that there are no duplicates. All text is synthetic.

| Kind | What it covers |
|---|---|
| spaces | columns squeezed to single spaces |
| range-words | "Normal: < 150", "Ref. Range 70 to 100", "Up to 20" |
| flag | an H, L, HIGH or * next to the value |
| unit-ocr | `9/dL`, `mg/d1`, `IU/1`, `gm/dl`, `mg/ dL` |
| one-sided | `<100`, `> 90`, `<= 41` |
| no-range | a value and unit with no printed range |
| layout | value after a colon, pipes, brackets, numbered rows, extra method text |
| not-a-result | lines that must produce no row |

## Metrics

A positive line is a true positive only when the app keeps a row with the right name, value,
ref_low and ref_high. Units are scored separately because the model is allowed to fix OCR damage.

- Precision, recall and F1 over exact rows.
- False-positive rate on the non-result lines.
- Valid-JSON rate per batch.
- Discarded rate: rows the model wrote that the app's check dropped (a number or name not on the line). This is the model's hallucination rate; none of those rows would reach the Verify screen.
- Field accuracy for name, value, range and unit among rows the app kept.
- Exact-row rate by kind of line, and p50 and p95 seconds per batch.

## The bar

A model is bundled only if it clears all three: F1 of at least 0.90, at most 10% false positives on
non-result lines, and valid JSON on every batch. Whatever the model returns still goes through the
Verify screen before anything is saved (guardrail 3).

## Models

`models.json` lists the ladder, smallest first. Downloads can fail (a renamed file, a gated repo);
a model that cannot be fetched is reported as unavailable and the rest still run.

- SmolLM2-135M-Instruct at Q2_K and Q4_K_M. This is the floor: there is no instruction-tuned generative model at 50 MB that follows a JSON schema, and an encoder-only model of that size would need training data this project does not have.
- Gemma-3-270M-it Q4_K_M. Under the Gemma license, not Apache-2.0.
- SmolLM2-360M-Instruct Q4_K_M.
- Qwen2.5-0.5B-Instruct Q4_K_M.
- Qwen3-0.6B Q4_K_M.
- Qwen2.5-1.5B-Instruct Q4_K_M, as a reference for how much headroom the smaller ones leave.

## Run it

In CI: open a PR that touches `eval/**`, or run the **SLM eval** workflow by hand. The score table is
on the run page and in the `slm-eval-results` artifact.

Locally:

```sh
pip install llama-cpp-python huggingface_hub
npx tsx eval/slm/make-requests.ts requests.json
python eval/slm/run_models.py requests.json outputs smollm2-360m-q4
npx tsx eval/slm/report.ts outputs results.md results.json
```

Unit tests for the golden set and the scoring run with the rest: `npm test`.

## Limits

- The golden lines are written by hand, not taken from real reports. They stress layouts the parser misses; they cannot cover every lab.
- Latin-script English reports only, matching the bundled OCR model.
- llama-cpp-python and llama.rn both run llama.cpp, but versions differ, so speed is indicative. Accuracy should match; if a model is close to the bar, recheck on a device.
- Speed is measured on a CI x86 runner, not a Pixel.
