// The Verification screen's editable state (PLAN.md Phase 6, CLAUDE.md guardrail 3). Extraction
// output becomes a draft of text fields the user can edit; only a draft that validates turns into
// the NewReport and NewBiomarker rows saveVerifiedReport writes. Pure, so it is unit-tested.
import type { Extraction } from '../ai/extract';
import type { NewBiomarker, NewReport } from '../db/types';
import type { Canonicalizer } from '../utils/aliases';

export interface DraftRow {
  key: string;
  name: string;
  /** Text fields, exactly as the user typed them. Parsed only on save. */
  value: string;
  unit: string;
  refLow: string;
  refHigh: string;
  rawRefText: string;
  /** The report line the row came from, shown beside the fields. Empty for a row the user added. */
  sourceLine: string;
  origin: 'parser' | 'slm' | 'manual';
  included: boolean;
}

export interface Draft {
  date: string;
  labName: string;
  category: string;
  rows: DraftRow[];
  /** Report lines nothing could read, offered as starting points for manual rows. */
  unparsed: string[];
  /** SHA-256 of each input file. The first is stored; all are checked for duplicates. */
  fileHashes: string[];
}

let nextKey = 0;
const key = () => `r${++nextKey}`;

const numText = (n: number | null) => (n == null ? '' : String(n));

/** The category most rows were printed under, so a single-panel report gets its heading. */
function commonCategory(categories: (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const c of categories) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = '';
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN) [best, bestN] = [c, n];
  return best;
}

export function draftFromExtraction(extraction: Extraction, fileHashes: string[]): Draft {
  return {
    date: extraction.date ?? '',
    labName: '',
    category: commonCategory(extraction.rows.map((r) => r.category)),
    rows: extraction.rows.map((r) => ({
      key: key(),
      name: r.name,
      value: String(r.value),
      unit: r.unit,
      refLow: numText(r.refLow),
      refHigh: numText(r.refHigh),
      rawRefText: r.rawRefText,
      sourceLine: r.sourceLine,
      origin: r.origin,
      included: true,
    })),
    unparsed: extraction.unparsed,
    fileHashes,
  };
}

/** Adds an empty row, optionally seeded from an unread line, which then leaves the unread list. */
export function addManualRow(draft: Draft, sourceLine = ''): Draft {
  const row: DraftRow = {
    key: key(),
    name: '',
    value: '',
    unit: '',
    refLow: '',
    refHigh: '',
    rawRefText: '',
    sourceLine,
    origin: 'manual',
    included: true,
  };
  const i = sourceLine ? draft.unparsed.indexOf(sourceLine) : -1;
  return {
    ...draft,
    rows: [...draft.rows, row],
    unparsed: i < 0 ? draft.unparsed : [...draft.unparsed.slice(0, i), ...draft.unparsed.slice(i + 1)],
  };
}

export function updateRow(draft: Draft, rowKey: string, patch: Partial<Omit<DraftRow, 'key' | 'origin' | 'sourceLine'>>): Draft {
  // Editing a bound means the printed range text no longer describes it; it is rebuilt on save.
  const rangeEdited = 'refLow' in patch || 'refHigh' in patch;
  return {
    ...draft,
    rows: draft.rows.map((r) => (r.key === rowKey ? { ...r, ...patch, ...(rangeEdited ? { rawRefText: '' } : {}) } : r)),
  };
}

export function removeRow(draft: Draft, rowKey: string): Draft {
  return { ...draft, rows: draft.rows.filter((r) => r.key !== rowKey) };
}

/** A plain decimal as typed: optional minus, digits with optional thousands commas, optional fraction. */
export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$|^-?\.\d+$/.test(t)) return null;
  return Number(t.replace(/,/g, ''));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(text: string): boolean {
  if (!ISO_DATE.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

export type DraftErrors = Record<string, string>;

export type Validated =
  | { ok: true; report: NewReport; biomarkers: NewBiomarker[] }
  | { ok: false; errors: DraftErrors };

/**
 * Checks the draft and builds the rows to save. Error keys are 'date', 'rows', or
 * `${rowKey}.${field}` so the screen can show each message next to its field.
 */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function validateDraft(draft: Draft, canonicalize: Canonicalizer, now = new Date()): Validated {
  const errors: DraftErrors = {};
  const date = draft.date.trim();
  if (!isValidDate(date)) errors.date = 'Enter the collection date as yyyy-mm-dd.';
  else if (date > localDate(now)) errors.date = 'The date is in the future.';

  const included = draft.rows.filter((r) => r.included);
  if (!included.length) errors.rows = 'Keep at least one value.';

  const biomarkers: NewBiomarker[] = [];
  for (const r of included) {
    const name = r.name.trim();
    if (!name) errors[`${r.key}.name`] = 'Enter the test name.';
    const value = parseNumber(r.value);
    if (value == null) errors[`${r.key}.value`] = 'Enter a number, like 13.4.';
    const refLow = r.refLow.trim() ? parseNumber(r.refLow) : null;
    const refHigh = r.refHigh.trim() ? parseNumber(r.refHigh) : null;
    if (r.refLow.trim() && refLow == null) errors[`${r.key}.refLow`] = 'Enter a number or leave it empty.';
    if (r.refHigh.trim() && refHigh == null) errors[`${r.key}.refHigh`] = 'Enter a number or leave it empty.';
    if (refLow != null && refHigh != null && refLow > refHigh) errors[`${r.key}.refHigh`] = 'The high bound is below the low bound.';
    if (!name || value == null) continue;
    biomarkers.push({
      name,
      canonicalName: canonicalize(name),
      value,
      unit: r.unit.trim() || null,
      refLow,
      refHigh,
      rawRefText: r.rawRefText.trim() || rangeText(refLow, refHigh),
    });
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    report: {
      date,
      category: draft.category.trim() || null,
      labName: draft.labName.trim() || null,
      sourceFileHash: draft.fileHashes[0] ?? null,
    },
    biomarkers,
  };
}

/** Range text for a row typed by hand, matching how reports print it. */
function rangeText(low: number | null, high: number | null): string | null {
  if (low != null && high != null) return `${low} - ${high}`;
  if (high != null) return `< ${high}`;
  if (low != null) return `> ${low}`;
  return null;
}
