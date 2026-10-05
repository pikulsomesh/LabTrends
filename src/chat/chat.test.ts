import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProfile } from '../db/profiles';
import { saveVerifiedReport } from '../db/reports';
import { prepareDatabase } from '../db/schema';
import { openTestDb } from '../db/testDb';
import { chartScale, groupByUnit, latestRange, shortDate } from '../dashboard/chartData';
import type { SeriesPoint } from '../db/biomarkers';
import { ALIAS_SEED, canonicalize } from '../utils/aliases';
import { parseReport } from '../utils/parser';
import { PANELS, panelOf } from '../utils/panels';
import { HELP_REPLY, OUT_OF_SCOPE_REPLY } from './answer';
import { ask, loadMarkerIndex } from './chat';
import { editDistance, findMarkers, parseQuestion, type MarkerIndex } from './intent';

const fixture = (n: number) => readFileSync(`${__dirname}/../../fixtures/sample_report_${n}.txt`, 'utf8');

describe('panels', () => {
  it('puts every canonical marker in exactly one panel', () => {
    const all = Object.values(PANELS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(Object.keys(ALIAS_SEED)));
  });
  it('sends unknown printed names to Other', () => expect(panelOf('Mystery Marker')).toBe('Other'));
});

const pt = (date: string, value: number, unit: string | null, refLow: number | null = null, refHigh: number | null = null): SeriesPoint => ({
  reportId: 1, date, labName: null, name: 'x', value, unit, refLow, refHigh, rawRefText: null,
});

describe('chart data', () => {
  it('plots the most common unit and lists the others', () => {
    const g = groupByUnit([pt('2025-01-01', 2.1, 'lakh/cumm'), pt('2025-06-01', 210, 'x10^3/uL'), pt('2026-01-01', 2.4, 'Lakh/Cumm')]);
    expect(g.main.map((p) => p.value)).toEqual([2.1, 2.4]);
    expect(g.unit).toBe('Lakh/Cumm');
    expect(g.other.map((p) => p.value)).toEqual([210]);
  });

  it('breaks a tie in favour of the latest unit', () => {
    expect(groupByUnit([pt('2025-01-01', 1, 'a'), pt('2026-01-01', 2, 'b')]).unit).toBe('b');
  });

  it('uses the latest printed range', () => {
    expect(latestRange([pt('2025-01-01', 1, 'u', 0, 40), pt('2026-01-01', 2, 'u', 7, 41)])).toEqual({ low: 7, high: 41 });
  });

  it.each([
    [[0.8, 0.3, 1.2], { min: 0, max: 1.5, step: 0.5, sections: 3 }],
    [[52, 47, 41], { min: 40, max: 55, step: 5, sections: 3 }],
    [[7200, 4000, 11000], { min: 4000, max: 12000, step: 2000, sections: 4 }],
    [[5, 5], { min: 4.5, max: 5.5, step: 0.5, sections: 2 }],
  ])('scales %j', (values, scale) => expect(chartScale(values)).toEqual(scale));

  it('holds every value', () => {
    for (const vals of [[0.01, 0.07], [130, 1450, 980], [-3, 4]]) {
      const s = chartScale(vals);
      expect(s.min).toBeLessThanOrEqual(Math.min(...vals));
      expect(s.max).toBeGreaterThanOrEqual(Math.max(...vals));
    }
  });

  it('formats short dates', () => expect(shortDate('2026-03-12')).toBe('12 Mar 26'));
});

describe('editDistance', () => {
  it.each([
    ['hemoglobin', 'haemoglobin', 1],
    ['platelet', 'platelets', 1],
    ['ferritin', 'feritin', 1],
    ['abc', 'xyz', 3],
  ])('%s/%s', (a, b, d) => expect(editDistance(a, b)).toBe(d));
});

describe('parseQuestion', () => {
  const index: MarkerIndex = {
    canonicalize,
    aliases: new Map(Object.entries(ALIAS_SEED).flatMap(([c, names]) => [[c.toLowerCase(), c] as [string, string], ...names.map((n) => [n, c] as [string, string])])),
    markerKeys: ['ALT', 'Hemoglobin', 'HbA1c', 'Mystery Marker'],
  };
  const q = (t: string) => parseQuestion(t, index);

  it.each([
    ['show my ALT trend', 'trend', ['ALT']],
    ['SGPT over time', 'trend', ['ALT']],
    ['latest haemoglobin', 'latest', ['Hemoglobin']],
    ['what is my hemoglobn', 'latest', ['Hemoglobin']],
    ['HbA1c', 'latest', ['HbA1c']],
    ['compare HbA1c', 'compare', ['HbA1c']],
    ['ALT vs AST', 'compare', ['ALT', 'AST']],
    ['what is the normal range for TSH', 'range', ['TSH']],
    ['reference range of vitamin b12', 'range', ['Vitamin B12']],
    ['list my tests', 'list', []],
    ['mystery marker history', 'trend', ['Mystery Marker']],
    ['total bilirubin last value', 'latest', ['Total Bilirubin']],
  ])('%s', (text, intent, markers) => expect(q(text)).toEqual({ kind: 'ask', intent, markers }));

  it.each([
    'is my ALT high?',
    'is this normal',
    'what does low hemoglobin mean',
    'should I worry about my TSH',
    'what diet lowers LDL',
    'am I healthy',
  ])('refuses "%s"', (text) => expect(q(text)).toEqual({ kind: 'out-of-scope' }));

  it('offers help for a greeting', () => expect(q('hi')).toEqual({ kind: 'help' }));

  it('does not fuzzily match question words', () => {
    expect(findMarkers('latest values change trend', index)).toEqual([]);
  });

  it('prefers the longest name', () => {
    expect(findMarkers('direct bilirubin', index)).toEqual(['Direct Bilirubin']);
  });
});

describe('ask', () => {
  let db: ReturnType<typeof openTestDb>;
  let profileId: number;
  let index: MarkerIndex;

  const save = async (n: number, date: string, lab: string) => {
    const p = parseReport(fixture(n));
    await saveVerifiedReport(db, profileId, { date, category: null, labName: lab, sourceFileHash: null },
      p.rows.map((r) => ({ name: r.name, canonicalName: r.canonicalName, value: r.value, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh, rawRefText: r.rawRefText })));
  };

  beforeEach(async () => {
    db = openTestDb();
    await prepareDatabase(db);
    profileId = (await createProfile(db, 'Asha')).id;
    await save(1, '2026-03-12', 'Lab A');
    await save(2, '2026-09-09', 'Lab B');
    index = await loadMarkerIndex(db, profileId);
  });
  afterEach(() => db.close());

  // Answers must never label values; checked on every reply.
  const LABEL_WORDS = /\b(normal|abnormal|high|low|good|bad|healthy|elevated|concern)\b/i;
  const reply = async (t: string) => {
    const out = await ask(db, profileId, index, t);
    for (const a of out) expect(a.text).not.toMatch(LABEL_WORDS);
    return out;
  };

  it('answers the latest value with its date, lab and printed range', async () => {
    const [a] = await reply('latest ALT');
    expect(a.text).toBe('Your latest ALT is 47 IU/L on 2026-09-09 (Lab B). Printed range: 7 - 40.');
    expect(a.chart).toBeUndefined();
  });

  it('answers a trend with a chart of every value', async () => {
    const [a] = await reply('ALT trend');
    expect(a.text).toMatch(/^2 ALT values from 2026-03-12 to 2026-09-09/);
    expect(a.chart?.points.map((p) => p.value)).toEqual([52, 47]);
  });

  it('compares the last two values', async () => {
    const [a] = await reply('compare SGPT');
    expect(a.text).toBe('ALT was 52 U/L on 2026-03-12 (Lab A) and 47 IU/L on 2026-09-09 (Lab B). The two values use different units, so no difference is shown.');
  });

  it('gives the printed range', async () => {
    const [a] = await reply('ALT normal range');
    expect(a.text).toBe('The range printed with your latest ALT (2026-09-09) is 7 - 40 IU/L.');
  });

  it('lists saved tests by panel', async () => {
    const [a] = await reply('list my tests');
    expect(a.text).toMatch(/^Saved tests/);
    expect(a.text).toMatch(/Liver: .*ALT \(2\)/);
  });

  it('says when a known test has no values', async () => {
    const [a] = await reply('latest TSH');
    expect(a.text).toBe('No TSH values are saved for this profile yet.');
  });

  it('gives the fixed reply to interpretation questions', async () => {
    expect(await reply('is my ALT bad?')).toEqual([{ text: OUT_OF_SCOPE_REPLY }]);
    expect(await reply('help')).toEqual([{ text: HELP_REPLY }]);
  });

  it('never answers from another profile', async () => {
    const other = (await createProfile(db, 'Ravi')).id;
    const otherIndex = await loadMarkerIndex(db, other);
    const [a] = await ask(db, other, otherIndex, 'latest ALT');
    expect(a.text).toBe('No ALT values are saved for this profile yet.');
  });
});
