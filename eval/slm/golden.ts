// Golden set for the SLM fallback (docs: eval/slm/README.md). Every item is a line the deterministic
// parser cannot read, which is the only kind of line the app ever sends to the model. Expected rows
// are what a careful person would type into the Verify form from that line alone.
// All content is synthetic: lab and test names are generic, no real person or report is quoted.

export interface GoldRow {
  name: string;
  value: number;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
}

export interface GoldItem {
  /** The line as the parser hands it over. */
  line: string;
  /** Why this line is in the set. Used to break scores down by kind. */
  kind: 'spaces' | 'range-words' | 'flag' | 'unit-ocr' | 'one-sided' | 'no-range' | 'layout' | 'not-a-result';
  /** The row a careful reader would type, or null when the line is not a lab result. */
  expect: GoldRow | null;
}

const g = (kind: GoldItem['kind'], line: string, name: string, value: number, unit: string, ref_low: number | null, ref_high: number | null): GoldItem => ({
  kind,
  line,
  expect: { name, value, unit, ref_low, ref_high },
});
const no = (line: string): GoldItem => ({ kind: 'not-a-result', line, expect: null });

export const GOLDEN: GoldItem[] = [
  // Columns squeezed to single spaces (the parser needs two or more).
  g('spaces', 'Hemoglobin 13.4 g/dL 13.0 - 17.0', 'Hemoglobin', 13.4, 'g/dL', 13.0, 17.0),
  g('spaces', 'Total Cholesterol 212 mg/dL < 200', 'Total Cholesterol', 212, 'mg/dL', null, 200),
  g('spaces', 'SGPT (ALT) 52 U/L 7 - 41', 'SGPT (ALT)', 52, 'U/L', 7, 41),
  g('spaces', 'Serum Creatinine 0.9 mg/dL 0.6 - 1.3', 'Serum Creatinine', 0.9, 'mg/dL', 0.6, 1.3),
  g('spaces', 'Fasting Glucose 104 mg/dL 70 - 99', 'Fasting Glucose', 104, 'mg/dL', 70, 99),
  g('spaces', 'TSH 2.45 uIU/mL 0.45 - 4.5', 'TSH', 2.45, 'uIU/mL', 0.45, 4.5),
  g('spaces', 'Vitamin B12 312 pg/mL 200 - 900', 'Vitamin B12', 312, 'pg/mL', 200, 900),
  g('spaces', 'Uric Acid 6.8 mg/dL 3.5 - 7.2', 'Uric Acid', 6.8, 'mg/dL', 3.5, 7.2),
  g('spaces', 'Platelet Count 215 x10^3/uL 150 - 410', 'Platelet Count', 215, 'x10^3/uL', 150, 410),
  g('spaces', 'Total Leucocyte Count 7,200 /cumm 4000 - 11000', 'Total Leucocyte Count', 7200, '/cumm', 4000, 11000),
  g('spaces', 'HbA1c 5.9 % 4.0 - 5.6', 'HbA1c', 5.9, '%', 4.0, 5.6),
  g('spaces', 'Sodium 139 mmol/L 136 - 145', 'Sodium', 139, 'mmol/L', 136, 145),
  g('spaces', 'Potassium 4.2 mmol/L 3.5 - 5.1', 'Potassium', 4.2, 'mmol/L', 3.5, 5.1),
  g('spaces', 'Calcium 9.4 mg/dL 8.6 - 10.2', 'Calcium', 9.4, 'mg/dL', 8.6, 10.2),
  g('spaces', 'Ferritin 48 ng/mL 30 - 400', 'Ferritin', 48, 'ng/mL', 30, 400),

  // Ranges written in words or with extra labels.
  g('range-words', 'Triglycerides 168 mg/dL Normal: < 150', 'Triglycerides', 168, 'mg/dL', null, 150),
  g('range-words', 'Glucose Fasting 92 mg/dL Ref. Range 70 to 100', 'Glucose Fasting', 92, 'mg/dL', 70, 100),
  g('range-words', 'Creatinine 1.0 mg/dL Biological Ref Interval 0.7 - 1.3', 'Creatinine', 1.0, 'mg/dL', 0.7, 1.3),
  g('range-words', 'HDL Cholesterol 46 mg/dL Desirable > 40', 'HDL Cholesterol', 46, 'mg/dL', 40, null),
  g('range-words', 'LDL Cholesterol 131 mg/dL Optimal < 100', 'LDL Cholesterol', 131, 'mg/dL', null, 100),
  g('range-words', 'Total Protein 7.1 g/dL (Normal 6.0 to 8.3)', 'Total Protein', 7.1, 'g/dL', 6.0, 8.3),
  g('range-words', 'Albumin 4.3 g/dL Adults: 3.5 - 5.2', 'Albumin', 4.3, 'g/dL', 3.5, 5.2),
  g('range-words', 'Alkaline Phosphatase 96 U/L Range: 44-147', 'Alkaline Phosphatase', 96, 'U/L', 44, 147),
  g('range-words', 'TSH 3.1 uIU/mL Reference 0.4 to 4.0', 'TSH', 3.1, 'uIU/mL', 0.4, 4.0),
  g('range-words', 'Vitamin D 25-OH 18.2 ng/mL Sufficient 30 - 100', 'Vitamin D 25-OH', 18.2, 'ng/mL', 30, 100),
  g('range-words', 'ESR 14 mm/hr Up to 20', 'ESR', 14, 'mm/hr', null, 20),
  g('range-words', 'CRP 3.2 mg/L Less than 5', 'CRP', 3.2, 'mg/L', null, 5),
  g('range-words', 'Phosphorus 3.4 mg/dL Adult 2.5-4.5', 'Phosphorus', 3.4, 'mg/dL', 2.5, 4.5),
  g('range-words', 'Iron 88 ug/dL Male: 65 - 175', 'Iron', 88, 'ug/dL', 65, 175),

  // A high or low flag next to the value.
  g('flag', 'Hemoglobin 11.8 L g/dL 13.0 - 17.0', 'Hemoglobin', 11.8, 'g/dL', 13.0, 17.0),
  g('flag', 'SGPT (ALT) 64 H U/L 7 - 41', 'SGPT (ALT)', 64, 'U/L', 7, 41),
  g('flag', 'Fasting Glucose 126 * mg/dL 70 - 99', 'Fasting Glucose', 126, 'mg/dL', 70, 99),
  g('flag', 'Total Cholesterol 240 H mg/dL < 200', 'Total Cholesterol', 240, 'mg/dL', null, 200),
  g('flag', 'Platelet Count 98 L x10^3/uL 150 - 410', 'Platelet Count', 98, 'x10^3/uL', 150, 410),
  g('flag', 'Uric Acid 7.9 HIGH mg/dL 3.5 - 7.2', 'Uric Acid', 7.9, 'mg/dL', 3.5, 7.2),
  g('flag', 'Vitamin B12 180 LOW pg/mL 200 - 900', 'Vitamin B12', 180, 'pg/mL', 200, 900),
  g('flag', 'Creatinine 1.6 (H) mg/dL 0.7 - 1.3', 'Creatinine', 1.6, 'mg/dL', 0.7, 1.3),
  g('flag', 'Potassium 3.2 (L) mmol/L 3.5 - 5.1', 'Potassium', 3.2, 'mmol/L', 3.5, 5.1),
  g('flag', 'HbA1c 6.8 H % 4.0 - 5.6', 'HbA1c', 6.8, '%', 4.0, 5.6),

  // Units damaged by OCR or written unusually.
  g('unit-ocr', 'Hemoglobin 13.4 9/dL 13.0 - 17.0', 'Hemoglobin', 13.4, 'g/dL', 13.0, 17.0),
  g('unit-ocr', 'Serum Creatinine 0.9 mg/d1 0.6 - 1.3', 'Serum Creatinine', 0.9, 'mg/dL', 0.6, 1.3),
  g('unit-ocr', 'SGOT (AST) 38 IU/1 8 - 40', 'SGOT (AST)', 38, 'IU/L', 8, 40),
  g('unit-ocr', 'Blood Urea 28 rng/dL 15 - 40', 'Blood Urea', 28, 'mg/dL', 15, 40),
  g('unit-ocr', 'Total Bilirubin 0.8 mg/dl 0.3 - 1.2', 'Total Bilirubin', 0.8, 'mg/dL', 0.3, 1.2),
  g('unit-ocr', 'Haemoglobin (Hb) 13.1 gm/dl 13.0 - 16.5', 'Haemoglobin (Hb)', 13.1, 'g/dL', 13.0, 16.5),
  g('unit-ocr', 'WBC Count 6.9 10^3/µL 4.0 - 10.0', 'WBC Count', 6.9, '10^3/µL', 4.0, 10.0),
  g('unit-ocr', 'Platelets 2.1 lakh/cumm 1.5 - 4.1', 'Platelets', 2.1, 'lakh/cumm', 1.5, 4.1),
  g('unit-ocr', 'Glucose Random 118 mg/ dL 70 - 140', 'Glucose Random', 118, 'mg/dL', 70, 140),
  g('unit-ocr', 'TSH 2.45 µIU/mL 0.45 - 4.5', 'TSH', 2.45, 'µIU/mL', 0.45, 4.5),
  g('unit-ocr', 'Ferritin 48 ng/ml 30 - 400', 'Ferritin', 48, 'ng/mL', 30, 400),

  // One-sided ranges in several spellings.
  g('one-sided', 'LDL Cholesterol 131 mg/dL <100', 'LDL Cholesterol', 131, 'mg/dL', null, 100),
  g('one-sided', 'HDL Cholesterol 46 mg/dL >40', 'HDL Cholesterol', 46, 'mg/dL', 40, null),
  g('one-sided', 'Triglycerides 168 mg/dL < 150', 'Triglycerides', 168, 'mg/dL', null, 150),
  g('one-sided', 'SGPT (ALT) 52 U/L <= 41', 'SGPT (ALT)', 52, 'U/L', null, 41),
  g('one-sided', 'eGFR 92 mL/min/1.73m2 > 90', 'eGFR', 92, 'mL/min/1.73m2', 90, null),
  g('one-sided', 'CRP 3.2 mg/L < 5.0', 'CRP', 3.2, 'mg/L', null, 5.0),
  g('one-sided', 'Homocysteine 12.4 umol/L <15', 'Homocysteine', 12.4, 'umol/L', null, 15),
  g('one-sided', 'HbA1c 5.4 % < 5.7', 'HbA1c', 5.4, '%', null, 5.7),

  // Results with no printed range.
  g('no-range', 'Vitamin D 25-OH 18.2 ng/mL', 'Vitamin D 25-OH', 18.2, 'ng/mL', null, null),
  g('no-range', 'Total Cholesterol / HDL Ratio 4.6', 'Total Cholesterol / HDL Ratio', 4.6, '', null, null),
  g('no-range', 'Hemoglobin 13.4 g/dL', 'Hemoglobin', 13.4, 'g/dL', null, null),
  g('no-range', 'Serum Ferritin 48 ng/mL', 'Serum Ferritin', 48, 'ng/mL', null, null),
  g('no-range', 'Mean Blood Glucose 123 mg/dL', 'Mean Blood Glucose', 123, 'mg/dL', null, null),
  g('no-range', 'Lipoprotein (a) 22 nmol/L', 'Lipoprotein (a)', 22, 'nmol/L', null, null),

  // Different layouts: value first, leaders, separators, "Ref" in the line, lower case.
  g('layout', 'ALT / SGPT : 47 IU/L (Ref: 7 - 40)', 'ALT / SGPT', 47, 'IU/L', 7, 40),
  g('layout', 'AST/SGOT - 35 IU/L [8 - 40]', 'AST/SGOT', 35, 'IU/L', 8, 40),
  g('layout', 'hemoglobin: 13.1 g/dl (13.0-16.5)', 'hemoglobin', 13.1, 'g/dL', 13.0, 16.5),
  g('layout', 'Glucose (F) = 92 mg/dL, Ref 70-100', 'Glucose (F)', 92, 'mg/dL', 70, 100),
  g('layout', '12. Creatinine 0.9 mg/dL 0.6 - 1.3', 'Creatinine', 0.9, 'mg/dL', 0.6, 1.3),
  g('layout', '3) Uric Acid 6.8 mg/dL (3.5 - 7.2)', 'Uric Acid', 6.8, 'mg/dL', 3.5, 7.2),
  g('layout', 'Result: TSH 2.45 uIU/mL (0.45 - 4.5)', 'TSH', 2.45, 'uIU/mL', 0.45, 4.5),
  g('layout', '| Potassium | 4.2 | mmol/L | 3.5 - 5.1 |', 'Potassium', 4.2, 'mmol/L', 3.5, 5.1),
  g('layout', '| HbA1c | 5.9 | % | 4.0 - 5.6 |', 'HbA1c', 5.9, '%', 4.0, 5.6),
  g('layout', 'Total Bilirubin 0.8 mg/dL (0.3-1.2) Jendrassik', 'Total Bilirubin', 0.8, 'mg/dL', 0.3, 1.2),
  g('layout', 'Calcium 9.4 mg/dL 8.6–10.2', 'Calcium', 9.4, 'mg/dL', 8.6, 10.2),
  g('layout', 'Phosphorus 3.4 mg/dL 2.5 — 4.5', 'Phosphorus', 3.4, 'mg/dL', 2.5, 4.5),
  g('layout', 'TOTAL CHOLESTEROL 212 MG/DL < 200', 'TOTAL CHOLESTEROL', 212, 'MG/DL', null, 200),
  g('layout', 'Haemoglobin 13.1 gm/dl Ref 13.0-16.5 Method: SLS', 'Haemoglobin', 13.1, 'g/dL', 13.0, 16.5),

  // Lines with digits that are not results at all. The right answer is no row.
  no('Phone: 040 2345 6789'),
  no('Sample ID 20260312-0098'),
  no('Reg No 4471230'),
  no('Method: Photometric (IFCC) 37 C'),
  no('Dr. A. Rao MD Pathology Reg 55231'),
  no('12, MG Road, Pune 411001'),
  no('Fasting for 8 - 12 hours is recommended'),
  no('NABL Accredited Lab No. TC-5231'),
  no('Instrument: Cobas 6000'),
  no('Email: reports@example-lab.test  Tel 1800 123 4567'),
  no('Barcode 0098 7712 3345'),
  no('Values in the range 70 - 99 mg/dL are considered normal by this lab'),
  no('Please call 1800 123 4567 for any queries'),
  no('Referred by: Dr. S. Mehta 2nd Floor'),
  no('Sample received at 09:45 AM, 2 tubes'),
  no('Test performed on Vitros 5600, lot 22841'),
  no('This report is valid for 30 days'),
  no('GST 18% included, total Rs. 1,250'),
  no('Room 204, Block B, Sector 11'),
  no('Accession 2026-0312-0098-01'),
  no('Pg 1/1'),
];
