# src/ai

On-device SLM fallback (llama.rn, Qwen2.5 GGUF imported by the user). Phase 5.

- Runs only on lines the deterministic parser in `src/utils/parser.ts` could not read.
- Output is grammar or JSON-schema constrained, then goes to the Verification screen.
- Release the llama context after extraction.
- The SLM go/no-go from Phase 0 is still open; see `docs/PHASE0.md`.
