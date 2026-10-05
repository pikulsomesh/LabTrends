# src/ai

Extraction (PLAN.md Phase 5): report text to candidate rows for the Verification screen.

- `extract.ts`: runs the deterministic parser (`src/utils/parser.ts`) first. Only lines it could not
  read go to the SLM, 10 lines per call, at most 60 lines per report. The llama context is released
  when extraction ends, also on failure. If no model is imported, the lines stay unparsed for manual
  entry.
- `slmRows.ts`: prompt, JSON schema (passed to llama.rn as `response_format: json_schema`, which
  becomes a sampling grammar), and the output check. A model row is kept only if it cites a real
  line, its name is on that line, and its value and range bounds are numbers printed on that line.
  The model can arrange a line's numbers and fix an OCR-garbled unit, but it cannot invent a number.
- `model.ts`: the user imports a GGUF file (Qwen2.5-1.5B-Instruct Q4 by default, 0.5B for low-RAM
  phones). It is checked for the GGUF header and moved to `documents/models/slm.gguf`. Never bundled,
  never downloaded. Checksum verification against published release assets is the "Later: model
  packaging" item in PLAN.md.

Nothing here writes to the database (guardrail 3): rows carry `origin: 'parser' | 'slm'` and go to
verification. The Phase 0 SLM go/no-go is still open; see `docs/PHASE0.md`.
