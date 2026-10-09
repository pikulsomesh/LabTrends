// Report text to candidate rows (PLAN.md Phase 5). The deterministic parser runs first; the SLM
// sees only the lines it could not read, in small batches, and its context is released when
// extraction ends, even on failure. Nothing here writes to the DB: rows go to verification.
import { parseReport, type ParseOptions, type ParsedRow } from '../utils/parser';
import { acceptSlmRows, SLM_SCHEMA, SLM_SYSTEM, slmUserPrompt } from './slmRows';

export interface SlmSession {
  /** One constrained completion. Resolves to the raw JSON text. */
  complete(system: string, user: string, schema: object): Promise<string>;
  release(): Promise<void>;
}

export type SlmStatus = 'not-needed' | 'no-model' | 'used' | 'failed';

export type ExtractedRow = ParsedRow & { origin: 'parser' | 'slm' };

export interface Extraction {
  date: string | null;
  rows: ExtractedRow[];
  /** Lines with digits that neither the parser nor the SLM could read. Shown for manual entry. */
  unparsed: string[];
  slm: SlmStatus;
  slmError?: string;
}

/**
 * Lines per SLM call. One: in the eval (eval/slm) small models read a single line far more
 * reliably than ten, and a call stays short inside the 2048-token context.
 */
export const SLM_BATCH = 1;
/** More unparsed lines than this is not a report the SLM can rescue; the rest stay unparsed. */
export const SLM_MAX_LINES = 60;

export async function extractReport(
  text: string,
  loadSlm: (() => Promise<SlmSession>) | null,
  opts: ParseOptions = {},
): Promise<Extraction> {
  const parsed = parseReport(text, opts);
  const rows: ExtractedRow[] = parsed.rows.map((r) => ({ ...r, origin: 'parser' }));
  const base = { date: parsed.date, rows, unparsed: parsed.unparsed };

  if (!parsed.unparsed.length) return { ...base, slm: 'not-needed' };
  if (!loadSlm) return { ...base, slm: 'no-model' };

  const candidates = parsed.unparsed.slice(0, SLM_MAX_LINES);
  const read = new Set<string>();
  let session: SlmSession | null = null;
  try {
    session = await loadSlm();
    for (let i = 0; i < candidates.length; i += SLM_BATCH) {
      const lines = candidates.slice(i, i + SLM_BATCH);
      const raw = await session.complete(SLM_SYSTEM, slmUserPrompt(lines), SLM_SCHEMA);
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        continue; // A batch with broken output leaves its lines for manual entry.
      }
      for (const row of acceptSlmRows(json, lines)) {
        rows.push({ ...row, origin: 'slm' });
        read.add(row.sourceLine);
      }
    }
    return { ...base, unparsed: parsed.unparsed.filter((l) => !read.has(l)), slm: 'used' };
  } catch (e) {
    // Keep the parser rows. SLM rows from earlier batches stay too; they are checked like the rest.
    return {
      ...base,
      unparsed: parsed.unparsed.filter((l) => !read.has(l)),
      slm: 'failed',
      slmError: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await session?.release().catch(() => {});
  }
}
