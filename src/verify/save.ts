// The only path from the Verification screen to the database: validate the user's draft, then
// write it with saveVerifiedReport in one transaction. Duplicate checks run before the user saves.
// Direct module imports (not '../db'), so this stays free of expo-sqlite and runs under vitest.
import { loadCanonicalizer } from '../db/aliases';
import { findReportsByHash, saveVerifiedReport } from '../db/reports';
import type { Db, Report } from '../db/types';
import { validateDraft, type Draft, type DraftErrors } from './draft';

export type SaveResult = { ok: true; reportId: number } | { ok: false; errors: DraftErrors };

export async function saveDraft(db: Db, profileId: number, draft: Draft, now = new Date()): Promise<SaveResult> {
  const v = validateDraft(draft, await loadCanonicalizer(db), now);
  if (!v.ok) return v;
  return { ok: true, reportId: await saveVerifiedReport(db, profileId, v.report, v.biomarkers) };
}

/** Reports in this profile saved earlier from any of these files. */
export async function findDuplicates(db: Db, profileId: number, fileHashes: string[]): Promise<Report[]> {
  const seen = new Map<number, Report>();
  for (const h of new Set(fileHashes)) {
    for (const r of await findReportsByHash(db, profileId, h)) seen.set(r.id, r);
  }
  return [...seen.values()];
}
