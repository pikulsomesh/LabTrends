import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setUserAlias } from '../db/aliases';
import { createProfile, listProfiles } from '../db/profiles';
import { listReports, saveVerifiedReport } from '../db/reports';
import { prepareDatabase } from '../db/schema';
import { openTestDb } from '../db/testDb';
import { parseReport } from '../utils/parser';
import { decryptBackup, DEFAULT_KDF, encryptBackup, NotABackupError, WrongPassphraseError } from './crypto';
import { collectBackup, InvalidBackupError, parseBackup, restoreBackup } from './data';
import { escapeHtml, loadSummary, summaryHtml } from './summaryHtml';

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const FAST = { m: 8192, t: 1, p: 1 };
const PASS = 'correct horse battery';
const fixture = (n: number) => readFileSync(`${__dirname}/../../fixtures/sample_report_${n}.txt`, 'utf8');
const bytes = (s: string) => new TextEncoder().encode(s);

describe('backup encryption', () => {
  it('round-trips with the default Argon2id settings', () => {
    const file = encryptBackup(bytes('hello'), PASS, rnd);
    expect(new TextDecoder().decode(decryptBackup(file, PASS))).toBe('hello');
    expect(new TextDecoder().decode(file.subarray(0, 4))).toBe('LTBK');
    expect(JSON.parse(new TextDecoder().decode(file.subarray(7, 7 + ((file[5] << 8) | file[6]))))).toMatchObject({ kdf: 'argon2id', ...DEFAULT_KDF });
  });

  it('does not contain the plaintext', () => {
    const file = encryptBackup(bytes('SGPT 52 U/L'), PASS, rnd, FAST);
    expect(Buffer.from(file).includes(Buffer.from('SGPT'))).toBe(false);
  });

  it('uses a fresh salt and nonce every time', () => {
    const a = encryptBackup(bytes('x'), PASS, rnd, FAST);
    const b = encryptBackup(bytes('x'), PASS, rnd, FAST);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('rejects a wrong passphrase', () => {
    const file = encryptBackup(bytes('x'), PASS, rnd, FAST);
    expect(() => decryptBackup(file, 'wrong passphrase')).toThrow(WrongPassphraseError);
  });

  it('rejects a changed byte in the ciphertext or the header', () => {
    const file = encryptBackup(bytes('some data'), PASS, rnd, FAST);
    const body = file.slice();
    body[body.length - 20] ^= 1;
    expect(() => decryptBackup(body, PASS)).toThrow(WrongPassphraseError);
    // Lower the KDF cost in the header: it is authenticated, so this fails too.
    const len = (file[5] << 8) | file[6];
    const header = new TextDecoder().decode(file.subarray(7, 7 + len)).replace('"t":1', '"t":2');
    const tampered = file.slice();
    tampered.set(bytes(header), 7);
    expect(() => decryptBackup(tampered, PASS)).toThrow(WrongPassphraseError);
  });

  it('rejects files that are not backups, and unsafe KDF settings', () => {
    expect(() => decryptBackup(bytes('%PDF-1.7 ...'), PASS)).toThrow(NotABackupError);
    expect(() => encryptBackup(bytes('x'), 'short', rnd)).toThrow(/at least 8/);
    const huge = encryptBackup(bytes('x'), PASS, rnd, { m: 8192, t: 1, p: 1 });
    const hlen = (huge[5] << 8) | huge[6];
    const big = huge.slice();
    big.set(bytes(new TextDecoder().decode(huge.subarray(7, 7 + hlen)).replace('"t":1', '"t":9')), 7);
    expect(() => decryptBackup(big, PASS)).toThrow(WrongPassphraseError); // in range: authenticated, fails
    const evil = huge.slice();
    evil.set(bytes(new TextDecoder().decode(huge.subarray(7, 7 + hlen)).replace('"m":8192', '"m":9000')), 7);
    expect(() => decryptBackup(evil, PASS)).toThrow(WrongPassphraseError);
    // A header asking for 4 GiB of memory is refused before any key derivation.
    const h = bytes(new TextDecoder().decode(huge.subarray(7, 7 + hlen)).replace('"m":8192', '"m":4194304'));
    const costly = new Uint8Array([...huge.subarray(0, 5), h.length >> 8, h.length & 0xff, ...h, ...huge.subarray(7 + hlen)]);
    expect(() => decryptBackup(costly, PASS)).toThrow(NotABackupError);
  });
});

describe('collect and restore', () => {
  let db: ReturnType<typeof openTestDb>;

  const save = async (profileId: number, n: number, date: string) => {
    const p = parseReport(fixture(n));
    await saveVerifiedReport(db, profileId, { date, category: 'LIVER', labName: 'Lab <A>', sourceFileHash: 'f'.repeat(64) },
      p.rows.map((r) => ({ name: r.name, canonicalName: r.canonicalName, value: r.value, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh, rawRefText: r.rawRefText })));
  };

  beforeEach(async () => {
    db = openTestDb();
    await prepareDatabase(db);
    const asha = await createProfile(db, 'Asha');
    await save(asha.id, 1, '2026-03-12');
    await save(asha.id, 2, '2026-09-09');
    await createProfile(db, 'Ravi');
    await setUserAlias(db, 'Mystery Marker', 'Vitamin D');
  });
  afterEach(() => db.close());

  it('round-trips through encryption into a fresh phone', async () => {
    const data = await collectBackup(db);
    expect(data.profiles.map((p) => [p.name, p.reports.length])).toEqual([['Asha', 2], ['Ravi', 0]]);
    expect(data.userAliases).toEqual([['mystery marker', 'Vitamin D']]);

    const file = encryptBackup(bytes(JSON.stringify(data)), PASS, rnd, FAST);
    const restored = parseBackup(JSON.parse(new TextDecoder().decode(decryptBackup(file, PASS))));

    const fresh = openTestDb();
    await prepareDatabase(fresh);
    expect(await restoreBackup(fresh, restored)).toEqual({ profiles: 2, reports: 2, values: 19 });
    const again = await collectBackup(fresh, new Date(data.exportedAt));
    expect(again.profiles.map((p) => ({ ...p, createdAt: '' }))).toEqual(data.profiles.map((p) => ({ ...p, createdAt: '' })));
    expect(again.userAliases).toEqual(data.userAliases);
    fresh.close();
  });

  it('adds restored profiles next to existing ones without merging', async () => {
    const data = parseBackup(JSON.parse(JSON.stringify(await collectBackup(db))));
    await restoreBackup(db, data);
    await restoreBackup(db, data);
    expect((await listProfiles(db)).map((p) => p.name).sort()).toEqual(
      ['Asha', 'Asha (restored)', 'Asha (restored 2)', 'Ravi', 'Ravi (restored)', 'Ravi (restored 2)'].sort(),
    );
    const restoredAsha = (await listProfiles(db)).find((p) => p.name === 'Asha (restored)')!;
    expect(await listReports(db, restoredAsha.id)).toHaveLength(2);
  });

  it('rejects damaged or newer backups before writing anything', async () => {
    const good = JSON.parse(JSON.stringify(await collectBackup(db)));
    expect(() => parseBackup({ ...good, schemaVersion: 99 })).toThrow(/newer version/);
    expect(() => parseBackup({ ...good, format: 2 })).toThrow(InvalidBackupError);
    const badValue = structuredClone(good);
    badValue.profiles[0].reports[0].biomarkers[0].value = 'NaN';
    expect(() => parseBackup(badValue)).toThrow(InvalidBackupError);
    const badDate = structuredClone(good);
    badDate.profiles[0].reports[0].date = '2026-13-40';
    expect(() => parseBackup(badDate)).toThrow(/report 1/);
  });

  it('rolls back a restore that fails part way', async () => {
    const data = parseBackup(JSON.parse(JSON.stringify(await collectBackup(db))));
    // Bypass validation to force a constraint failure on the last value.
    data.profiles[0].reports[1].biomarkers.at(-1)!.name = '';
    await expect(restoreBackup(db, data)).rejects.toThrow();
    expect((await listProfiles(db)).map((p) => p.name)).toEqual(['Asha', 'Ravi']);
  });
});

describe('PDF summary', () => {
  it('escapes user text', () => {
    expect(escapeHtml(`<b>"Asha's" & co</b>`)).toBe('&lt;b&gt;&quot;Asha&#39;s&quot; &amp; co&lt;/b&gt;');
  });

  it('lists every value by panel with no external resources and no labels', async () => {
    const db = openTestDb();
    await prepareDatabase(db);
    const p = await createProfile(db, 'Asha <script>');
    const parsed = parseReport(fixture(1));
    await saveVerifiedReport(db, p.id, { date: '2026-03-12', category: null, labName: 'Lab <A>', sourceFileHash: null },
      parsed.rows.map((r) => ({ name: r.name, canonicalName: r.canonicalName, value: r.value, unit: r.unit, refLow: r.refLow, refHigh: r.refHigh, rawRefText: r.rawRefText })));
    const html = summaryHtml('Asha <script>', await loadSummary(db, p.id), 'Not a medical device.', new Date('2026-10-05T00:00:00Z'));
    db.close();
    expect(html).not.toMatch(/<script|https?:|src=/i);
    expect(html).toContain('Asha &lt;script&gt;');
    expect(html).toContain('Lab &lt;A&gt;');
    expect(html.indexOf('<h2>Liver</h2>')).toBeLessThan(html.indexOf('<h2>Diabetes</h2>'));
    expect(html).toContain('<h3>ALT</h3>');
    expect(html).toContain('Not a medical device.');
    expect(html).not.toMatch(/\b(abnormal|elevated|normal)\b/i);
  });
});
