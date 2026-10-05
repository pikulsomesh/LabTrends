import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALIAS_SEED, canonicalize, createCanonicalizer, normalizeName, seedEntries } from './aliases';
import { parseReport } from './parser';

const fixture = (n: string) => readFileSync(join(__dirname, '../../fixtures', n), 'utf8');

describe('alias seed', () => {
  it('maps no printed name to two canonical names', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [canonical, names] of Object.entries(ALIAS_SEED)) {
      for (const n of [canonical, ...names]) {
        const key = normalizeName(n);
        const prev = seen.get(key);
        if (prev && prev !== canonical) clashes.push(`${n}: ${prev} vs ${canonical}`);
        seen.set(key, canonical);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('maps every canonical name to itself', () => {
    for (const canonical of Object.keys(ALIAS_SEED)) expect(canonicalize(canonical)).toBe(canonical);
  });

  it('stores normalized aliases only', () => {
    for (const [alias] of seedEntries()) expect(alias).toBe(normalizeName(alias));
  });

  it.each(['sample_report_1.txt', 'sample_report_2.txt'])('canonicalizes every row of %s', (f) => {
    const unknown = parseReport(fixture(f)).rows.filter((r) => r.canonicalName === null);
    expect(unknown.map((r) => r.name)).toEqual([]);
  });

  it.each([
    ['S.G.P.T.', 'ALT'],
    ['Gamma GT (GGTP)', 'GGT'],
    ['Glucose - Fasting', 'Fasting Glucose'],
    ['Glucose (PP)', 'Postprandial Glucose'],
    ['PCV (Packed Cell Volume)', 'Hematocrit'],
    ['LDL Cholesterol - Direct', 'LDL Cholesterol'],
    ['Cholesterol (HDL)', 'HDL Cholesterol'],
    ['TSH - Ultrasensitive', 'TSH'],
    ['Free T4 (FT4)', 'Free T4'],
    ['25-OH Vitamin D', 'Vitamin D'],
    ['Vitamin B-12', 'Vitamin B12'],
    ['Neutrophils', 'Neutrophils'],
    ['Neutrophils (Absolute)', 'Absolute Neutrophil Count'],
    ['Serum Creatinine', 'Creatinine'],
    ['Sodium (Na+)', 'Sodium'],
    ['Erythrocyte Sedimentation Rate (ESR)', 'ESR'],
  ])('%s -> %s', (printed, canonical) => expect(canonicalize(printed)).toBe(canonical));

  it('does not guess for unrelated names', () => {
    expect(canonicalize('Vitamin K')).toBeNull();
    expect(canonicalize('Arterial Blood Gas (ABG)')).toBeNull();
  });
});

describe('createCanonicalizer', () => {
  it('normalizes the aliases it is given', () => {
    const c = createCanonicalizer([['Thyro-Marker X', 'Marker X']]);
    expect(c('thyro marker x')).toBe('Marker X');
    expect(c('Something (THYRO MARKER X)')).toBe('Marker X');
  });
});
