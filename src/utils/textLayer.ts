// Decides whether a PDF's extracted text layer is usable or the PDF must go to render + OCR.
// PDFBox returns success with 0 chars (or only page-break whitespace) for scans and for PDFs whose
// embedded subset fonts have no Unicode mapping, so emptiness is the signal, not an error.

/** Fewer letters and digits than this per page means no usable text layer (scans often carry a stray header or page number). */
export const MIN_ALNUM_PER_PAGE = 20;
/** Above this share of unmappable glyphs (U+FFFD, private use area, control chars) the text is garbage. */
export const MAX_UNMAPPED_RATIO = 0.2;

export type TextLayerVerdict =
  | { usable: true }
  | { usable: false; reason: 'empty' | 'sparse' | 'unmapped-glyphs' };

const UNMAPPED_RE = /[�-\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu;
const ALNUM_RE = /[\p{L}\p{N}]/gu;

export function assessTextLayer(text: string, pageCount: number): TextLayerVerdict {
  const visible = text.replace(/\s+/g, '');
  if (!visible) return { usable: false, reason: 'empty' };

  const unmapped = visible.match(UNMAPPED_RE)?.length ?? 0;
  if (unmapped / visible.length > MAX_UNMAPPED_RATIO) return { usable: false, reason: 'unmapped-glyphs' };

  const alnum = visible.match(ALNUM_RE)?.length ?? 0;
  if (alnum < MIN_ALNUM_PER_PAGE * Math.max(1, pageCount)) return { usable: false, reason: 'sparse' };

  return { usable: true };
}
