import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalize } from './aliases';
import { parseReport } from './parser';

const fixture = (n: string) => readFileSync(join(__dirname, '../../fixtures', n), 'utf8');

describe('canonicalize', () => {
  it.each([
    ['SGPT (ALT)', 'ALT'],
    ['ALT / SGPT', 'ALT'],
    ['SGOT (AST)', 'AST'],
    ['Haemoglobin (Hb)', 'Hemoglobin'],
    ['Total Leucocyte Count', 'WBC'],
    ['Bilirubin Total', 'Total Bilirubin'],
    ['Total Bilirubin', 'Total Bilirubin'],
    ['Platelet Count', 'Platelets'],
  ])('%s -> %s', (printed, canonical) => expect(canonicalize(printed)).toBe(canonical));

  it('returns null for unknown names', () => expect(canonicalize('Mystery Marker')).toBeNull());
});

describe('parseReport: report 1 (columnar)', () => {
  const r = parseReport(fixture('sample_report_1.txt'));
  const by = (n: string) => r.rows.find((x) => x.name === n)!;

  it('parses date and all 11 rows with nothing left over', () => {
    expect(r.date).toBe('2026-03-12');
    expect(r.rows).toHaveLength(11);
    expect(r.unparsed).toEqual([]);
  });
  it('handles ranges, bounds and thousands separators', () => {
    expect(by('Bilirubin Total')).toMatchObject({ value: 0.8, unit: 'mg/dL', refLow: 0.3, refHigh: 1.2 });
    expect(by('SGPT (ALT)')).toMatchObject({ value: 52, refLow: null, refHigh: 41, canonicalName: 'ALT' });
    expect(by('Total Leucocyte Count')).toMatchObject({ value: 7200, unit: '/cumm', refHigh: 11000 });
    expect(by('Platelet Count')).toMatchObject({ value: 2.1, unit: 'lakh/cumm' });
    expect(by('HbA1c')).toMatchObject({ unit: '%', category: 'DIABETES' });
  });
});

describe('parseReport: report 2 (dot leaders)', () => {
  const r = parseReport(fixture('sample_report_2.txt'));
  const by = (n: string) => r.rows.find((x) => x.name === n)!;

  it('parses date and all 8 rows with nothing left over', () => {
    expect(r.date).toBe('2026-09-09');
    expect(r.rows).toHaveLength(8);
    expect(r.unparsed).toEqual([]);
  });
  it('handles Ref: wrapper, odd units and alias names', () => {
    expect(by('ALT / SGPT')).toMatchObject({ value: 47, unit: 'IU/L', refLow: 7, refHigh: 40, canonicalName: 'ALT' });
    expect(by('WBC Count')).toMatchObject({ value: 6.9, unit: 'x10^3/uL', refLow: 4, refHigh: 10 });
    expect(by('Haemoglobin (Hb)')).toMatchObject({ canonicalName: 'Hemoglobin', unit: 'gm/dl' });
  });
});

describe('parseReport: report 3 (urine routine, text results)', () => {
  const r = parseReport(fixture('sample_report_3_urine.txt'));
  const by = (n: string) => r.rows.find((x) => x.name === n)!;

  it('keeps every result, words and numbers, with nothing left over', () => {
    expect(r.rows).toHaveLength(16);
    expect(r.unparsed).toEqual([]);
  });
  it('reads physical, chemical and microscopic results as printed', () => {
    expect(by('Colour')).toMatchObject({ value: null, valueText: 'Pale Yellow', rawRefText: 'Pale Yellow', canonicalName: 'Urine Colour' });
    expect(by('Protein')).toMatchObject({ value: null, valueText: 'Trace', rawRefText: 'Nil', canonicalName: 'Urine Protein' });
    expect(by('Blood')).toMatchObject({ valueText: 'Positive (+)', rawRefText: 'Negative' });
    expect(by('Pus Cells')).toMatchObject({ valueText: '2-4', unit: '/hpf', rawRefText: '0 - 5' });
    expect(by('Specific Gravity')).toMatchObject({ value: 1.015, valueText: null, unit: '', refLow: 1.005, refHigh: 1.03 });
    expect(by('Reaction (pH)')).toMatchObject({ value: 6, canonicalName: 'Urine pH' });
  });
  it('keeps urine RBC apart from the blood count', () => {
    expect(by('RBC')).toMatchObject({ specimen: 'urine', canonicalName: 'Urine RBC', valueText: 'Nil' });
    expect(by('RBC Count')).toMatchObject({ specimen: null, canonicalName: 'RBC', value: 4.8, category: 'COMPLETE BLOOD COUNT' });
    expect(by('Colour').category).toBe('URINE ROUTINE EXAMINATION');
  });
});

describe('parseReport: dates', () => {
  it('reads an ambiguous date in the order it is given', () => {
    const text = fixture('sample_report_3_urine.txt');
    expect(parseReport(text).date).toBe('2026-07-01');
    expect(parseReport(text, { dateOrder: 'dmy' }).date).toBe('2026-07-01');
    expect(parseReport(text, { dateOrder: 'mdy' }).date).toBe('2026-01-07');
  });
  it('uses the report\'s own unambiguous dates over the setting', () => {
    expect(parseReport(fixture('sample_report_1.txt'), { dateOrder: 'mdy' }).date).toBe('2026-03-12');
    expect(parseReport(fixture('sample_report_4_us.txt'), { dateOrder: 'dmy' }).date).toBe('2026-04-03');
  });
  it('prefers the collection date and skips the date of birth', () => {
    const r = parseReport(fixture('sample_report_4_us.txt'), { dateOrder: 'mdy' });
    expect(r.date).toBe('2026-04-03');
    expect(r.unparsed).toEqual([]);
  });
  it('reads a US urinalysis with dot leaders and graded results', () => {
    const r = parseReport(fixture('sample_report_4_us.txt'));
    expect(r.rows.map((x) => [x.canonicalName, x.valueText, x.rawRefText])).toEqual([
      ['Urine Colour', 'Yellow', 'Yellow'],
      ['Urine Appearance', 'Clear', 'Clear'],
      ['Urine Protein', 'Negative', 'Negative'],
      ['Urine Glucose', '1+', 'Negative'],
    ]);
  });
});
