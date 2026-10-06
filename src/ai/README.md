# src/ai

Extraction (PLAN.md Phase 5): report text to candidate rows for the Verification screen.

- `extract.ts`: runs the deterministic parser (`src/utils/parser.ts`) first. Only lines it could not
  read go to the SLM, one line per call, at most 60 lines per report. The llama context is released
  when extraction ends, also on failure. If no model is imported, the lines stay unparsed for manual
  entry.
- `slmRows.ts`: prompt, JSON schema (passed to llama.rn as `response_format: json_schema`, which
  becomes a sampling grammar), and the output check. A model row is kept only if it cites a real
  line, its name is on that line, and its value and range bounds are numbers printed on that line.
  The model can arrange a line's numbers and fix an OCR-garbled unit, but it cannot invent a number.
- `model.ts`: release builds carry Qwen3-0.6B Q4 inside the APK (an Android asset packed by
  `plugins/withBundledSlm.js` in CI; chosen by the eval in `eval/slm`). It is read in place with
  llama.rn's `is_model_asset`, never downloaded and never in git. A build without the asset falls
  back to a GGUF the user imports (header-checked, moved to `documents/models/slm.gguf`).

Nothing here writes to the database (guardrail 3): rows carry `origin: 'parser' | 'slm'` and go to
verification. The Phase 0 SLM go/no-go is still open; see `docs/PHASE0.md`.
