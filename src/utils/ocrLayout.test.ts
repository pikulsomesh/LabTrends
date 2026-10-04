import { describe, expect, it } from 'vitest';
import { rebuildRows } from './ocrLayout';
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
