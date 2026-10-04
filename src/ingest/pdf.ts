// PDF to plain text, in memory only. Text layer first; when it is missing or unusable, render each
// page to an image, OCR it, rebuild rows from line boxes, and delete the page image straight away.
// Native calls are injected so this runs under vitest without a device.
import { rebuildRows, type OcrLine } from '../utils/ocrLayout';
import { assessTextLayer, type TextLayerVerdict } from '../utils/textLayer';

export interface TextLayerResult {
  text: string;
  pageCount: number;
  success: boolean;
  errorCode?: string;
  error?: string;
}

export interface PdfDeps {
  extractTextLayer(uri: string): Promise<TextLayerResult>;
  getPageCount(uri: string): Promise<number>;
  /** Renders one page (0-based) to a cache image on a white background and returns its file URI. */
  renderPage(uri: string, pageIndex: number): Promise<string>;
  ocrImage(imageUri: string): Promise<OcrLine[]>;
  deleteFile(uri: string): void;
}

export type OcrReason = Exclude<TextLayerVerdict, { usable: true }>['reason'] | 'extract-failed';

export type PdfTextResult =
  | { source: 'text-layer'; text: string; pageCount: number }
  | { source: 'ocr'; text: string; pageCount: number; reason: OcrReason; textLayerError?: string };

const PASSWORD_CODES = new Set(['PASSWORD_REQUIRED', 'INCORRECT_PASSWORD']);

export class PdfPasswordError extends Error {
  constructor(readonly code: string) {
    super('This PDF is password protected. Remove the password and import it again.');
  }
}

export async function extractPdfText(uri: string, deps: PdfDeps): Promise<PdfTextResult> {
  const layer = await deps.extractTextLayer(uri);
  // The renderer cannot open these either, so OCR is no way around a password.
  if (!layer.success && layer.errorCode && PASSWORD_CODES.has(layer.errorCode)) {
    throw new PdfPasswordError(layer.errorCode);
  }

  let reason: OcrReason;
  if (layer.success) {
    const verdict = assessTextLayer(layer.text, layer.pageCount);
    if (verdict.usable) return { source: 'text-layer', text: layer.text, pageCount: layer.pageCount };
    reason = verdict.reason;
  } else {
    // PDFBox can choke on PDFs that Android's renderer (pdfium) still draws.
    reason = 'extract-failed';
  }

  const pageCount = await deps.getPageCount(uri);
  const pages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const image = await deps.renderPage(uri, i);
    try {
      pages.push(rebuildRows(await deps.ocrImage(image)));
    } finally {
      deps.deleteFile(image); // guardrail 2: no rendered page left in cache
    }
  }
  return {
    source: 'ocr',
    text: pages.filter(Boolean).join('\n'),
    pageCount,
    reason,
    ...(layer.success ? {} : { textLayerError: layer.errorCode ?? layer.error }),
  };
}
