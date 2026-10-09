import { canonicalize, canonicalizeIn, type Specimen } from './aliases';
import { readDate, type DateOrder } from './dates';
import { readTextResult } from './textResults';

export interface ParsedRow {
  category: string | null;
  /** 'urine' under a urine heading, so "RBC" there is not mixed with the blood count. */
  specimen: Specimen;
  name: string;
  canonicalName: string | null;
  /** The measured number, or null for a result printed as words ("Trace", "Pale yellow"). */
  value: number | null;
  /** A result printed as words, exactly as printed. Null when `value` holds a number. */
  valueText: string | null;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  rawRefText: string;
  sourceLine: string;
}

export interface ParseResult {
  date: string | null; // ISO yyyy-mm-dd
  rows: ParsedRow[];
  /** Lines containing digits that no rule matched: candidates for the SLM fallback. */
  unparsed: string[];
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
// OCR often reads the range hyphen as an en or em dash.
const RANGE_RE = new RegExp(
  String.raw`^(?:(${NUM})\s*[-\u2013\u2014]\s*(${NUM})|([<>]=?)\s*(${NUM}))$`,
);
// Dot leaders between name and value. OCR returns them as dot runs, spaced dots (". . ."),
// ellipsis or middle-dot characters, or commas mixed in. Two or more leader characters, or a
// lone ellipsis, count as a column break; a single '.' or ',' inside a number does not.
const LEADER_RE = /\s*(?:(?:[.,\u00b7\u2026]\s?){2,}|\u2026)\s*/g;
// name  value  [unit]  [(Ref:] range [)]. Specific gravity and pH print no unit.
const ROW_RE = new RegExp(
  String.raw`^(?<name>[A-Za-z].*?)\s{2,}(?<value>${NUM})\s*(?:(?<unit>[^\s\d(<>][^\s(]*(?:\s?\^\d+\S*)?)\s+)?\(?(?:Ref\s*:?\s*)?(?<range>[^)]+?)\)?$`,
);

const toNum = (s: string) => Number(s.replace(/,/g, ''));

function parseRange(text: string): { low: number | null; high: number | null } | null {
  const m = RANGE_RE.exec(text.trim());
  if (!m) return null;
  if (m[1] !== undefined) return { low: toNum(m[1]), high: toNum(m[2]) };
  return m[3].startsWith('<')
    ? { low: null, high: toNum(m[4]) }
    : { low: toNum(m[4]), high: null };
}

export interface ParseOptions {
  /** How to read a date like 01/07/2026 when the report itself does not settle it. Default 'dmy'. */
  dateOrder?: DateOrder;
  /** Today, so a reading that lands in the future gives way to the other one. */
  today?: Date;
}

const DATE_TOKEN = String.raw`(\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?[\s/.-]*[A-Za-z]{3,9}[\s/.,-]*\d{2,4}|[A-Za-z]{3,9}[\s.-]*\d{1,2}(?:st|nd|rd|th)?,?[\s.-]+\d{4})`;
const COLLECTED_RE = new RegExp(String.raw`(?:Collected|Collection|Sample)(?:\s+(?:on|date|at|date\s*&\s*time))?\s*[:.]?\s*-?\s*` + DATE_TOKEN, 'i');
const DATE_RE = new RegExp(String.raw`\bDate\s*[:.]?\s*-?\s*` + DATE_TOKEN, 'i');

/** The collection date as ISO yyyy-mm-dd, or the first labelled date when none says collected. */
export function parseDate(text: string, opts: ParseOptions = {}): string | null {
  const m = COLLECTED_RE.exec(text) ?? DATE_RE.exec(text);
  return m ? readDate(m[1], { order: opts.dateOrder ?? 'dmy', context: text, today: opts.today }) : null;
}

const isHeading = (line: string) =>
  /^[A-Z][A-Z0-9 &/-]+$/.test(line.trim()) && !/\d{2,}/.test(line);

// A urine report's heading, and the section headings that stay inside it.
const URINE_HEADING = /\b(URINE|URINALYSIS)\b/;
const URINE_SUBSECTION = /\b(PHYSICAL|CHEMICAL|MICROSCOPIC|MICROSCOPY|EXAMINATION|ROUTINE)\b/;

export function parseReport(text: string, opts: ParseOptions = {}): ParseResult {
  const rows: ParsedRow[] = [];
  const unparsed: string[] = [];
  let category: string | null = null;
  let specimen: Specimen = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(LEADER_RE, '  ').trim();
    if (!line) continue;
    if (/^test name\b/i.test(line)) continue;
    if (isHeading(line)) {
      if (URINE_HEADING.test(line)) specimen = 'urine';
      else if (!(specimen === 'urine' && URINE_SUBSECTION.test(line))) specimen = null;
      // "PHYSICAL EXAMINATION" under a urine report keeps the report's own heading as the category.
      if (!(specimen === 'urine' && !URINE_HEADING.test(line) && category)) category = line.trim();
      continue;
    }
    const m = ROW_RE.exec(line);
    const range = m?.groups ? parseRange(m.groups.range) : null;
    if (m?.groups && range) {
      const name = m.groups.name.trim();
      rows.push({
        category,
        specimen,
        name,
        canonicalName: canonicalizeIn(canonicalize, name, specimen),
        value: toNum(m.groups.value),
        valueText: null,
        unit: m.groups.unit ?? '',
        refLow: range.low,
        refHigh: range.high,
        rawRefText: m.groups.range.trim(),
        sourceLine: raw.trim(),
      });
      continue;
    }
    const t = readTextResult(line);
    if (t) {
      rows.push({
        category,
        specimen,
        name: t.name,
        canonicalName: canonicalizeIn(canonicalize, t.name, specimen),
        value: null,
        valueText: t.value,
        unit: t.unit,
        refLow: null,
        refHigh: null,
        rawRefText: t.ref,
        sourceLine: raw.trim(),
      });
    } else if (/\d/.test(line) && !/(Collected|Reported|Date|Age|DOB|Birth)/i.test(line)) {
      unparsed.push(raw.trim());
    }
  }
  return { date: parseDate(text, opts), rows, unparsed };
}
