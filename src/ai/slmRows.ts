// Prompt, JSON schema and output checks for the SLM fallback (PLAN.md Phase 5, CLAUDE.md guardrail 5).
// The model only sees lines the deterministic parser could not read, answers in schema-constrained
// JSON, and every number it returns must appear verbatim in the line it cites. Anything else is
// dropped, so the model can arrange the numbers on a line but never invent one.
import { canonicalize } from '../utils/aliases';
import type { ParsedRow } from '../utils/parser';

export interface SlmRow {
  line: number;
  name: string;
  value: number;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
}

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

export const SLM_SCHEMA = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'integer' },
          name: { type: 'string' },
          value: { type: 'number' },
          unit: { type: 'string' },
          ref_low: nullableNumber,
          ref_high: nullableNumber,
        },
        required: ['line', 'name', 'value', 'unit', 'ref_low', 'ref_high'],
        additionalProperties: false,
      },
    },
  },
  required: ['rows'],
  additionalProperties: false,
} as const;

export const SLM_SYSTEM =
  'You copy lab test results from text into JSON. Copy names and numbers exactly as printed. ' +
  'Do not calculate, convert, interpret or add anything. Skip lines that are not a test result.';

export function slmUserPrompt(lines: string[]): string {
  const numbered = lines.map((l, i) => `${i}: ${l}`).join('\n');
  return (
    'Each line below may hold one lab result: test name, value, unit and reference range. ' +
    'For each result give the line number, name, value, unit, ref_low and ref_high. ' +
    'Use null for a missing range bound. Fix only obvious OCR misreads in the unit (for example "9d" for "g/dL").\n\n' +
    numbered
  );
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Numbers printed on the line, with thousands separators removed. */
export function numbersIn(line: string): number[] {
  return [...line.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')));
}

const MAX_UNIT_LEN = 20;

const NUM_TOKEN = /([<>]=?\s*)?(\d[\d,]*(?:\.\d+)?)/g;

/** The printed range: from the first range bound after the value (with any < or >) to the end of the line. */
function rangeText(source: string, value: number, bound: number | null): string {
  if (bound == null) return '';
  let afterValue = false;
  for (const m of source.matchAll(NUM_TOKEN)) {
    const n = Number(m[2].replace(/,/g, ''));
    if (!afterValue) {
      afterValue = n === value;
      continue;
    }
    if (n === bound) return source.slice(m.index).replace(/\)\s*$/, '').trim();
  }
  return '';
}

/**
 * Keeps model rows that cite a real line, name text found on that line, and only numbers printed
 * on it. At most one row per line. Returns parser-shaped rows so verification treats both alike.
 */
export function acceptSlmRows(output: unknown, lines: string[]): ParsedRow[] {
  const rows = (output as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) return [];
  const used = new Set<number>();
  const accepted: ParsedRow[] = [];

  for (const r of rows as Partial<SlmRow>[]) {
    if (!r || typeof r !== 'object') continue;
    const { line, name, value, unit } = r;
    if (typeof line !== 'number' || !Number.isInteger(line) || line < 0 || line >= lines.length || used.has(line)) continue;
    if (typeof name !== 'string' || !/[a-z]/i.test(name) || typeof value !== 'number' || !Number.isFinite(value)) continue;

    const source = lines[line];
    if (!norm(source).includes(norm(name))) continue;

    const printed = numbersIn(source);
    const onLine = (n: number | null | undefined) => n == null || printed.includes(n);
    const refLow = typeof r.ref_low === 'number' ? r.ref_low : null;
    const refHigh = typeof r.ref_high === 'number' ? r.ref_high : null;
    if (!onLine(value) || !onLine(refLow) || !onLine(refHigh)) continue;

    used.add(line);
    accepted.push({
      category: null,
      name: name.trim(),
      canonicalName: canonicalize(name),
      value,
      unit: typeof unit === 'string' ? unit.trim().slice(0, MAX_UNIT_LEN) : '',
      refLow,
      refHigh,
      rawRefText: rangeText(source, value, refLow ?? refHigh),
      sourceLine: source,
    });
  }
  return accepted;
}
