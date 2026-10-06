# src/chat

Data-only chat (PLAN.md Phase 7). No model, no network, no generated medical text.

1. `intent.ts` normalizes the question and matches an intent by fixed rules: `trend`, `latest`,
   `compare`, `list`, `range`. Questions about what results mean or what to do (is it high, normal,
   bad, should I, diet, why...) are out of scope and get one fixed reply. "Normal range" and
   "reference range" still count as a range question, because they ask for printed text.
2. Markers are found through the alias table (user aliases included) and the profile's own marker
   names, longest phrase first. Misspellings of five letters or more match within one or two edits;
   short names such as ALT or Hb must match exactly, and question words are never fuzzily matched.
   The optional ONNX embedding matcher from PLAN.md is not built; fuzzy matching has been enough.
3. `answer.ts` runs one fixed query per intent, scoped to the active profile.
4. Answers come from templates with values, dates, labs and printed ranges, and a chart for trend
   and compare. A test checks no answer contains words like normal, high, low, good or bad.
