// Dashboard tabs: each canonical marker belongs to one panel. A test keeps this in step with
// ALIAS_SEED. Markers with no canonical name (printed names nothing matched) go to "Other".
export const PANELS: Record<string, string[]> = {
  Liver: ['ALT', 'AST', 'ALP', 'GGT', 'Total Bilirubin', 'Direct Bilirubin', 'Indirect Bilirubin', 'Total Protein', 'Albumin', 'Globulin', 'A/G Ratio'],
  'Blood count': [
    'Hemoglobin', 'WBC', 'RBC', 'Platelets', 'Hematocrit', 'MCV', 'MCH', 'MCHC', 'RDW-CV', 'MPV',
    'Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils',
    'Absolute Neutrophil Count', 'Absolute Lymphocyte Count', 'Absolute Eosinophil Count', 'ESR',
  ],
  Diabetes: ['HbA1c', 'Fasting Glucose', 'Postprandial Glucose', 'Random Glucose', 'Estimated Average Glucose', 'Fasting Insulin'],
  Lipids: [
    'Total Cholesterol', 'Triglycerides', 'HDL Cholesterol', 'LDL Cholesterol', 'VLDL Cholesterol',
    'Non-HDL Cholesterol', 'Total Cholesterol/HDL Ratio', 'LDL/HDL Ratio',
  ],
  Thyroid: ['TSH', 'Total T3', 'Total T4', 'Free T3', 'Free T4'],
  Kidney: ['Creatinine', 'Urea', 'BUN', 'Uric Acid', 'eGFR', 'BUN/Creatinine Ratio', 'Sodium', 'Potassium', 'Chloride', 'Calcium', 'Phosphorus', 'Magnesium'],
  'Vitamins and iron': ['Vitamin D', 'Vitamin B12', 'Folate', 'Iron', 'TIBC', 'Transferrin Saturation', 'Ferritin'],
  Other: ['CRP', 'hs-CRP', 'PSA'],
};

export const PANEL_ORDER = Object.keys(PANELS);

const byMarker = new Map(Object.entries(PANELS).flatMap(([panel, names]) => names.map((n) => [n, panel] as const)));

/** The panel for a marker key (its canonical name, or its printed name when none matched). */
export const panelOf = (key: string) => byMarker.get(key) ?? 'Other';
