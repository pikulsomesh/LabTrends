import { describe, expect, it } from 'vitest';
import { type OcrLine, rebuildRows } from './ocrLayout';
import { parseReport } from './parser';

const L = (text: string, left: number, top: number, width = 60, height = 20) => ({ text, left, top, width, height });

describe('rebuildRows', () => {
  // Column-wise order, as ML Kit emitted on-device
  const columnWise = [
    L('LIVER FUNCTION TEST', 10, 10, 200),
    L('Bilirubin Total', 10, 50, 150), L('SGPT (ALT)', 10, 80, 120),
    L('0.8', 300, 51), L('52', 300, 81),
    L('mg/dL', 400, 49), L('U/L', 400, 82),
    L('0.3 - 1.2', 500, 50, 90), L('< 41', 500, 80, 60),
  ];

  it('regroups column-wise lines into rows ordered left to right', () => {
    expect(rebuildRows(columnWise).split('\n')).toEqual([
      'LIVER FUNCTION TEST',
      'Bilirubin Total  0.8  mg/dL  0.3 - 1.2',
      'SGPT (ALT)  52  U/L  < 41',
    ]);
  });

  it('feeds the parser', () => {
    const r = parseReport(rebuildRows(columnWise));
    expect(r.rows.map((x) => [x.canonicalName, x.value, x.refHigh])).toEqual([
      ['Total Bilirubin', 0.8, 1.2],
      ['ALT', 52, 41],
    ]);
  });

  it('handles empty input', () => expect(rebuildRows([])).toBe(''));
});

// Sample report 2 (fixtures/sample_report_2.txt): name, dot leaders, value, unit, then "(Ref: lo - hi)".
describe('rebuildRows: report 2 (dot leaders)', () => {
  // [printed name, value + unit, ref text]
  const SECTIONS: [string, [string, string, string][]][] = [
    ['LIVER PROFILE', [
      ['ALT / SGPT', '47 IU/L', '(Ref: 7 - 40)'],
      ['AST / SGOT', '35 IU/L', '(Ref: 8 - 40)'],
      ['Total Bilirubin', '0.9 mg/dl', '(Ref: 0.2 - 1.1)'],
      ['ALP', '101 IU/L', '(Ref: 40 - 130)'],
    ]],
    ['HAEMOGRAM', [
      ['Haemoglobin (Hb)', '13.1 gm/dl', '(Ref: 13.0 - 16.5)'],
      ['WBC Count', '6.9 x10^3/uL', '(Ref: 4.0 - 10.0)'],
      ['Platelets', '215 x10^3/uL', '(Ref: 150 - 410)'],
    ]],
    ['GLYCATED HEMOGLOBIN', [['HbA1c', '5.7 %', '(Ref: 4.0 - 5.6)']]],
  ];

  const EXPECTED = [
    ['LIVER PROFILE', 'ALT', 47, 'IU/L', 7, 40],
    ['LIVER PROFILE', 'AST', 35, 'IU/L', 8, 40],
    ['LIVER PROFILE', 'Total Bilirubin', 0.9, 'mg/dl', 0.2, 1.1],
    ['LIVER PROFILE', 'ALP', 101, 'IU/L', 40, 130],
    ['HAEMOGRAM', 'Hemoglobin', 13.1, 'gm/dl', 13, 16.5],
    ['HAEMOGRAM', 'WBC', 6.9, 'x10^3/uL', 4, 10],
    ['HAEMOGRAM', 'Platelets', 215, 'x10^3/uL', 150, 410],
    ['GLYCATED HEMOGLOBIN', 'HbA1c', 5.7, '%', 4, 5.6],
  ];

  const summary = (text: string) => {
    const r = parseReport(text);
    return {
      date: r.date,
      unparsed: r.unparsed,
      rows: r.rows.map((x) => [x.category, x.canonicalName, x.value, x.unit, x.refLow, x.refHigh]),
    };
  };

  /**
   * Lays the report out on a page and returns ML Kit-style lines in column-wise order.
   * `leader` renders the dot run after a name; `split` decides whether the name+leader,
   * value+unit and ref arrive as separate lines or as one line per row.
   */
  function page(opts: {
    leader: (i: number) => string;
    ref?: (ref: string) => string;
    split: boolean;
    nameWidth?: number;
  }) {
    const ref = opts.ref ?? ((s) => s);
    const nameW = opts.nameWidth ?? 185;
    const cols: { name: OcrLine[]; value: OcrLine[]; ref: OcrLine[] } = { name: [], value: [], ref: [] };
    const header = [
      L('EXAMPLE PATH LABS', 10, 10, 220),
      L('Name : Test Patient One', 10, 40, 230),
      L('Date : 09-09-2026', 400, 41, 170),
    ];
    let top = 80;
    let n = 0;
    for (const [heading, rows] of SECTIONS) {
      cols.name.push(L(heading, 10, top, 200));
      top += 30;
      for (const [name, value, r] of rows) {
        // Small vertical jitter, as on a phone photo of a slightly tilted page.
        const jitter = (n % 3) - 1;
        const nameText = `${name} ${opts.leader(n)}`.trim();
        if (opts.split) {
          cols.name.push(L(nameText, 10, top, nameW));
          cols.value.push(L(value, 200, top + jitter, 110));
          cols.ref.push(L(ref(r), 320, top - jitter, 150));
        } else {
          cols.name.push(L(`${nameText} ${value} ${ref(r)}`, 10, top + jitter, 460));
        }
        top += 30;
        n++;
      }
    }
    return [...header, ...cols.name, ...cols.value, ...cols.ref];
  }

  it('one OCR line per row, as printed', () => {
    const lines = page({ leader: () => '........', split: false });
    expect(summary(rebuildRows(lines))).toEqual({ date: '2026-09-09', unparsed: [], rows: EXPECTED });
  });

  it('name, value and ref read as separate columns, leaders touching the value', () => {
    const text = rebuildRows(page({ leader: () => '..........', split: true }));
    expect(text.split('\n')).toContain('ALT / SGPT .......... 47 IU/L (Ref: 7 - 40)');
    expect(summary(text)).toEqual({ date: '2026-09-09', unparsed: [], rows: EXPECTED });
  });

  it('leaders misread as spaced dots, ellipses, middle dots or commas', () => {
    const variants = ['. . . . . .', '………', '·······', '..,..,..', '....... .', '..'];
    const lines = page({ leader: (i) => variants[i % variants.length], split: true });
    expect(summary(rebuildRows(lines))).toEqual({ date: '2026-09-09', unparsed: [], rows: EXPECTED });
  });

  it('range dash misread as en dash and "Ref :" spacing', () => {
    const lines = page({
      leader: () => '........',
      split: true,
      ref: (r) => r.replace('Ref:', 'Ref :').replace(' - ', ' – '),
    });
    expect(summary(rebuildRows(lines))).toEqual({ date: '2026-09-09', unparsed: [], rows: EXPECTED });
  });

  it('leaders dropped entirely: the visual gap still separates name and value', () => {
    const lines = page({ leader: () => '', split: true, nameWidth: 110 });
    expect(summary(rebuildRows(lines))).toEqual({ date: '2026-09-09', unparsed: [], rows: EXPECTED });
  });

  it('sends rows it cannot split safely to unparsed rather than guessing', () => {
    const text = rebuildRows([
      // Leaders dropped and name runs up to the value: no column break to split on.
      L('ALT / SGPT', 10, 100, 185), L('47 IU/L', 200, 100, 110), L('(Ref: 7 - 40)', 320, 100, 150),
      // Superscript read as "x 10^3": unit is ambiguous.
      L('WBC Count ......', 10, 130, 185), L('6.9 x 10^3/uL', 200, 130, 110), L('(Ref: 4.0 - 10.0)', 320, 130, 150),
    ]);
    const r = parseReport(text);
    expect(r.rows).toEqual([]);
    expect(r.unparsed).toHaveLength(2);
  });
});
