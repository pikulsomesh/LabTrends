// Turns a picked PDF or a set of photos into plain text, in memory only (PLAN.md Phase 4).
// Every input file is hashed for duplicate detection, then deleted from the app cache whether
// extraction succeeds or not (guardrail 2). Native calls are injected so this runs under vitest.
import { rebuildRows } from '../utils/ocrLayout';
import { extractPdfText, type OcrReason, type PdfDeps } from './pdf';

export type IngestInput = { kind: 'pdf'; uri: string } | { kind: 'images'; uris: string[] };

export interface IngestDeps extends PdfDeps {
  /** file:// URI of the app cache directory. Only files under it are ever deleted. */
  cacheDir: string;
  /** Upright, white-backed copy of a photo in the cache, ready for OCR. Returns its file URI. */
  prepareImage(uri: string): Promise<string>;
  /** Lowercase hex SHA-256 of the file. */
  hashFile(uri: string): Promise<string>;
}

export interface Extracted {
  /** Report text, one visual row per line. Lives in memory only; never written to disk or the DB. */
  text: string;
  kind: IngestInput['kind'];
  method: 'text-layer' | 'ocr';
  pageCount: number;
  /** SHA-256 of each input file, in page order, for duplicate detection on save. */
  fileHashes: string[];
  /** Why a PDF went to OCR instead of its text layer. */
  ocrReason?: OcrReason;
}

export class NoTextError extends Error {
  constructor() {
    super('No text was found. Try a sharper, well-lit photo, or the original PDF from the lab.');
  }
}

// file:/x, file:///x and /x all name the same path.
const filePath = (uri: string) => (/^file:/.test(uri) ? `/${uri.replace(/^file:\/*/, '')}` : uri);

export const isInCache = (uri: string, cacheDir: string) => {
  const dir = filePath(cacheDir).replace(/\/*$/, '/');
  const path = filePath(uri);
  return dir.startsWith('/') && path.startsWith(dir) && !path.slice(dir.length).split('/').includes('..');
};

export async function ingest(input: IngestInput, deps: IngestDeps): Promise<Extracted> {
  const originals = input.kind === 'pdf' ? [input.uri] : input.uris;
  try {
    const fileHashes: string[] = [];
    for (const uri of originals) fileHashes.push(await deps.hashFile(uri));

    let result: Extracted;
    if (input.kind === 'pdf') {
      const r = await extractPdfText(input.uri, deps);
      result = {
        text: r.text,
        kind: 'pdf',
        method: r.source,
        pageCount: r.pageCount,
        fileHashes,
        ...(r.source === 'ocr' ? { ocrReason: r.reason } : {}),
      };
    } else {
      const pages: string[] = [];
      for (const uri of input.uris) {
        const image = await deps.prepareImage(uri);
        try {
          pages.push(rebuildRows(await deps.ocrImage(image)));
        } finally {
          deps.deleteFile(image);
        }
      }
      result = { text: pages.filter(Boolean).join('\n'), kind: 'images', method: 'ocr', pageCount: pages.length, fileHashes };
    }

    if (!result.text.trim()) throw new NoTextError();
    return result;
  } finally {
    // The picker and camera copies. A URI outside the cache is the user's own file: never touch it.
    for (const uri of originals) {
      if (!isInCache(uri, deps.cacheDir)) continue;
      try {
        deps.deleteFile(uri);
      } catch {
        // Already gone. The startup sweep catches anything else left behind.
      }
    }
  }
}

/** Adds more photographed pages to an earlier photo result, in the order they were taken. */
export function appendPages(a: Extracted, b: Extracted): Extracted {
  if (a.kind !== 'images' || b.kind !== 'images') throw new Error('Only photo pages can be combined');
  return {
    ...a,
    text: [a.text, b.text].filter(Boolean).join('\n'),
    pageCount: a.pageCount + b.pageCount,
    fileHashes: [...a.fileHashes, ...b.fileHashes],
  };
}

/**
 * Cache subfolders that can hold report files, page images, PDF summaries or backup files.
 * Emptied at startup in case the app died before deleting them.
 */
export const INGEST_CACHE_DIRS = ['DocumentPicker', 'ImagePicker', 'pdf-render', 'ingest-image', 'Print', 'export'] as const;
