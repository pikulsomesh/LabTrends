// Reports and their biomarker values. Every query is scoped to one profile.
//
// saveVerifiedReport is the only write path for lab values. Call it from the Verification screen
// with values the user has confirmed, never with raw parser or SLM output (CLAUDE.md guardrail 3).
import { transaction } from './transaction';
import type { Biomarker, Db, NewBiomarker, NewReport, Report, ReportWithBiomarkers } from './types';

interface ReportRow {
  id: number;
  profile_id: number;
  date: string;
  category: string | null;
  lab_name: string | null;
  source_file_hash: string | null;
  created_at: string;
  biomarker_count: number;
}

interface BiomarkerRow {
  id: number;
  report_id: number;
  name: string;
  canonical_name: string | null;
  value: number;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  raw_ref_text: string | null;
}

const REPORT_COLUMNS = `r.id, r.profile_id, r.date, r.category, r.lab_name, r.source_file_hash, r.created_at,
  (SELECT count(*) FROM biomarkers b WHERE b.report_id = r.id) AS biomarker_count`;

const toReport = (r: ReportRow): Report => ({
  id: r.id,
  profileId: r.profile_id,
  date: r.date,
  category: r.category,
  labName: r.lab_name,
  sourceFileHash: r.source_file_hash,
  createdAt: r.created_at,
  biomarkerCount: r.biomarker_count,
});

const toBiomarker = (r: BiomarkerRow): Biomarker => ({
  id: r.id,
  reportId: r.report_id,
  name: r.name,
  canonicalName: r.canonical_name,
  value: r.value,
  unit: r.unit,
  refLow: r.ref_low,
  refHigh: r.ref_high,
  rawRefText: r.raw_ref_text,
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function optText(v: string | null, max: number, field: string): string | null {
  const t = v?.trim();
  if (!t) return null;
  if (t.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return t;
}

function optNum(v: number | null, field: string): number | null {
  if (v === null) return null;
  if (!Number.isFinite(v)) throw new Error(`${field} must be a finite number.`);
  return v;
}

export function cleanReport(r: NewReport): NewReport {
  const date = r.date.trim();
  const d = new Date(`${date}T00:00:00Z`);
  if (!ISO_DATE.test(date) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
    throw new Error(`Report date must be a valid yyyy-mm-dd date, got "${r.date}".`);
  }
  const hash = r.sourceFileHash?.trim().toLowerCase() || null;
  if (hash !== null && !SHA256.test(hash)) throw new Error('Source file hash must be SHA-256 hex.');
  return {
    date,
    category: optText(r.category, 60, 'Category'),
    labName: optText(r.labName, 120, 'Lab name'),
    sourceFileHash: hash,
  };
}

export function cleanBiomarker(b: NewBiomarker, i: number): NewBiomarker {
  const at = `Row ${i + 1}`;
  const name = optText(b.name, 120, `${at} name`);
  if (!name) throw new Error(`${at}: name must not be empty.`);
  if (!Number.isFinite(b.value)) throw new Error(`${at} (${name}): value must be a finite number.`);
  return {
    name,
    canonicalName: optText(b.canonicalName, 120, `${at} canonical name`),
    value: b.value,
    unit: optText(b.unit, 40, `${at} unit`),
    refLow: optNum(b.refLow, `${at} reference low`),
    refHigh: optNum(b.refHigh, `${at} reference high`),
    rawRefText: optText(b.rawRefText, 120, `${at} reference range`),
  };
}

/** Saves a user-verified report and its values in one transaction. Returns the report id. */
export async function saveVerifiedReport(
  db: Db,
  profileId: number,
  report: NewReport,
  biomarkers: NewBiomarker[],
): Promise<number> {
  const r = cleanReport(report);
  if (biomarkers.length === 0) throw new Error('A report needs at least one value.');
  const rows = biomarkers.map(cleanBiomarker);

  return transaction(db, async () => {
    const { lastInsertRowId: reportId } = await db.runAsync(
      'INSERT INTO reports (profile_id, date, category, lab_name, source_file_hash) VALUES (?, ?, ?, ?, ?)',
      [profileId, r.date, r.category, r.labName, r.sourceFileHash],
    );
    for (const b of rows) {
      await db.runAsync(
        `INSERT INTO biomarkers (report_id, name, canonical_name, value, unit, ref_low, ref_high, raw_ref_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [reportId, b.name, b.canonicalName, b.value, b.unit, b.refLow, b.refHigh, b.rawRefText],
      );
    }
    return reportId;
  });
}

/** The profile's reports, newest first. */
export async function listReports(db: Db, profileId: number): Promise<Report[]> {
  const rows = await db.getAllAsync<ReportRow>(
    `SELECT ${REPORT_COLUMNS} FROM reports r WHERE r.profile_id = ? ORDER BY r.date DESC, r.id DESC`,
    [profileId],
  );
  return rows.map(toReport);
}

export async function getReport(db: Db, profileId: number, reportId: number): Promise<ReportWithBiomarkers | null> {
  const row = await db.getFirstAsync<ReportRow>(
    `SELECT ${REPORT_COLUMNS} FROM reports r WHERE r.profile_id = ? AND r.id = ?`,
    [profileId, reportId],
  );
  if (!row) return null;
  const values = await db.getAllAsync<BiomarkerRow>(
    'SELECT * FROM biomarkers WHERE report_id = ? ORDER BY id',
    [reportId],
  );
  return { ...toReport(row), biomarkers: values.map(toBiomarker) };
}

/** Reports in this profile saved from a file with the same hash, for duplicate warnings. */
export async function findReportsByHash(db: Db, profileId: number, sourceFileHash: string): Promise<Report[]> {
  const rows = await db.getAllAsync<ReportRow>(
    `SELECT ${REPORT_COLUMNS} FROM reports r WHERE r.profile_id = ? AND r.source_file_hash = ? ORDER BY r.id`,
    [profileId, sourceFileHash.trim().toLowerCase()],
  );
  return rows.map(toReport);
}

/** Deletes a report and its values. Returns false when it does not belong to the profile. */
export async function deleteReport(db: Db, profileId: number, reportId: number): Promise<boolean> {
  const { changes } = await db.runAsync('DELETE FROM reports WHERE profile_id = ? AND id = ?', [profileId, reportId]);
  return changes > 0;
}
