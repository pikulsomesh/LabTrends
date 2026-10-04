// Phase 0 spike alias table. Phase 2 moves this into the SQLite alias table.
const ALIASES: Record<string, string[]> = {
  ALT: ['alt', 'sgpt', 'alanine aminotransferase', 'alanine transaminase'],
  AST: ['ast', 'sgot', 'aspartate aminotransferase', 'aspartate transaminase'],
  ALP: ['alp', 'alkaline phosphatase'],
  'Total Bilirubin': ['total bilirubin', 'bilirubin total'],
  'Total Protein': ['total protein'],
  Albumin: ['albumin'],
  Hemoglobin: ['hemoglobin', 'haemoglobin', 'hb', 'hgb'],
  WBC: ['wbc', 'wbc count', 'tlc', 'total leucocyte count', 'total leukocyte count'],
  Platelets: ['platelets', 'platelet count', 'plt'],
  HbA1c: ['hba1c', 'glycated hemoglobin', 'glycated haemoglobin', 'glycosylated hemoglobin'],
  'Fasting Glucose': ['fasting glucose', 'fasting blood sugar', 'fbs', 'glucose fasting'],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const LOOKUP = new Map<string, string>();
for (const [canonical, names] of Object.entries(ALIASES)) {
  LOOKUP.set(norm(canonical), canonical);
  for (const n of names) LOOKUP.set(norm(n), canonical);
}

/** Maps a printed test name to a canonical name, or null when unknown. */
export function canonicalize(printed: string): string | null {
  const whole = LOOKUP.get(norm(printed));
  if (whole) return whole;
  for (const token of printed.split(/[/()]/)) {
    const hit = LOOKUP.get(norm(token));
    if (hit) return hit;
  }
  return null;
}
