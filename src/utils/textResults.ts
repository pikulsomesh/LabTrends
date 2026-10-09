// Results printed as words, not numbers: a urine routine's colour and appearance, "Trace" protein,
// "Nil" sugar, "Positive (+)" blood, "2-4 /hpf" pus cells. The parser keeps them as text exactly as
// printed so they reach the Verification screen and the marker history instead of being dropped.
// Only a known result word counts as a value, so ordinary report lines are not mistaken for one.
// Nothing here judges a result: the words are the lab's, shown as printed (CLAUDE.md guardrail 4).

// Longest first, so "Pale yellow" wins over "Yellow" and "Not detected" over "Detected".
const PHRASES = [
  // Presence and amount
  'not detected', 'detected', 'not seen', 'seen', 'non reactive', 'non-reactive', 'nonreactive', 'reactive',
  'nil', 'absent', 'present', 'traces', 'trace', 'negative', 'positive', 'normal',
  'very few', 'few', 'occasional', 'many', 'plenty', 'numerous', 'moderate', 'scanty',
  // Appearance
  'slightly turbid', 'turbid', 'slightly hazy', 'hazy', 'slightly cloudy', 'cloudy', 'clear', 'transparent',
  // Reaction
  'acidic', 'alkaline', 'neutral',
  // Colour
  'pale straw', 'straw yellow', 'straw', 'pale yellow', 'light yellow', 'dark yellow', 'deep yellow', 'yellow',
  'amber', 'colourless', 'colorless', 'reddish', 'red', 'brown', 'orange', 'green', 'milky', 'pink',
].sort((a, b) => b.length - a.length);

// "+", "++", "1+", "(+)", "(++)" after or instead of a word: Positive (+), Trace (+), 2+.
const GRADE = String.raw`(?:\(?\s*(?:\+{1,4}|[1-4]\s?\+)\s*\)?)`;
const WORD = String.raw`(?:${PHRASES.map((p) => p.replace(/[-\s]/g, '[-\\s]?')).join('|')})`;
// A word result, optionally graded; a bare grade; or a count per field ("2-4" before /hpf).
const VALUE = String.raw`(?:${WORD}(?:\s*${GRADE})?|${GRADE})`;
const PER_FIELD = String.raw`(?:cells\s*)?\/\s*(?:hpf|lpf|h\.p\.f\.?|l\.p\.f\.?)`;
const COUNT = String.raw`\d{1,3}\s*[-–]\s*\d{1,3}|\d{1,3}`;

// name, then the result, then an optional per-field unit, then an optional printed reference.
const WORD_ROW = new RegExp(String.raw`^(?<name>[A-Za-z][A-Za-z0-9 ().,'/&-]*?)\s*[:\-]?\s+(?<value>${VALUE})(?=\s|$)\s*(?<unit>${PER_FIELD})?\s*(?<ref>.*)$`, 'i');
const COUNT_ROW = new RegExp(String.raw`^(?<name>[A-Za-z][A-Za-z0-9 ().,'/&-]*?)\s*[:\-]?\s+(?<value>${COUNT})\s*(?<unit>${PER_FIELD})\s*(?<ref>.*)$`, 'i');
const REF_ONLY = new RegExp(String.raw`^(?:${VALUE}|${COUNT}|[<>]=?\s*\d+(?:\.\d+)?)(?:\s*(?:to|-|/|or|,)\s*(?:${VALUE}|${COUNT}))*\s*(?:${PER_FIELD})?$`, 'i');

// Lines that carry words but are not results.
const NOT_A_NAME = /^(remarks?|comments?|notes?|impression|interpretation|advice|result|status|report|sample|specimen|method|patient|name|test|investigation|parameter|clinical|history|ref|reference|page|end)\b/i;

export interface TextResult {
  name: string;
  value: string;
  unit: string;
  /** The printed reference, e.g. "Nil" or "0 - 5". Empty when none is printed. */
  ref: string;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Reads one report line as a text result, or null when it is not one. */
export function readTextResult(line: string): TextResult | null {
  const l = tidy(line);
  const m = WORD_ROW.exec(l) ?? COUNT_ROW.exec(l);
  if (!m?.groups) return null;
  const name = tidy(m.groups.name).replace(/[:\-]$/, '').trim();
  if (!name || name.length > 60 || NOT_A_NAME.test(name) || name.split(' ').length > 6) return null;
  // A number standing alone in the "name" means a numeric result with a word after it ("TSH 2.5 uIU/mL Normal"):
  // that line is the numeric parser's or the model's, not a text result.
  if (/(^|\s)[<>]?\d[\d,.]*(\s|$)/.test(name)) return null;
  const ref = tidy(m.groups.ref ?? '').replace(/^\(?(?:ref(?:erence)?\s*:?\s*)/i, '').replace(/\)$/, '').trim();
  if (ref && !REF_ONLY.test(ref)) return null;
  return { name, value: tidy(m.groups.value), unit: tidy(m.groups.unit ?? ''), ref };
}

// Display only: a swatch next to a printed colour, so a list of "Pale yellow", "Yellow", "Amber"
// reads at a glance. The swatch shows the word; it is never a flag for the result.
const SWATCHES: [RegExp, string][] = [
  [/colou?rless/i, '#FFFFFF'],
  [/milky/i, '#F4F1E8'],
  [/pale straw|pale yellow|light yellow/i, '#F8EDA6'],
  [/straw/i, '#F2E08A'],
  [/dark yellow|deep yellow/i, '#E2B92E'],
  [/yellow/i, '#F0D04F'],
  [/amber|orange/i, '#E39B2D'],
  [/reddish|red|pink/i, '#D9776F'],
  [/brown/i, '#9B6A43'],
  [/green/i, '#9CC48A'],
];

/** A colour for a printed colour word, or null when the text names no colour. */
export function swatchFor(text: string): string | null {
  for (const [re, hex] of SWATCHES) if (re.test(text)) return hex;
  return null;
}
