import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessTextLayer } from './textLayer';

const fixture = (n: number) => readFileSync(`${__dirname}/../../fixtures/sample_report_${n}.txt`, 'utf8');

describe('assessTextLayer', () => {
  it('accepts a real text layer', () => {
    expect(assessTextLayer(fixture(1), 1)).toEqual({ usable: true });
    expect(assessTextLayer(fixture(2), 1)).toEqual({ usable: true });
  });

  it('flags the 0-char success PDFBox returns for embedded subset fonts', () => {
    expect(assessTextLayer('', 1)).toEqual({ usable: false, reason: 'empty' });
  });

  it('treats page-break whitespace as empty', () => {
    expect(assessTextLayer('\n\r\n\f\n  \n\t', 3)).toEqual({ usable: false, reason: 'empty' });
  });

  it('flags a scan that only carries a stray page footer', () => {
    expect(assessTextLayer('\nPage 1 of 2\n\nPage 2 of 2\n', 2)).toEqual({ usable: false, reason: 'sparse' });
  });

  it('scales the sparse threshold with page count', () => {
    const onePageOfText = fixture(2);
    expect(assessTextLayer(onePageOfText, 1).usable).toBe(true);
    expect(assessTextLayer(onePageOfText, 40)).toEqual({ usable: false, reason: 'sparse' });
  });

  it('flags glyphs with no Unicode mapping', () => {
    const garbage = fixture(1).replace(/[A-Za-z0-9]/g, '�');
    expect(assessTextLayer(garbage, 1)).toEqual({ usable: false, reason: 'unmapped-glyphs' });
    const pua = fixture(1).replace(/[A-Za-z]/g, '');
    expect(assessTextLayer(pua, 1)).toEqual({ usable: false, reason: 'unmapped-glyphs' });
  });

  it('tolerates a few unmapped glyphs in otherwise good text', () => {
    expect(assessTextLayer(fixture(1).replace('µ', '�') + '��', 1)).toEqual({ usable: true });
  });
});

describe('scanned PDF fixtures', () => {
  // Guards the fixtures themselves: they must stay image-only so they exercise the OCR path on device.
  it.each([1, 2])('sample_report_%i_scanned.pdf has an image and no text layer', (n) => {
    const pdf = readFileSync(`${__dirname}/../../fixtures/sample_report_${n}_scanned.pdf`).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toMatch(/\/Subtype\s*\/Image/);
    expect(pdf).not.toMatch(/\/Font\b/);
  });
});
