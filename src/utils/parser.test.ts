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
