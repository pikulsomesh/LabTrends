import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { OcrLine } from '../utils/ocrLayout';
import { parseReport } from '../utils/parser';
import { extractPdfText, PdfPasswordError, type PdfDeps, type TextLayerResult } from './pdf';

const fixture = (n: number) => readFileSync(`${__dirname}/../../fixtures/sample_report_${n}.txt`, 'utf8');

// Fake OCR output for a page: one box per whitespace-separated column, in ML Kit's column-wise order.
function ocrBoxes(text: string): OcrLine[] {
  const cells = text.split('\n').flatMap((line, row) =>
    [...line.matchAll(/\S+(?: \S+)*/g)].map((m) => ({
      text: m[0],
      left: m.index * 10,
      top: row * 30,
      width: m[0].length * 10,
      height: 20,
    })),
  );
  return cells.sort((a, b) => a.left - b.left || a.top - b.top);
}

function makeDeps(layer: TextLayerResult, pages: string[]) {
  const rendered: string[] = [];
  const deps: PdfDeps = {
    extractTextLayer: vi.fn(async () => layer),
    getPageCount: vi.fn(async () => pages.length),
    renderPage: vi.fn(async (_uri, i) => {
      const img = `file:///cache/pdf-render/page${i}.png`;
      rendered.push(img);
      return img;
    }),
    ocrImage: vi.fn(async (img: string) => ocrBoxes(pages[Number(/page(\d+)/.exec(img)![1])])),
    deleteFile: vi.fn(),
  };
  return { deps, rendered };
}

describe('extractPdfText', () => {
  it('uses the text layer when it is usable and never renders', async () => {
    const { deps } = makeDeps({ text: fixture(1), pageCount: 1, success: true }, [fixture(1)]);
    const r = await extractPdfText('file:///a.pdf', deps);
    expect(r).toEqual({ source: 'text-layer', text: fixture(1), pageCount: 1 });
    expect(deps.renderPage).not.toHaveBeenCalled();
  });

  it('routes an empty successful extraction (embedded subset font) to render + OCR', async () => {
    const { deps } = makeDeps({ text: '\n\n', pageCount: 1, success: true }, [fixture(1)]);
    const r = await extractPdfText('file:///a.pdf', deps);
    expect(r.source).toBe('ocr');
    expect(r).toMatchObject({ reason: 'empty', pageCount: 1 });
    const parsed = parseReport(r.text);
    expect(parsed.rows.length).toBe(parseReport(fixture(1)).rows.length);
    expect(parsed.date).toBe('2026-03-12');
  });

  it('OCRs every page in order and deletes each rendered image', async () => {
    const { deps, rendered } = makeDeps({ text: '', pageCount: 2, success: true }, [fixture(1), fixture(2)]);
    const r = await extractPdfText('file:///a.pdf', deps);
    expect(rendered).toHaveLength(2);
    expect(vi.mocked(deps.deleteFile).mock.calls.map((c) => c[0])).toEqual(rendered);
    expect(r.text.indexOf('LIVER FUNCTION TEST')).toBeLessThan(r.text.indexOf('LIVER PROFILE'));
  });

  it('deletes the rendered image even when OCR throws', async () => {
    const { deps, rendered } = makeDeps({ text: '', pageCount: 1, success: true }, [fixture(1)]);
    vi.mocked(deps.ocrImage).mockRejectedValueOnce(new Error('ML Kit failed'));
    await expect(extractPdfText('file:///a.pdf', deps)).rejects.toThrow('ML Kit failed');
    expect(deps.deleteFile).toHaveBeenCalledWith(rendered[0]);
  });

  it('falls back to OCR when PDFBox fails for a non-password reason', async () => {
    const { deps } = makeDeps({ text: '', pageCount: 0, success: false, errorCode: 'CORRUPT_PDF' }, [fixture(2)]);
    const r = await extractPdfText('file:///a.pdf', deps);
    expect(r).toMatchObject({ source: 'ocr', reason: 'extract-failed', textLayerError: 'CORRUPT_PDF', pageCount: 1 });
  });

  it.each(['PASSWORD_REQUIRED', 'INCORRECT_PASSWORD'])('stops on %s without rendering', async (code) => {
    const { deps } = makeDeps({ text: '', pageCount: 0, success: false, errorCode: code }, [fixture(1)]);
    await expect(extractPdfText('file:///a.pdf', deps)).rejects.toBeInstanceOf(PdfPasswordError);
    expect(deps.renderPage).not.toHaveBeenCalled();
  });
});
