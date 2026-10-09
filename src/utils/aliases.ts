// Alias normalizer. ALIAS_SEED is the single source of truth: the parser uses it in memory and
// src/db seeds the SQLite alias table from it, where user-added aliases join it.
//
// Canonical name -> printed names seen on Indian lab reports (Thyrocare, Lal PathLabs,
// Metropolis, SRL/Agilus, Apollo, local labs). Absolute counts and percentages stay separate.
export const ALIAS_SEED: Record<string, string[]> = {
  // Liver
  ALT: ['alt', 'sgpt', 'alanine aminotransferase', 'alanine transaminase', 'sgpt alt'],
  AST: ['ast', 'sgot', 'aspartate aminotransferase', 'aspartate transaminase', 'sgot ast'],
  ALP: ['alp', 'alkaline phosphatase', 'alkaline phosphatase alp', 'serum alkaline phosphatase'],
  GGT: ['ggt', 'ggtp', 'gamma gt', 'gamma glutamyl transferase', 'gamma glutamyl transpeptidase'],
  'Total Bilirubin': ['total bilirubin', 'bilirubin total', 'serum bilirubin total', 't bil'],
  'Direct Bilirubin': ['direct bilirubin', 'bilirubin direct', 'conjugated bilirubin', 'd bil'],
  'Indirect Bilirubin': ['indirect bilirubin', 'bilirubin indirect', 'unconjugated bilirubin'],
  'Total Protein': ['total protein', 'protein total', 'serum total protein'],
  Albumin: ['albumin', 'serum albumin'],
  Globulin: ['globulin', 'serum globulin'],
  'A/G Ratio': ['a g ratio', 'albumin globulin ratio', 'albumin to globulin ratio'],

  // Complete blood count
  Hemoglobin: ['hemoglobin', 'haemoglobin', 'hb', 'hgb'],
  WBC: [
    'wbc', 'wbc count', 'tlc', 'total leucocyte count', 'total leukocyte count',
    'total wbc count', 'white blood cell count', 'leucocyte count', 'leukocyte count',
  ],
  RBC: ['rbc', 'rbc count', 'total rbc count', 'red blood cell count', 'erythrocyte count'],
  Platelets: ['platelets', 'platelet count', 'plt', 'total platelet count'],
  Hematocrit: ['hematocrit', 'haematocrit', 'hct', 'pcv', 'packed cell volume'],
  MCV: ['mcv', 'mean corpuscular volume', 'mean cell volume'],
  MCH: ['mch', 'mean corpuscular hemoglobin', 'mean corpuscular haemoglobin'],
  MCHC: [
    'mchc', 'mean corpuscular hemoglobin concentration',
    'mean corpuscular haemoglobin concentration',
  ],
  'RDW-CV': ['rdw', 'rdw cv', 'red cell distribution width'],
  MPV: ['mpv', 'mean platelet volume'],
  Neutrophils: ['neutrophils', 'neutrophil', 'polymorphs', 'neutrophils percentage'],
  Lymphocytes: ['lymphocytes', 'lymphocyte', 'lymphocytes percentage'],
  Monocytes: ['monocytes', 'monocyte', 'monocytes percentage'],
  Eosinophils: ['eosinophils', 'eosinophil', 'eosinophils percentage'],
  Basophils: ['basophils', 'basophil', 'basophils percentage'],
  'Absolute Neutrophil Count': ['absolute neutrophil count', 'anc', 'neutrophils absolute', 'neutrophils absolute count'],
  'Absolute Lymphocyte Count': ['absolute lymphocyte count', 'lymphocytes absolute', 'lymphocytes absolute count'],
  'Absolute Eosinophil Count': ['absolute eosinophil count', 'aec', 'eosinophils absolute', 'eosinophils absolute count'],
  ESR: ['esr', 'erythrocyte sedimentation rate'],

  // Diabetes
  HbA1c: [
    'hba1c', 'glycated hemoglobin', 'glycated haemoglobin', 'glycosylated hemoglobin',
    'glycosylated haemoglobin', 'a1c',
  ],
  'Fasting Glucose': [
    'fasting glucose', 'fasting blood sugar', 'fbs', 'glucose fasting', 'fasting plasma glucose',
    'fpg', 'blood sugar fasting', 'plasma glucose fasting',
  ],
  'Postprandial Glucose': [
    'postprandial glucose', 'post prandial blood sugar', 'ppbs', 'glucose pp',
    'glucose post prandial', 'blood sugar pp', 'plasma glucose pp', 'pp blood sugar',
  ],
  'Random Glucose': ['random glucose', 'random blood sugar', 'rbs', 'glucose random'],
  'Estimated Average Glucose': ['estimated average glucose', 'eag', 'average blood glucose'],

  // Lipid profile
  'Total Cholesterol': ['total cholesterol', 'cholesterol total', 'serum cholesterol', 'cholesterol'],
  Triglycerides: ['triglycerides', 'triglyceride', 'tg', 'serum triglycerides'],
  'HDL Cholesterol': ['hdl', 'hdl cholesterol', 'hdl c', 'cholesterol hdl', 'hdl cholesterol direct'],
  'LDL Cholesterol': ['ldl', 'ldl cholesterol', 'ldl c', 'cholesterol ldl', 'ldl cholesterol direct', 'ldl cholesterol calculated'],
  'VLDL Cholesterol': ['vldl', 'vldl cholesterol', 'cholesterol vldl'],
  'Non-HDL Cholesterol': ['non hdl cholesterol', 'non hdl c', 'non hdl'],
  'Total Cholesterol/HDL Ratio': ['tc hdl ratio', 'total cholesterol hdl ratio', 'chol hdl ratio', 'tc hdl cholesterol ratio'],
  'LDL/HDL Ratio': ['ldl hdl ratio'],

  // Thyroid
  TSH: ['tsh', 'thyroid stimulating hormone', 'tsh ultrasensitive', 'us tsh', 'tsh 3rd generation'],
  'Total T3': ['t3', 'total t3', 't3 total', 'triiodothyronine', 'total triiodothyronine'],
  'Total T4': ['t4', 'total t4', 't4 total', 'thyroxine', 'total thyroxine'],
  'Free T3': ['ft3', 'free t3', 'free triiodothyronine'],
  'Free T4': ['ft4', 'free t4', 'free thyroxine'],

  // Kidney and electrolytes
  Creatinine: ['creatinine', 'serum creatinine', 's creatinine'],
  Urea: ['urea', 'blood urea', 'serum urea'],
  BUN: ['bun', 'blood urea nitrogen', 'urea nitrogen'],
  'Uric Acid': ['uric acid', 'serum uric acid'],
  eGFR: ['egfr', 'estimated gfr', 'estimated glomerular filtration rate'],
  'BUN/Creatinine Ratio': ['bun creatinine ratio', 'bun creat ratio'],
  Sodium: ['sodium', 'serum sodium', 'na', 'na+'],
  Potassium: ['potassium', 'serum potassium', 'k', 'k+'],
  Chloride: ['chloride', 'serum chloride', 'cl', 'cl-'],
  Calcium: ['calcium', 'serum calcium', 'total calcium', 'ca'],
  Phosphorus: ['phosphorus', 'serum phosphorus', 'inorganic phosphorus', 'phosphate'],
  Magnesium: ['magnesium', 'serum magnesium', 'mg'],

  // Vitamins and iron
  'Vitamin D': [
    'vitamin d', '25 oh vitamin d', '25 hydroxy vitamin d', 'vitamin d 25 hydroxy',
    'vitamin d total', '25 oh vit d', 'vit d',
  ],
  'Vitamin B12': ['vitamin b12', 'vit b12', 'b12', 'cyanocobalamin', 'cobalamin'],
  Folate: ['folate', 'folic acid', 'serum folate'],
  Iron: ['iron', 'serum iron'],
  TIBC: ['tibc', 'total iron binding capacity'],
  'Transferrin Saturation': ['transferrin saturation', 'tsat', 'iron saturation'],
  Ferritin: ['ferritin', 'serum ferritin'],

  // Inflammation and others
  CRP: ['crp', 'c reactive protein'],
  'hs-CRP': ['hs crp', 'hscrp', 'high sensitivity crp', 'high sensitivity c reactive protein'],
  'Fasting Insulin': ['fasting insulin', 'insulin fasting'],
  PSA: ['psa', 'total psa', 'prostate specific antigen'],

  // Urine routine. Printed names are short ("Protein", "RBC", "Colour"), so they match only with the
  // "urine" prefix that canonicalizeIn adds under a urine heading, or when printed with it.
  'Urine Colour': ['urine colour', 'urine color'],
  'Urine Appearance': ['urine appearance', 'urine transparency', 'urine clarity'],
  'Urine Specific Gravity': ['urine specific gravity', 'urine sp gravity', 'urine sg'],
  'Urine pH': ['urine ph', 'urine reaction', 'urine reaction ph'],
  'Urine Volume': ['urine volume', 'urine quantity'],
  'Urine Protein': ['urine protein', 'urine proteins', 'urine albumin'],
  'Urine Glucose': ['urine glucose', 'urine sugar'],
  'Urine Ketones': ['urine ketones', 'urine ketone', 'urine ketone bodies', 'urine acetone'],
  'Urine Bilirubin': ['urine bilirubin', 'urine bile pigments', 'urine bile pigment'],
  'Urine Bile Salts': ['urine bile salts', 'urine bile salt'],
  'Urine Urobilinogen': ['urine urobilinogen'],
  'Urine Blood': ['urine blood', 'urine occult blood'],
  'Urine Nitrite': ['urine nitrite', 'urine nitrites'],
  'Urine Leukocyte Esterase': ['urine leukocyte esterase', 'urine leucocyte esterase'],
  'Urine Pus Cells': ['urine pus cells', 'urine pus cell', 'urine wbc', 'urine wbcs', 'urine white blood cells'],
  'Urine RBC': ['urine rbc', 'urine rbcs', 'urine red blood cells', 'urine red cells', 'urine erythrocytes'],
  'Urine Epithelial Cells': ['urine epithelial cells', 'urine epithelial cell', 'urine squamous epithelial cells'],
  'Urine Casts': ['urine casts', 'urine cast'],
  'Urine Crystals': ['urine crystals', 'urine crystal'],
  'Urine Bacteria': ['urine bacteria'],
  'Urine Yeast': ['urine yeast', 'urine yeast cells', 'urine budding yeast'],
  'Urine Mucus': ['urine mucus', 'urine mucus threads'],
};

/** Lower-cases and collapses everything but letters and digits to single spaces. */
export const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Every (normalized alias, canonical) pair in the seed, canonical names included. */
export function seedEntries(): [string, string][] {
  const out = new Map<string, string>();
  for (const [canonical, names] of Object.entries(ALIAS_SEED)) {
    out.set(normalizeName(canonical), canonical);
    for (const n of names) out.set(normalizeName(n), canonical);
  }
  return [...out];
}

export type Canonicalizer = (printed: string) => string | null;

const compact = (normalized: string) => normalized.replace(/ /g, '');

/**
 * Builds a canonicalizer over (alias, canonical) pairs. Aliases are normalized on the way in.
 * Lookup tries the whole name, then the name with spaces removed ("S.G.P.T.", "Vitamin B-12"),
 * then each part split on "/", "(" and ")" the same two ways.
 */
export function createCanonicalizer(entries: Iterable<[string, string]>): Canonicalizer {
  const exact = new Map<string, string>();
  const loose = new Map<string, string | null>(); // null: two canonicals share the key
  for (const [alias, canonical] of entries) {
    const key = normalizeName(alias);
    exact.set(key, canonical);
    const c = compact(key);
    loose.set(c, loose.has(c) && loose.get(c) !== canonical ? null : canonical);
  }
  const find = (s: string) => {
    const key = normalizeName(s);
    return exact.get(key) ?? loose.get(compact(key)) ?? null;
  };
  return (printed) => {
    const whole = find(printed);
    if (whole) return whole;
    for (const token of printed.split(/[/()]/)) {
      const hit = find(token);
      if (hit) return hit;
    }
    return null;
  };
}

/** Maps a printed test name to a canonical name using the seed, or null when unknown. */
export const canonicalize: Canonicalizer = createCanonicalizer(seedEntries());

/** Where a sample came from, when the report's heading says. Only urine needs telling apart. */
export type Specimen = 'urine' | null;

const URINE_PREFIX = 'Urine ';

/**
 * Canonical name for a row printed under a specimen heading. Under a urine heading, "RBC" or
 * "Albumin" must not join the blood test of the same name, so the name is tried with "urine" in
 * front first. A urine name nothing matches becomes "Urine <name>", keeping it apart all the same.
 */
export function canonicalizeIn(canon: Canonicalizer, printed: string, specimen: Specimen): string | null {
  if (specimen !== 'urine') return canon(printed);
  const name = printed.trim();
  if (/^urine\b/i.test(name)) return canon(name);
  // Only a urine marker counts: the canonicalizer's part-by-part fallback could otherwise match
  // "Hb" in "Mucus/Hb" to the blood test.
  const hit = canon(`urine ${name}`);
  if (hit?.startsWith(URINE_PREFIX)) return hit;
  return `${URINE_PREFIX}${name}`.slice(0, 120);
}
