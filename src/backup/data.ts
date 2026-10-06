// What a backup holds (PLAN.md Phase 8): every profile with its verified reports and values, and
// the user's own aliases. Seed aliases and app state are rebuilt by the app, so they stay out.
// Restore adds the backup's profiles next to any already on the phone, in one transaction.
import { cleanBiomarker, cleanReport } from '../db/reports';
import { SCHEMA_VERSION } from '../db/schema';
import { transaction } from '../db/transaction';
import type { Db, NewBiomarker, NewReport } from '../db/types';
import { normalizeName } from '../utils/aliases';

export const BACKUP_FORMAT = 1;

export interface BackupReport extends NewReport {
  biomarkers: NewBiomarker[];
}

export interface BackupProfile {
  name: string;
  createdAt: string;
  reports: BackupReport[];
}

export interface BackupData {
  format: number;
  schemaVersion: number;
  exportedAt: string;
  profiles: BackupProfile[];
  /** [printed name, canonical name] pairs the user added. */
  userAliases: [string, string][];
}

export async function collectBackup(db: Db, now = new Date()): Promise<BackupData> {
  const profiles = await db.getAllAsync<{ id: number; name: string; created_at: string }>('SELECT id, name, created_at FROM profiles ORDER BY id', []);
  const out: BackupProfile[] = [];
  for (const p of profiles) {
    const reports = await db.getAllAsync<{ id: number; date: string; category: string | null; lab_name: string | null; source_file_hash: string | null }>(
      'SELECT id, date, category, lab_name, source_file_hash FROM reports WHERE profile_id = ? ORDER BY date, id',
      [p.id],
    );
    const rs: BackupReport[] = [];
    for (const r of reports) {
      const values = await db.getAllAsync<{ name: string; canonical_name: string | null; value: number; unit: string | null; ref_low: number | null; ref_high: number | null; raw_ref_text: string | null }>(
        'SELECT name, canonical_name, value, unit, ref_low, ref_high, raw_ref_text FROM biomarkers WHERE report_id = ? ORDER BY id',
        [r.id],
      );
      rs.push({
        date: r.date,
        category: r.category,
        labName: r.lab_name,
        sourceFileHash: r.source_file_hash,
        biomarkers: values.map((b) => ({
          name: b.name,
          canonicalName: b.canonical_name,
          value: b.value,
          unit: b.unit,
          refLow: b.ref_low,
          refHigh: b.ref_high,
          rawRefText: b.raw_ref_text,
        })),
      });
    }
    out.push({ name: p.name, createdAt: p.created_at, reports: rs });
  }
  const aliases = await db.getAllAsync<{ alias: string; canonical_name: string }>("SELECT alias, canonical_name FROM aliases WHERE source = 'user' ORDER BY alias", []);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    profiles: out,
    userAliases: aliases.map((a) => [a.alias, a.canonical_name]),
  };
}

export class InvalidBackupError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, nullable = false) => typeof v === 'string' || (nullable && v === null);
const num = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));

/** Checks the decrypted JSON and runs every report through the same validation as a normal save. */
export function parseBackup(json: unknown): BackupData {
  const bad = (what: string): never => {
    throw new InvalidBackupError(`The backup is damaged or from an unknown app version (${what}).`);
  };
  if (!isObj(json) || json.format !== BACKUP_FORMAT) bad('format');
  const d = json as Record<string, unknown>;
  if (typeof d.schemaVersion !== 'number' || d.schemaVersion > SCHEMA_VERSION) {
    throw new InvalidBackupError('This backup was made by a newer version of LabTrends. Update the app, then restore.');
  }
  if (!Array.isArray(d.profiles) || !Array.isArray(d.userAliases)) bad('contents');

  const profiles = (d.profiles as unknown[]).map((p, pi): BackupProfile => {
    if (!isObj(p) || !str(p.name) || !Array.isArray(p.reports)) bad(`profile ${pi + 1}`);
    const pr = p as Record<string, unknown>;
    const name = (pr.name as string).trim();
    if (!name || name.length > 60) bad(`profile ${pi + 1} name`);
    return {
      name,
      createdAt: typeof pr.createdAt === 'string' ? pr.createdAt : '',
      reports: (pr.reports as unknown[]).map((r, ri) => {
        const at = `profile ${pi + 1}, report ${ri + 1}`;
        if (!isObj(r)) return bad(at);
        if (!str(r.date) || !str(r.category, true) || !str(r.labName, true) || !str(r.sourceFileHash, true) || !Array.isArray(r.biomarkers)) bad(at);
        try {
          const report = cleanReport(r as unknown as NewReport);
          const biomarkers = (r.biomarkers as unknown[]).map((b, bi) => {
            if (!isObj(b) || !str(b.name) || !str(b.canonicalName, true) || typeof b.value !== 'number' || !str(b.unit, true) || !num(b.refLow) || !num(b.refHigh) || !str(b.rawRefText, true)) bad(`${at}, value ${bi + 1}`);
            return cleanBiomarker(b as unknown as NewBiomarker, bi);
          });
          if (!biomarkers.length) bad(`${at} has no values`);
          return { ...report, biomarkers };
        } catch (e) {
          if (e instanceof InvalidBackupError) throw e;
          return bad(`${at}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    };
  });

  const userAliases = (d.userAliases as unknown[]).map((a, i): [string, string] => {
    if (!Array.isArray(a) || a.length !== 2 || typeof a[0] !== 'string' || typeof a[1] !== 'string') return bad(`alias ${i + 1}`);
    const [alias, canonical] = [normalizeName(a[0]), a[1].trim()];
    if (!alias || !canonical) bad(`alias ${i + 1}`);
    return [alias, canonical];
  });

  return { format: BACKUP_FORMAT, schemaVersion: d.schemaVersion as number, exportedAt: String(d.exportedAt ?? ''), profiles, userAliases };
}

export interface RestoreSummary {
  profiles: number;
  reports: number;
  values: number;
}

/**
 * Adds the backup's profiles. A name already on the phone gets " (restored)" so nothing is merged
 * by accident. User aliases from the backup replace the phone's mapping for the same printed name.
 */
export async function restoreBackup(db: Db, data: BackupData): Promise<RestoreSummary> {
  const summary: RestoreSummary = { profiles: 0, reports: 0, values: 0 };
  await transaction(db, async () => {
    const existing = new Set((await db.getAllAsync<{ name: string }>('SELECT name FROM profiles', [])).map((p) => p.name.toLowerCase()));
    for (const p of data.profiles) {
      let name = p.name;
      for (let n = 1; existing.has(name.toLowerCase()); n++) {
        const suffix = n === 1 ? ' (restored)' : ` (restored ${n})`;
        name = p.name.slice(0, 60 - suffix.length).trimEnd() + suffix;
      }
      existing.add(name.toLowerCase());
      const { lastInsertRowId: profileId } = await db.runAsync('INSERT INTO profiles (name) VALUES (?)', [name]);
      summary.profiles++;
      for (const r of p.reports) {
        const { lastInsertRowId: reportId } = await db.runAsync(
          'INSERT INTO reports (profile_id, date, category, lab_name, source_file_hash) VALUES (?, ?, ?, ?, ?)',
          [profileId, r.date, r.category, r.labName, r.sourceFileHash],
        );
        summary.reports++;
        for (const b of r.biomarkers) {
          await db.runAsync(
            `INSERT INTO biomarkers (report_id, name, canonical_name, value, unit, ref_low, ref_high, raw_ref_text)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [reportId, b.name, b.canonicalName, b.value, b.unit, b.refLow, b.refHigh, b.rawRefText],
          );
          summary.values++;
        }
      }
    }
    for (const [alias, canonical] of data.userAliases) {
      await db.runAsync(
        `INSERT INTO aliases (alias, canonical_name, source) VALUES (?, ?, 'user')
         ON CONFLICT(alias) DO UPDATE SET canonical_name = excluded.canonical_name, source = 'user'`,
        [alias, canonical],
      );
    }
  });
  return summary;
}
