// The subset of the expo-sqlite async API the data layer uses. expo-sqlite's SQLiteDatabase
// satisfies it on the phone; testDb.ts implements it over node:sqlite for unit tests.
export type SqlValue = string | number | null;

export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  /** BEGIN, task, COMMIT (ROLLBACK on throw) on this connection. Use `transaction()` instead. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface Profile {
  id: number;
  name: string;
  createdAt: string;
}

export interface NewReport {
  /** ISO yyyy-mm-dd, the collection date printed on the report. */
  date: string;
  category: string | null;
  labName: string | null;
  /** SHA-256 hex of the source file, for duplicate detection. Never the file itself. */
  sourceFileHash: string | null;
}

export interface Report extends NewReport {
  id: number;
  profileId: number;
  createdAt: string;
  biomarkerCount: number;
}

export interface NewBiomarker {
  /** Name as printed on the report. */
  name: string;
  canonicalName: string | null;
  /** The measured number. Null when the result is printed as words: then `valueText` holds it. */
  value: number | null;
  /** A result printed as words ("Trace", "Pale yellow", "2-4"). Exactly one of value and valueText is set. */
  valueText?: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  /** The printed reference range, e.g. "< 40" or "13.0 - 17.0". */
  rawRefText: string | null;
}

export interface Biomarker extends NewBiomarker {
  id: number;
  reportId: number;
}

export interface ReportWithBiomarkers extends Report {
  biomarkers: Biomarker[];
}
