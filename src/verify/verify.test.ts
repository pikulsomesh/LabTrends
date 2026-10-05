import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractReport } from '../ai/extract';
import { setUserAlias } from '../db/aliases';
import { createProfile } from '../db/profiles';
import { getReport, listReports } from '../db/reports';
import { prepareDatabase } from '../db/schema';
import { openTestDb } from '../db/testDb';
import { canonicalize } from '../utils/aliases';
import { addManualRow, draftFromExtraction, parseNumber, removeRow, updateRow, validateDraft, type Draft } from './draft';
import { findDuplicates, saveDraft } from './save';

const fixture = (n: number) => readFileSync(`${__dirname}/../../fixtures/sample_report_${n}.txt`, 'utf8');
const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const NOW = new Date('2026-10-05T12:00:00');

async function draftFor(n: number, extra = '', hashes = [H1]): Promise<Draft> {
  return draftFromExtraction(await extractReport(fixture(n) + extra, null), hashes);
}

describe('draftFromExtraction', () => {
  it('turns parser rows into editable text fields with their source lines', async () => {
    const d = await draftFor(1);
    expect(d.date).toBe('2026-03-12');
    expect(d.rows).toHaveLength(11);
    const alt = d.rows.find((r) => r.name === 'SGPT (ALT)')!;
    expect(alt).toMatchObject({ value: '52', refLow: '', refHigh: '41', origin: 'parser', included: true });
    expect(alt.sourceLine).toContain('SGPT');
  });

  it('picks the category most rows were printed under', async () => {
    expect((await draftFor(1)).category).toBe('LIVER FUNCTION TEST');
  });
});

describe('editing', () => {
  it('turns an unread line into a manual row and removes it from the unread list', async () => {
    const line = 'Haemoglobin           13.4   9d        13.0 - 17.0';
    let d = await draftFor(1, `\n${line}`);
    expect(d.unparsed).toEqual([line]);
    d = addManualRow(d, line);
    expect(d.unparsed).toEqual([]);
    expect(d.rows.at(-1)).toMatchObject({ origin: 'manual', sourceLine: line, value: '' });
  });

  it('clears the printed range text when a bound is edited', async () => {
    let d = await draftFor(1);
    const k = d.rows[0].key;
    d = updateRow(d, k, { refHigh: '1.5' });
    expect(d.rows[0]).toMatchObject({ refHigh: '1.5', rawRefText: '' });
  });

  it('removes a row', async () => {
    const d = await draftFor(1);
    expect(removeRow(d, d.rows[0].key).rows).toHaveLength(10);
  });
});

describe('parseNumber', () => {
  it.each([
    ['13.4', 13.4],
    [' 7,200 ', 7200],
    ['-1.5', -1.5],
    ['.5', 0.5],
    ['1,00', null],
    ['13.4 mg', null],
    ['', null],
    ['1e5', null],
  ])('%j -> %j', (t, n) => expect(parseNumber(t)).toBe(n));
});

describe('validateDraft', () => {
  it('builds report and biomarker rows from a clean draft', async () => {
    const v = validateDraft(await draftFor(2), canonicalize, NOW);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.report).toEqual({ date: '2026-09-09', category: expect.any(String), labName: null, sourceFileHash: H1 });
    expect(v.biomarkers).toHaveLength(8);
    expect(v.biomarkers.find((b) => b.name === 'ALT / SGPT')).toMatchObject({ canonicalName: 'ALT', value: 47, refLow: 7, refHigh: 40 });
  });

  it('leaves out rows the user unticked', async () => {
    const d = await draftFor(1);
    const v = validateDraft(updateRow(d, d.rows[0].key, { included: false }), canonicalize, NOW);
    expect(v.ok && v.biomarkers).toHaveLength(10);
  });

  it('reports each bad field by row', async () => {
    let d = await draftFor(1);
    const [a, b, c] = d.rows.map((r) => r.key);
    d = updateRow(d, a, { value: '1.2.3' });
    d = updateRow(d, b, { name: '  ' });
    d = updateRow(d, c, { refLow: '10', refHigh: '5' });
    d = { ...d, date: '2026-02-30' };
    const v = validateDraft(d, canonicalize, NOW);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(Object.keys(v.errors).sort()).toEqual([`${a}.value`, `${b}.name`, `${c}.refHigh`, 'date'].sort());
  });

  it('rejects a future date and an empty report', async () => {
    const d = await draftFor(1);
    const none = d.rows.reduce((x, r) => updateRow(x, r.key, { included: false }), { ...d, date: '2026-10-06' });
    const v = validateDraft(none, canonicalize, NOW);
    expect(!v.ok && v.errors).toMatchObject({ date: expect.any(String), rows: expect.any(String) });
  });

  it('writes range text for a row typed by hand', async () => {
    let d = addManualRow(await draftFor(1));
    const k = d.rows.at(-1)!.key;
    d = updateRow(d, k, { name: 'Vitamin D', value: '24', refLow: '30', refHigh: '100' });
    const v = validateDraft(d, canonicalize, NOW);
    expect(v.ok && v.biomarkers.at(-1)).toMatchObject({ name: 'Vitamin D', rawRefText: '30 - 100', unit: null });
  });
});

describe('saveDraft', () => {
  let db: ReturnType<typeof openTestDb>;
  let profileId: number;

  beforeEach(async () => {
    db = openTestDb();
    await prepareDatabase(db);
    profileId = (await createProfile(db, 'Asha')).id;
  });
  afterEach(() => db.close());

  it('saves a verified draft and finds it again by any file hash', async () => {
    const r = await saveDraft(db, profileId, await draftFor(1, '', [H1, H2]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const saved = await getReport(db, profileId, r.reportId);
    expect(saved).toMatchObject({ date: '2026-03-12', sourceFileHash: H1, biomarkerCount: 11 });
    expect((await findDuplicates(db, profileId, [H2, H1])).map((x) => x.id)).toEqual([r.reportId]);
  });

  it('writes nothing when the draft does not validate', async () => {
    const r = await saveDraft(db, profileId, { ...(await draftFor(1)), date: '' }, NOW);
    expect(r.ok).toBe(false);
    expect(await listReports(db, profileId)).toEqual([]);
  });

  it('uses aliases the user added', async () => {
    await setUserAlias(db, 'Mystery Marker', 'Vitamin D');
    let d = addManualRow(await draftFor(1));
    d = updateRow(d, d.rows.at(-1)!.key, { name: 'Mystery Marker', value: '24' });
    const r = await saveDraft(db, profileId, d, NOW);
    const saved = r.ok ? await getReport(db, profileId, r.reportId) : null;
    expect(saved?.biomarkers.at(-1)).toMatchObject({ name: 'Mystery Marker', canonicalName: 'Vitamin D' });
  });

  it('does not report duplicates from another profile', async () => {
    await saveDraft(db, profileId, await draftFor(1), NOW);
    const other = (await createProfile(db, 'Ravi')).id;
    expect(await findDuplicates(db, other, [H1])).toEqual([]);
  });
});
