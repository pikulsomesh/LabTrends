// Read queries for charts and the data-only chat. Every query is scoped to one profile.
// A value's key is its canonical name, or its printed name when no alias matched.
import type { Db } from './types';

export interface MarkerSummary {
  key: string;
  count: number;
  latestDate: string;
}

export interface SeriesPoint {
  reportId: number;
  date: string;
  labName: string | null;
  name: string;
  /** Null for a result printed as words; see valueText. */
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  rawRefText: string | null;
}

interface SeriesRow {
  report_id: number;
  date: string;
  lab_name: string | null;
  name: string;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  raw_ref_text: string | null;
}

const KEY = 'COALESCE(b.canonical_name, b.name)';

const SERIES_SQL = `SELECT b.report_id, r.date, r.lab_name, b.name, b.value, b.value_text, b.unit, b.ref_low, b.ref_high, b.raw_ref_text
  FROM biomarkers b JOIN reports r ON r.id = b.report_id
  WHERE r.profile_id = ? AND ${KEY} = ?`;

const toPoint = (r: SeriesRow): SeriesPoint => ({
  reportId: r.report_id,
  date: r.date,
  labName: r.lab_name,
  name: r.name,
  value: r.value,
  valueText: r.value_text,
  unit: r.unit,
  refLow: r.ref_low,
  refHigh: r.ref_high,
  rawRefText: r.raw_ref_text,
});

/** Every marker the profile has values for, alphabetical. */
export async function listMarkers(db: Db, profileId: number): Promise<MarkerSummary[]> {
  return db.getAllAsync<MarkerSummary>(
    `SELECT ${KEY} AS key, count(*) AS count, max(r.date) AS latestDate
     FROM biomarkers b JOIN reports r ON r.id = b.report_id
     WHERE r.profile_id = ?
     GROUP BY ${KEY} ORDER BY ${KEY} COLLATE NOCASE`,
    [profileId],
  );
}

/** All values of one marker, oldest first. */
export async function getSeries(db: Db, profileId: number, key: string): Promise<SeriesPoint[]> {
  const rows = await db.getAllAsync<SeriesRow>(`${SERIES_SQL} ORDER BY r.date, r.id, b.id`, [profileId, key]);
  return rows.map(toPoint);
}

/** The most recent value of one marker, or null. */
export async function getLatest(db: Db, profileId: number, key: string): Promise<SeriesPoint | null> {
  const row = await db.getFirstAsync<SeriesRow>(
    `${SERIES_SQL} ORDER BY r.date DESC, r.id DESC, b.id DESC LIMIT 1`,
    [profileId, key],
  );
  return row ? toPoint(row) : null;
}

/** A recorded value as text: the number, or the words printed for it, with the unit. */
export const formatValue = (p: Pick<SeriesPoint, 'value' | 'valueText' | 'unit'>) =>
  `${p.valueText ?? p.value ?? ''}${p.unit ? ` ${p.unit}` : ''}`;
