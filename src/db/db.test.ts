import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseReport } from '../utils/parser';
import { listCanonicalNames, loadCanonicalizer, setUserAlias, seedAliases } from './aliases';
import { getLatest, getSeries, listMarkers } from './biomarkers';
import { createProfile, deleteProfile, getProfile, listProfiles, renameProfile } from './profiles';
import { deleteReport, findReportsByHash, getReport, listReports, saveVerifiedReport } from './reports';
import { MIGRATIONS, migrate, prepareDatabase, SCHEMA_VERSION, userVersion } from './schema';
import { openTestDb } from './testDb';
import type { NewBiomarker, NewReport } from './types';

const fixture = (n: string) => readFileSync(join(__dirname, '../../fixtures', n), 'utf8');

/** What the Verification screen would hand over after the user confirms a fixture's rows. */
function verified(file: string, hash: string | null = null): [NewReport, NewBiomarker[]] {
  const p = parseReport(fixture(file));
  return [
    { date: p.date!, category: null, labName: file, sourceFileHash: hash },
    p.rows.map((r) => ({
      name: r.name,
      canonicalName: r.canonicalName,
      value: r.value,
      unit: r.unit,
      refLow: r.refLow,
      refHigh: r.refHigh,
      rawRefText: r.rawRefText,
    })),
  ];
}

const HASH = 'a'.repeat(64);
let db: ReturnType<typeof openTestDb>;

beforeEach(async () => {
  db = openTestDb();
  await prepareDatabase(db);
});
afterEach(() => db.close());

const count = async (table: string) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${table}`, []))!.n;

describe('migrations', () => {
  it('brings a fresh database to the latest user_version', async () => {
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      [],
    );
    expect(tables.map((t) => t.name)).toEqual(['aliases', 'biomarkers', 'profiles', 'reports']);
  });

  it('is a no-op when already current, and keeps data', async () => {
    await createProfile(db, 'Asha');
    await prepareDatabase(db);
    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
    expect(await listProfiles(db)).toHaveLength(1);
  });

  it('refuses a database from a newer app version', async () => {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer than this app/);
  });

  it('has no column that could hold a file, image or OCR dump', async () => {
    const cols = await db.getAllAsync<{ type: string }>(
      "SELECT p.type FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table'",
      [],
    );
    expect(cols.map((c) => c.type)).not.toContain('BLOB');
  });
});

describe('profiles', () => {
  it('creates, lists, renames and deletes', async () => {
    const b = await createProfile(db, '  Ravi ');
    const a = await createProfile(db, 'Asha');
    expect(b.name).toBe('Ravi');
    expect((await listProfiles(db)).map((p) => p.name)).toEqual(['Asha', 'Ravi']);
    expect(await renameProfile(db, a.id, 'Asha M')).toBe(true);
    expect((await getProfile(db, a.id))!.name).toBe('Asha M');
    expect(await deleteProfile(db, a.id)).toBe(true);
    expect(await getProfile(db, a.id)).toBeNull();
  });

  it('rejects empty names', async () => {
    await expect(createProfile(db, '   ')).rejects.toThrow(/empty/);
  });

  it('cascades deletes to reports and values', async () => {
    const p = await createProfile(db, 'Asha');
    await saveVerifiedReport(db, p.id, ...verified('sample_report_1.txt'));
    expect(await count('biomarkers')).toBe(11);
    await deleteProfile(db, p.id);
    expect(await count('reports')).toBe(0);
    expect(await count('biomarkers')).toBe(0);
  });
});

describe('reports', () => {
  it('saves a verified fixture report and reads it back', async () => {
    const p = await createProfile(db, 'Asha');
    const id = await saveVerifiedReport(db, p.id, ...verified('sample_report_1.txt', HASH.toUpperCase()));
    const r = (await getReport(db, p.id, id))!;
    expect(r).toMatchObject({ date: '2026-03-12', sourceFileHash: HASH, biomarkerCount: 11 });
    expect(r.biomarkers.find((b) => b.name === 'SGPT (ALT)')).toMatchObject({
      canonicalName: 'ALT',
      value: 52,
      unit: 'U/L',
      refLow: null,
      refHigh: 41,
      rawRefText: '< 41',
    });
    expect((await findReportsByHash(db, p.id, HASH)).map((x) => x.id)).toEqual([id]);
  });

  it('lists newest first and deletes with cascade', async () => {
    const p = await createProfile(db, 'Asha');
    const first = await saveVerifiedReport(db, p.id, ...verified('sample_report_1.txt'));
    const second = await saveVerifiedReport(db, p.id, ...verified('sample_report_2.txt'));
    expect((await listReports(db, p.id)).map((r) => r.id)).toEqual([second, first]);
    expect(await deleteReport(db, p.id, first)).toBe(true);
    expect(await count('biomarkers')).toBe(8);
  });

  it.each<[string, (r: NewReport, b: NewBiomarker[]) => void, RegExp]>([
    ['an invalid date', (r) => (r.date = '2026-02-30'), /valid yyyy-mm-dd/],
    ['a non-ISO date', (r) => (r.date = '12/03/2026'), /valid yyyy-mm-dd/],
    ['a bad hash', (r) => (r.sourceFileHash = 'not-a-hash'), /SHA-256/],
    ['a non-finite value', (_, b) => (b[3].value = NaN), /Row 4 .*finite/],
    ['an empty name', (_, b) => (b[0].name = ' '), /Row 1: name/],
    ['an oversized reference text', (_, b) => (b[0].rawRefText = 'x'.repeat(500)), /120 characters/],
    ['no values', (_, b) => b.splice(0), /at least one value/],
  ])('rejects %s and writes nothing', async (_, mutate, error) => {
    const p = await createProfile(db, 'Asha');
    const [r, b] = verified('sample_report_1.txt');
    mutate(r, b);
    await expect(saveVerifiedReport(db, p.id, r, b)).rejects.toThrow(error);
    expect(await count('reports')).toBe(0);
  });

  it('rolls back everything when the profile does not exist', async () => {
    await expect(saveVerifiedReport(db, 999, ...verified('sample_report_1.txt'))).rejects.toThrow(/FOREIGN KEY/);
    expect(await count('reports')).toBe(0);
    expect(await count('biomarkers')).toBe(0);
  });

  it('serializes concurrent saves', async () => {
    const p = await createProfile(db, 'Asha');
    const ids = await Promise.all([
      saveVerifiedReport(db, p.id, ...verified('sample_report_1.txt')),
      saveVerifiedReport(db, p.id, ...verified('sample_report_2.txt')),
      saveVerifiedReport(db, p.id, ...verified('sample_report_1.txt')),
    ]);
    expect(new Set(ids).size).toBe(3);
    expect(await count('biomarkers')).toBe(11 + 8 + 11);
  });
});

describe('profile scoping', () => {
  it('never returns or deletes another profile’s data', async () => {
    const asha = await createProfile(db, 'Asha');
    const ravi = await createProfile(db, 'Ravi');
    const id = await saveVerifiedReport(db, asha.id, ...verified('sample_report_1.txt', HASH));
    expect(await listReports(db, ravi.id)).toEqual([]);
    expect(await getReport(db, ravi.id, id)).toBeNull();
    expect(await findReportsByHash(db, ravi.id, HASH)).toEqual([]);
    expect(await listMarkers(db, ravi.id)).toEqual([]);
    expect(await getSeries(db, ravi.id, 'ALT')).toEqual([]);
    expect(await getLatest(db, ravi.id, 'ALT')).toBeNull();
    expect(await deleteReport(db, ravi.id, id)).toBe(false);
    expect(await count('reports')).toBe(1);
  });
});

describe('biomarker queries', () => {
  it('joins both fixture formats into one series by canonical name', async () => {
    const p = await createProfile(db, 'Asha');
    await saveVerifiedReport(db, p.id, ...verified('sample_report_2.txt'));
    await saveVerifiedReport(db, p.id, ...verified('sample_report_1.txt'));

    const alt = await getSeries(db, p.id, 'ALT');
    expect(alt.map((x) => [x.date, x.name, x.value])).toEqual([
      ['2026-03-12', 'SGPT (ALT)', 52],
      ['2026-09-09', 'ALT / SGPT', 47],
    ]);
    expect(await getLatest(db, p.id, 'Hemoglobin')).toMatchObject({ date: '2026-09-09', value: 13.1 });

    const markers = await listMarkers(db, p.id);
    expect(markers.find((m) => m.key === 'ALT')).toEqual({ key: 'ALT', count: 2, latestDate: '2026-09-09' });
    expect(markers.find((m) => m.key === 'Fasting Glucose')).toEqual({
      key: 'Fasting Glucose',
      count: 1,
      latestDate: '2026-03-12',
    });
  });

  it('keys values with no canonical name by their printed name', async () => {
    const p = await createProfile(db, 'Asha');
    const [r, b] = verified('sample_report_1.txt');
    b[0] = { ...b[0], name: 'Mystery Marker', canonicalName: null };
    await saveVerifiedReport(db, p.id, r, b);
    expect((await getSeries(db, p.id, 'Mystery Marker')).map((x) => x.value)).toEqual([0.8]);
  });
});

describe('alias table', () => {
  it('is seeded once and canonicalizes like the in-memory normalizer', async () => {
    const n = await count('aliases');
    expect(n).toBeGreaterThan(200);
    await seedAliases(db);
    expect(await count('aliases')).toBe(n);
    const canonicalize = await loadCanonicalizer(db);
    expect(canonicalize('SGPT (ALT)')).toBe('ALT');
    expect(canonicalize('Haemoglobin (Hb)')).toBe('Hemoglobin');
    expect(await listCanonicalNames(db)).toContain('Vitamin D');
  });

  it('keeps user aliases, and user overrides survive a reseed', async () => {
    await setUserAlias(db, 'Liver Enzyme X', 'ALT');
    await setUserAlias(db, 'HB', 'Custom Hb');
    await seedAliases(db);
    const canonicalize = await loadCanonicalizer(db);
    expect(canonicalize('liver enzyme-x')).toBe('ALT');
    expect(canonicalize('Hb')).toBe('Custom Hb');
    expect(canonicalize('Hemoglobin')).toBe('Hemoglobin');
  });
});
