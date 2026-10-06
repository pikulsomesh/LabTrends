import { describe, expect, it } from 'vitest';
import { parseReport } from '../../src/utils/parser';
import { GOLDEN } from './golden';
import { buildRequests, passes, scoreOutputs, type EvalOutput } from './score';

/** Answers every batch the way a careful person would, using the gold rows. */
function perfectOutputs(): EvalOutput[] {
  const gold = new Map(GOLDEN.map((g) => [g.line, g.expect]));
  return buildRequests().map((req) => ({
    id: req.id,
    ms: 1000,
    completionTokens: 100,
    raw: JSON.stringify({
      rows: req.lines.flatMap((line, i) => (gold.get(line) ? [{ line: i, ...gold.get(line)! }] : [])),
    }),
  }));
}

describe('golden set', () => {
  it('has 50 to 100 items with both results and non-results', () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(50);
    expect(GOLDEN.length).toBeLessThanOrEqual(100);
    expect(GOLDEN.filter((g) => g.expect).length).toBeGreaterThan(50);
    expect(GOLDEN.filter((g) => !g.expect).length).toBeGreaterThan(10);
  });

  it('has no duplicate lines', () => {
    expect(new Set(GOLDEN.map((g) => g.line)).size).toBe(GOLDEN.length);
  });

  it('only holds lines the deterministic parser cannot read, which is what the app sends to the model', () => {
    for (const g of GOLDEN) {
      const parsed = parseReport(g.line);
      expect(parsed.rows, g.line).toHaveLength(0);
      expect(parsed.unparsed, g.line).toContain(g.line);
    }
  });

  it('prints every expected number on its line, so a correct answer passes the app check', () => {
    for (const g of GOLDEN) {
      if (!g.expect) continue;
      const nums = (g.line.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
      for (const n of [g.expect.value, g.expect.ref_low, g.expect.ref_high]) {
        if (n != null) expect(nums, g.line).toContain(n);
      }
    }
  });
});

describe('scoring', () => {
  it('gives a perfect score to the gold answers', () => {
    const m = scoreOutputs(perfectOutputs());
    expect(m.f1).toBe(1);
    expect(m.falsePositives).toBe(0);
    expect(m.discardedRows).toBe(0);
    expect(m.validJsonRate).toBe(1);
    expect(passes(m)).toBe(true);
  });

  it('scores a model that answers nothing as zero recall but valid output', () => {
    const outputs = buildRequests().map((r) => ({ id: r.id, ms: 10, completionTokens: 5, raw: '{"rows":[]}' }));
    const m = scoreOutputs(outputs);
    expect(m.recall).toBe(0);
    expect(m.negativeFalsePositiveRate).toBe(0);
    expect(passes(m)).toBe(false);
  });

  it('counts a row on a non-result line as a false positive', () => {
    const outputs = perfectOutputs();
    const first = buildRequests()[0];
    const negIndex = first.lines.findIndex((l) => !GOLDEN.find((g) => g.line === l)!.expect);
    if (negIndex < 0) return;
    const line = first.lines[negIndex];
    const parsed = JSON.parse(outputs[0].raw!);
    // Name text must be on the line to survive the app check, so reuse a word from it.
    const word = line.split(' ').find((w) => /[a-z]/i.test(w))!;
    const digits = Number(line.match(/\d+/)![0]);
    parsed.rows.push({ line: negIndex, name: word, value: digits, unit: '', ref_low: null, ref_high: null });
    outputs[0].raw = JSON.stringify(parsed);
    expect(scoreOutputs(outputs).falsePositives).toBe(1);
  });

  it('discards invented numbers and reports them as the discarded rate', () => {
    const outputs = perfectOutputs();
    const gold = GOLDEN.find((g) => g.expect)!;
    const req = buildRequests().find((r) => r.lines.includes(gold.line))!;
    const idx = req.lines.indexOf(gold.line);
    const out = outputs[req.id];
    const parsed = JSON.parse(out.raw!);
    parsed.rows = parsed.rows.filter((r: { line: number }) => r.line !== idx);
    parsed.rows.push({ line: idx, ...gold.expect!, value: 99999.5 });
    out.raw = JSON.stringify(parsed);
    const m = scoreOutputs(outputs);
    expect(m.discardedRows).toBe(1);
    expect(m.missed).toBe(1);
    expect(m.truePositives).toBe(m.positives - 1);
  });

  it('treats broken JSON as an invalid batch, and a failed call the same way', () => {
    const outputs = perfectOutputs();
    outputs[0].raw = '{"rows": [';
    outputs[1].raw = null;
    const m = scoreOutputs(outputs);
    expect(m.validJsonRate).toBeCloseTo((m.batches - 2) / m.batches);
    expect(passes(m)).toBe(false);
  });

  it('matches names and units ignoring case, spacing and common OCR spellings', () => {
    const outputs = perfectOutputs();
    const item = GOLDEN.find((g) => g.expect?.unit === 'g/dL')!;
    const req = buildRequests().find((r) => r.lines.includes(item.line))!;
    const idx = req.lines.indexOf(item.line);
    const parsed = JSON.parse(outputs[req.id].raw!);
    for (const r of parsed.rows) if (r.line === idx) Object.assign(r, { name: item.expect!.name.toUpperCase(), unit: 'gm/dl' });
    outputs[req.id].raw = JSON.stringify(parsed);
    const m = scoreOutputs(outputs);
    expect(m.f1).toBe(1);
  });
});

describe('workflow', () => {
  it('runs every model listed in models.json', async () => {
    const { readFileSync } = await import('node:fs');
    const models = JSON.parse(readFileSync(new URL('./models.json', import.meta.url), 'utf8')) as { id: string }[];
    const yml = readFileSync(new URL('../../.github/workflows/slm-eval.yml', import.meta.url), 'utf8');
    for (const m of models) expect(yml, m.id).toContain(`- ${m.id}`);
  });
});
