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

// Worked examples for the prompt. They cover the cases small models get wrong: which bound a
// "<" or ">" sets, a flag printed next to the value, a result with no range, and a line that is
// not a result. None of these lines appear in the eval golden set (eval/slm/golden.ts).
export const EXAMPLE_LINES = [
  'Chloride 101 mmol/L 98 - 107',
  'Lipase 38 U/L Up to 60',
  'Apolipoprotein A1 150 mg/dL > 120',
  'Bilirubin Indirect 0.9 H mg/dL 0.2 - 0.8',
  'Zinc 88 ug/dL',
  'Phone: 022 4567 8910',
];
const EXAMPLE_ROWS = [
  { line: 0, name: 'Chloride', value: 101, unit: 'mmol/L', ref_low: 98, ref_high: 107 },
  { line: 0, name: 'Lipase', value: 38, unit: 'U/L', ref_low: null, ref_high: 60 },
  { line: 0, name: 'Apolipoprotein A1', value: 150, unit: 'mg/dL', ref_low: 120, ref_high: null },
  { line: 0, name: 'Bilirubin Indirect', value: 0.9, unit: 'mg/dL', ref_low: 0.2, ref_high: 0.8 },
  { line: 0, name: 'Zinc', value: 88, unit: 'ug/dL', ref_low: null, ref_high: null },
];

const RULES =
  'Rules:\n' +
  '- The value is the measured number, not a range bound. Ignore flags such as H, L, HIGH, LOW and *.\n' +
  '- "a - b" or "a to b" means ref_low a and ref_high b. "< b", "<= b", "up to b" or "less than b" means ref_low null and ref_high b. ' +
  '"> a" or "more than a" means ref_low a and ref_high null.\n' +
  '- Use null for a bound that is not printed. Fix only obvious OCR misreads in the unit (for example "9d" for "g/dL").\n' +
  '- A line that is not a lab result (phone number, address, ID, page number, note) gets no row: answer {"rows":[]}.\n';

/**
 * One line per call is the normal case: small models read a single line far more reliably than
 * ten (eval/slm/README.md). Several lines are still supported, numbered from 0.
 */
export function slmUserPrompt(lines: string[]): string {
  const numbered = lines.map((l, i) => `${i}: ${l}`).join('\n');
  const head = 'Each line below may hold one lab result: test name, value, unit and reference range. ' + 'For each result give the line number, name, value, unit, ref_low and ref_high.\n' + RULES + '\n';
  if (lines.length === 1) {
    const pairs = EXAMPLE_LINES.map((l, i) => `Lines:\n0: ${l}\nAnswer: ${JSON.stringify({ rows: EXAMPLE_ROWS[i] ? [EXAMPLE_ROWS[i]] : [] })}`).join('\n\n');
    return `${head}Examples:\n\n${pairs}\n\nLines:\n${numbered}\nAnswer:`;
  }
  const example = EXAMPLE_LINES.map((l, i) => `${i}: ${l}`).join('\n');
  const answer = { rows: EXAMPLE_ROWS.map((r, i) => ({ ...r, line: i })) };
  return `${head}Example lines:\n${example}\nExample answer:\n${JSON.stringify(answer)}\n\nLines to read:\n${numbered}`;
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

const N = String.raw`\d[\d,]*(?:\.\d+)?`;
const toN = (x: string) => Number(x.replace(/,/g, ''));
type Bounds = { low: number | null; high: number | null };
// Printed range wording, in the order they are tried when two start at the same place.
const RANGE_PATTERNS: [RegExp, (m: RegExpExecArray) => Bounds | null][] = [
  [new RegExp(String.raw`between\s*(${N})\s*(?:and|-|\u2013|\u2014|to)\s*(${N})`, 'i'), (m) => ordered(toN(m[1]), toN(m[2]))],
  [new RegExp(String.raw`(${N})\s*(?:-|\u2013|\u2014|to)\s*(${N})`, 'i'), (m) => ordered(toN(m[1]), toN(m[2]))],
  [new RegExp(String.raw`(?:<=|\u2264|<|up\s*to|less\s+than|below|not\s+more\s+than)\s*(${N})`, 'i'), (m) => ({ low: null, high: toN(m[1]) })],
  [new RegExp(String.raw`(?:>=|\u2265|>|more\s+than|above|greater\s+than|over|at\s+least)\s*(${N})`, 'i'), (m) => ({ low: toN(m[1]), high: null })],
];
const ordered = (a: number, b: number): Bounds | null => (a <= b ? { low: a, high: b } : null);

/**
 * The range as printed after the value and unit. The model is good at finding the name and value
 * but swaps the bounds of "<" and ">" ranges, so the app reads the range from the text itself and
 * uses the model's bounds only when the line has no recognisable range wording.
 */
export function printedRange(source: string, value: number, unit: string): (Bounds & { text: string }) | null {
  let tail = '';
  for (const m of source.matchAll(NUM_TOKEN)) {
    if (toN(m[2]) === value) {
      tail = source.slice(m.index + m[0].length);
      break;
    }
  }
  if (!tail) return null;
  const at = unit ? tail.toLowerCase().indexOf(unit.toLowerCase()) : -1;
  if (at >= 0 && at < 40) tail = tail.slice(at + unit.length);
  let best: { index: number; bounds: Bounds } | null = null;
  for (const [re, make] of RANGE_PATTERNS) {
    const m = re.exec(tail);
    const bounds = m && make(m);
    if (m && bounds && (!best || m.index < best.index)) best = { index: m.index, bounds };
  }
  return best ? { ...best.bounds, text: tail.slice(best.index).replace(/[)\]]\s*$/, '').trim() } : null;
}

// Words that mark a line as paperwork, not a result. A row named like this is dropped.
const NOT_A_RESULT = /\b(range|normal|considered|recommended|valid|performed|accredited|referred|method|page|pg|phone|tel|email|bill|barcode|sample|reg|accession|room|floor|block|sector|instrument|lot|invoice|gst|hours|result)\b/i;

// Results that legitimately have neither a unit nor a printed range.
const DIMENSIONLESS = /\b(ratio|index|score|titre|titer)\b/i;

/** A test name is a few words of text: not a sentence, not paperwork. */
export function plausibleName(name: string): boolean {
  const n = name.trim();
  return /[a-z]/i.test(n) && n.length <= 40 && n.split(/\s+/).length <= 6 && !n.includes(':') && !NOT_A_RESULT.test(n);
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

    if (!plausibleName(name)) continue;

    const printed = numbersIn(source);
    const onLine = (n: number | null | undefined) => n == null || printed.includes(n);
    let refLow = typeof r.ref_low === 'number' ? r.ref_low : null;
    let refHigh = typeof r.ref_high === 'number' ? r.ref_high : null;
    if (!onLine(value) || !onLine(refLow) || !onLine(refHigh)) continue;

    const unitText = typeof unit === 'string' ? unit.trim().slice(0, MAX_UNIT_LEN) : '';
    // The printed range wins over the model's bounds. Without a unit or any range the line is
    // most likely an ID or a note, so no row is made from it.
    const range = printedRange(source, value, unitText);
    if (range) {
      refLow = range.low;
      refHigh = range.high;
    }
    if (!unitText && refLow == null && refHigh == null && !DIMENSIONLESS.test(name)) continue;

    used.add(line);
    accepted.push({
      category: null,
      name: name.trim(),
      canonicalName: canonicalize(name),
      value,
      unit: unitText,
      refLow,
      refHigh,
      rawRefText: range ? range.text : rangeText(source, value, refLow ?? refHigh),
      sourceLine: source,
    });
  }
  return accepted;
}
