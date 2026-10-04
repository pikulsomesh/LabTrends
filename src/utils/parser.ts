import { canonicalize } from './aliases';

export interface ParsedRow {
  category: string | null;
  name: string;
  canonicalName: string | null;
  value: number;
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
const RANGE_RE = new RegExp(
  String.raw`^(?:(${NUM})\s*-\s*(${NUM})|([<>]=?)\s*(${NUM}))$`,
);
// name  value  unit  [(Ref:] range [)]
const ROW_RE = new RegExp(
  String.raw`^(?<name>[A-Za-z].*?)\s{2,}(?<value>${NUM})\s*(?<unit>[^\s\d(][^\s(]*(?:\s?\^\d+\S*)?)\s+\(?(?:Ref:?\s*)?(?<range>[^)]+?)\)?$`,
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

export function parseDate(text: string): string | null {
  const m = /(?:Collected|Date)\s*:\s*(\d{2})[/-](\d{2})[/-](\d{4})/i.exec(text);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const isHeading = (line: string) =>
  /^[A-Z][A-Z0-9 &/-]+$/.test(line.trim()) && !/\d{2,}/.test(line);

export function parseReport(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const unparsed: string[] = [];
  let category: string | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s*\.{2,}\s*/g, '  ').trim();
    if (!line) continue;
    if (/^test name\b/i.test(line)) continue;
    if (isHeading(line)) {
      category = line.trim();
      continue;
    }
    const m = ROW_RE.exec(line);
    const range = m?.groups ? parseRange(m.groups.range) : null;
    if (m?.groups && range) {
      const name = m.groups.name.trim();
      rows.push({
        category,
        name,
        canonicalName: canonicalize(name),
        value: toNum(m.groups.value),
        unit: m.groups.unit,
        refLow: range.low,
        refHigh: range.high,
        rawRefText: m.groups.range.trim(),
        sourceLine: raw.trim(),
      });
    } else if (/\d/.test(line) && !/(Collected|Reported|Date|Age)/i.test(line)) {
      unparsed.push(raw.trim());
    }
  }
  return { date: parseDate(text), rows, unparsed };
}
