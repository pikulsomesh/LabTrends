import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { OcrLine } from '../utils/ocrLayout';
import { parseReport } from '../utils/parser';
import { appendPages, ingest, isInCache, NoTextError, type IngestDeps } from './ingest';
import { PdfPasswordError } from './pdf';

const CACHE = 'file:///data/user/0/app/cache/';
const fixture = (n: number) => readFileSync(`${__dirname}/../../fixtures/sample_report_${n}.txt`, 'utf8');

// One OCR box per whitespace-separated column, in ML Kit's column-wise order.
function ocrBoxes(text: string): OcrLine[] {
  const cells = text.split('\n').flatMap((line, row) =>
    [...line.matchAll(/\S+(?: \S+)*/g)].map((m) => ({ text: m[0], left: m.index * 10, top: row * 30, width: m[0].length * 10, height: 20 })),
  );
  return cells.sort((a, b) => a.left - b.left || a.top - b.top);
}

/** Pages keyed by the original photo or PDF URI. */
function makeDeps(opts: { layerText?: string; pages: Record<string, string> }) {
  const temp: string[] = [];
  const deps: IngestDeps = {
    cacheDir: CACHE,
    extractTextLayer: vi.fn(async () => ({ text: opts.layerText ?? '', pageCount: 1, success: true })),
    getPageCount: vi.fn(async () => 1),
    renderPage: vi.fn(async (uri: string) => {
      const img = `${CACHE}pdf-render/${temp.length}.png?src=${uri}`;
      temp.push(img);
      return img;
    }),
    prepareImage: vi.fn(async (uri: string) => {
      const img = `${CACHE}ingest-image/${temp.length}.jpg?src=${uri}`;
      temp.push(img);
      return img;
    }),
    ocrImage: vi.fn(async (img: string) => ocrBoxes(opts.pages[img.split('?src=')[1]] ?? '')),
    deleteFile: vi.fn(),
    hashFile: vi.fn(async (uri: string) => `hash(${uri})`),
  };
  return { deps, temp, deleted: () => vi.mocked(deps.deleteFile).mock.calls.map((c) => c[0]) };
}

describe('ingest', () => {
  it('returns the PDF text layer, hashes the file, and deletes the picker copy', async () => {
    const pdf = `${CACHE}DocumentPicker/a.pdf`;
    const { deps, deleted } = makeDeps({ layerText: fixture(1), pages: {} });
    const r = await ingest({ kind: 'pdf', uri: pdf }, deps);
    expect(r).toEqual({ text: fixture(1), kind: 'pdf', method: 'text-layer', pageCount: 1, fileHashes: [`hash(${pdf})`] });
    expect(deleted()).toEqual([pdf]);
  });

  it('OCRs a scanned PDF and deletes the rendered page and the picker copy', async () => {
    const pdf = `${CACHE}DocumentPicker/scan.pdf`;
    const { deps, temp, deleted } = makeDeps({ pages: { [pdf]: fixture(2) } });
    const r = await ingest({ kind: 'pdf', uri: pdf }, deps);
    expect(r).toMatchObject({ kind: 'pdf', method: 'ocr', ocrReason: 'empty' });
    expect(parseReport(r.text).rows.length).toBe(parseReport(fixture(2)).rows.length);
    expect(deleted()).toEqual([...temp, pdf]);
  });

  it('OCRs photos in order, deleting each prepared image and each original', async () => {
    const p1 = `${CACHE}ImagePicker/1.jpg`;
    const p2 = `${CACHE}ImagePicker/2.jpg`;
    const { deps, temp, deleted } = makeDeps({ pages: { [p1]: fixture(1), [p2]: fixture(2) } });
    const r = await ingest({ kind: 'images', uris: [p1, p2] }, deps);
    expect(r).toMatchObject({ kind: 'images', method: 'ocr', pageCount: 2, fileHashes: [`hash(${p1})`, `hash(${p2})`] });
    expect(r.text.indexOf('LIVER FUNCTION TEST')).toBeLessThan(r.text.indexOf('LIVER PROFILE'));
    expect(deps.prepareImage).toHaveBeenCalledTimes(2);
    expect(deleted()).toEqual([temp[0], temp[1], p1, p2]);
  });

  it('hashes before extracting, so a hash exists even for a file that is deleted next', async () => {
    const p = `${CACHE}ImagePicker/1.jpg`;
    const { deps } = makeDeps({ pages: { [p]: fixture(1) } });
    await ingest({ kind: 'images', uris: [p] }, deps);
    expect(vi.mocked(deps.hashFile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.prepareImage).mock.invocationCallOrder[0]);
  });

  it('deletes the originals and the prepared image when OCR fails', async () => {
    const p = `${CACHE}ImagePicker/1.jpg`;
    const { deps, temp, deleted } = makeDeps({ pages: { [p]: fixture(1) } });
    vi.mocked(deps.ocrImage).mockRejectedValueOnce(new Error('ML Kit failed'));
    await expect(ingest({ kind: 'images', uris: [p] }, deps)).rejects.toThrow('ML Kit failed');
    expect(deleted()).toEqual([temp[0], p]);
  });

  it('deletes the picker copy of a password-protected PDF', async () => {
    const pdf = `${CACHE}DocumentPicker/locked.pdf`;
    const { deps, deleted } = makeDeps({ pages: {} });
    vi.mocked(deps.extractTextLayer).mockResolvedValueOnce({ text: '', pageCount: 0, success: false, errorCode: 'PASSWORD_REQUIRED' });
    await expect(ingest({ kind: 'pdf', uri: pdf }, deps)).rejects.toBeInstanceOf(PdfPasswordError);
    expect(deleted()).toEqual([pdf]);
  });

  it('rejects a photo with no readable text', async () => {
    const p = `${CACHE}ImagePicker/blank.jpg`;
    const { deps, deleted } = makeDeps({ pages: { [p]: '' } });
    await expect(ingest({ kind: 'images', uris: [p] }, deps)).rejects.toBeInstanceOf(NoTextError);
    expect(deleted()).toContain(p);
  });

  it('never deletes a file outside the app cache', async () => {
    const own = 'content://com.android.providers.downloads/document/42';
    const { deps, deleted } = makeDeps({ layerText: fixture(1), pages: {} });
    await ingest({ kind: 'pdf', uri: own }, deps);
    expect(deleted()).toEqual([]);
  });

  it('keeps going when deleting the original fails', async () => {
    const pdf = `${CACHE}DocumentPicker/a.pdf`;
    const { deps } = makeDeps({ layerText: fixture(1), pages: {} });
    vi.mocked(deps.deleteFile).mockImplementation(() => {
      throw new Error('gone');
    });
    await expect(ingest({ kind: 'pdf', uri: pdf }, deps)).resolves.toMatchObject({ method: 'text-layer' });
  });
});

describe('isInCache', () => {
  it.each([
    [`${CACHE}ImagePicker/a.jpg`, true],
    ['file:///data/user/0/app/cache-other/a.jpg', false],
    [`${CACHE}../files/app.db`, false],
    ['file:///storage/emulated/0/Download/report.pdf', false],
    ['file:/data/user/0/app/cache/DocumentPicker/a.pdf', true],
    ['content://app/cache/a.pdf', false],
  ])('%s -> %s', (uri, expected) => {
    expect(isInCache(uri, CACHE.slice(0, -1))).toBe(expected);
    expect(isInCache(uri, CACHE)).toBe(expected);
  });
});

describe('appendPages', () => {
  const page = (text: string, hash: string) => ({ text, kind: 'images' as const, method: 'ocr' as const, pageCount: 1, fileHashes: [hash] });

  it('joins photo pages in order', () => {
    expect(appendPages(page('a', 'h1'), page('b', 'h2'))).toEqual({ text: 'a\nb', kind: 'images', method: 'ocr', pageCount: 2, fileHashes: ['h1', 'h2'] });
  });

  it('refuses to mix a PDF with photos', () => {
    const pdf = { ...page('a', 'h1'), kind: 'pdf' as const };
    expect(() => appendPages(pdf, page('b', 'h2'))).toThrow();
  });
});
