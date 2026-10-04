# Phase 0 spike: how to run and what to record

Build (needs Android SDK + a physical arm64 phone; not done yet):

    npx expo prebuild --platform android && npx expo run:android --device

Use the single screen in `src/spike/SpikeScreen.tsx`. Real reports must be consented, stay on the device, and are never committed. `/fixtures` holds synthetic reports only.

## Results table (fill in)

| Report (lab, PDF/scan) | Text source | Chars | Rows parsed | Unparsed | Wrong values | Notes |
|---|---|---|---|---|---|---|

## SLM (llama.rn, CPU only)

| Model | File MB | Load ms | Peak RAM MB | tok/s | Accuracy on unparsed lines | Notes |
|---|---|---|---|---|---|---|
| Qwen2.5-0.5B Q4 | | | | | | |
| Qwen2.5-1.5B Q4 | | | | | | |

Phone model / RAM / Android version:

## Open questions the spike must answer

- Does ML Kit OCR keep table rows on one line, or split name / value / range into separate lines? (Parser assumes one row per line.)
- ~~Scanned PDFs: a page-to-image renderer is still needed; pick one.~~ Picked: Android `PdfRenderer` via a local Expo module (see "Scanned and empty-text PDFs" below). Still to verify on device.
- Do real labs use units the fixtures do not cover (lakh/cumm vs x10^3/uL for platelets)? Unit normalization is a Phase 2 item.
- Decision: is the SLM fallback needed at all?

## Scanned and empty-text PDFs

`src/ingest/pdf.ts` runs the text layer first and checks it with `assessTextLayer` (`src/utils/textLayer.ts`). The PDF goes to render + OCR when the text is:

- `empty`: nothing but whitespace. This is the embedded subset font case, where PDFBox returns `success=true` with 0 chars, and the plain scan case.
- `sparse`: fewer than 20 letters and digits per page, such as a scan that carries only a page footer.
- `unmapped-glyphs`: more than 20% of visible chars are U+FFFD, private use area or control chars.
- `extract-failed`: PDFBox failed for a reason other than a password. Password errors stop with a message instead, because the renderer cannot open those PDFs either.

The OCR path renders one page at a time, runs ML Kit, rebuilds rows with `rebuildRows`, and deletes the page image before rendering the next one. Detection is per document, not per page, so a PDF that mixes text pages and scanned pages uses its text layer only.

**Renderer: Android `PdfRenderer`** (pdfium, built into Android since API 21), wrapped in a local Expo module at `modules/pdf-page-renderer` and autolinked from `modules/`.

- Why: no third-party dependency to vet, nothing to download, and full control over the bitmap. It fills the bitmap with white before drawing, because PdfRenderer leaves unpainted areas transparent and ML Kit reads transparent images as empty (see the finding above).
- Output: PNG in `cacheDir/pdf-render/`, 200 dpi (8 pt print gets a 22 px em), long side capped at 4000 px. The caller deletes each file after OCR.
- Errors: `ERR_PASSWORD_REQUIRED`, `ERR_CORRUPT_PDF`, `ERR_FILE_NOT_FOUND`, `ERR_PAGE_RANGE`.
- Alternatives considered: `react-native-pdf-thumbnail` wraps the same PdfRenderer but adds a third-party dependency for about 80 lines of Kotlin we can own; `react-native-pdf` is a viewer and does not write page images; rendering with pdfbox-android (already pulled in by `expo-pdf-text-extract`) would reuse the library that fails on these fonts, while pdfium handles embedded fonts well.
- Not yet built or run on device. The Kotlin was written against expo-modules-core 57 but has not been compiled. Run `npx expo prebuild --platform android` and a device build to verify.

Fixtures: `fixtures/sample_report_1_scanned.pdf` and `_2_scanned.pdf` are image-only A4 PDFs (200 dpi, 1-bit, no text layer) made from the synthetic `.txt` fixtures by `scripts/make-scanned-fixtures.sh`. Copy them to the phone and run them through button 1. There is no embedded subset font fixture yet; the macOS Quartz PDF from the earlier finding is the one to use.

## Package notes

- `@react-native-ml-kit/text-recognition` 2.0.0 last published 2025-09; verify it still builds against RN 0.86 / the new architecture on device.
- `expo-pdf-text-extract` 1.1.0 (PDFBox on Android); small community package, verify on device.
- `llama.rn` is a 0.13 release candidate.

## Findings so far (Pixel 9a, Android 16, 7.4 GB RAM, synthetic fixtures only)

| Input | Result |
|---|---|
| PDF with a plain font (Courier, Type1) | Text layer extracted: 960 chars in 182 ms. Parser: 11/11 rows, date correct. |
| PDF with an embedded subset TrueType font (macOS Quartz output) | **0 chars, no error** (`success=true`). PDFBox cannot map the glyphs. Real lab PDFs often embed fonts, so an empty result must be treated as "no usable text layer" and sent to render + OCR. |
| Image, flattened to white | ML Kit OCR: 617 chars, 54 lines, about 400 ms. |
| Image with transparent background | 0 chars. Not a bug, but camera and gallery inputs must be flattened or checked for alpha before OCR. |

- ML Kit emits column-wise reading order, so name, value, unit and range land on separate lines and the row parser found 0 rows. `src/utils/ocrLayout.ts` rebuilds rows from line bounding boxes (unit-tested). After that fix: 10/11 rows parsed, 1 unparsed (`g/dL` misread as `9d`). That line is the kind the SLM fallback is for.
- Still to test: scanned PDF through the new renderer (fixtures added), the embedded-font PDF through render + OCR, report 2 (dot leaders) via OCR, real consented reports, and both Qwen models.

## Next steps (pick up here)

1. Download Qwen2.5-0.5B-Instruct and 1.5B-Instruct Q4 GGUF files to the phone (not into git). Run button 2 and 3 in the spike screen and fill in the SLM table above (load time, RAM via `adb shell dumpsys meminfo dev.someshmohapatra.labtrends`, tok/s, accuracy on unparsed lines such as the `9d` unit case).
2. Build with the new `modules/pdf-page-renderer` module, then run `fixtures/sample_report_*_scanned.pdf` and the embedded-font PDF through button 1 (render + OCR + `rebuildRows`). Record render ms per page and rows parsed in the results table.
3. Run fixture 2 (dot-leader layout) through OCR and check row parsing.
4. Test 5 to 10 consented real reports on-device only. Never commit them.
5. Write the go/no-go on the SLM fallback, then stop and confirm before Phase 1.

Dev loop: `npx expo start --dev-client`, `adb reverse tcp:8081 tcp:8081`, then open `exp+labtrends://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` on the phone.
