import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { extractReport, SLM_BATCH, type SlmSession } from './extract';
import { acceptSlmRows, numbersIn, slmUserPrompt } from './slmRows';

const fixture = (n: number) => readFileSync(`${__dirname}/../../fixtures/sample_report_${n}.txt`, 'utf8');

// The OCR misread from the Phase 0 spike: "g/dL" read as "9d", so the parser skips the line.
const MISREAD = 'Haemoglobin           13.4   9d        13.0 - 17.0';

const row = (line: number, name: string, value: number, unit: string, ref_low: number | null, ref_high: number | null) =>
  ({ line, name, value, unit, ref_low, ref_high });

describe('numbersIn', () => {
  it('reads decimals and thousands separators', () => {
    expect(numbersIn('WBC 7,200 /cumm 4,000 - 11,000')).toEqual([7200, 4000, 11000]);
  });
});

describe('acceptSlmRows', () => {
  const lines = [MISREAD, 'Vitamin D 25-OH     <4     ng/mL   30 - 100'];

  it('keeps a row whose name and numbers are all on the cited line', () => {
    const [r] = acceptSlmRows({ rows: [row(0, 'Haemoglobin', 13.4, 'g/dL', 13, 17)] }, lines);
    expect(r).toMatchObject({
      name: 'Haemoglobin',
      canonicalName: 'Hemoglobin',
      value: 13.4,
      unit: 'g/dL',
      refLow: 13,
      refHigh: 17,
      rawRefText: '13.0 - 17.0',
      sourceLine: MISREAD,
      category: null,
    });
  });

  it('drops a row with a value that is not printed on the line', () => {
    expect(acceptSlmRows({ rows: [row(0, 'Haemoglobin', 134, 'g/dL', 13, 17)] }, lines)).toEqual([]);
  });

  it('drops a row with a range bound that is not printed on the line', () => {
    expect(acceptSlmRows({ rows: [row(0, 'Haemoglobin', 13.4, 'g/dL', 12, 17)] }, lines)).toEqual([]);
  });

  it('drops a row whose name is not on the line', () => {
    expect(acceptSlmRows({ rows: [row(0, 'Hemoglobin A1c', 13.4, 'g/dL', 13, 17)] }, lines)).toEqual([]);
  });

  it('drops rows citing a line that does not exist, and a second row for one line', () => {
    const out = { rows: [row(5, 'Haemoglobin', 13.4, '', null, null), row(0, 'Haemoglobin', 13.4, 'g/dL', 13, 17), row(0, 'Haemoglobin', 17, '', null, null)] };
    expect(acceptSlmRows(out, lines)).toHaveLength(1);
  });

  it('keeps the range text when a bound equals the value', () => {
    const [r] = acceptSlmRows({ rows: [row(0, 'Haemoglobin', 13, 'g/dL', 13, 17)] }, ['Haemoglobin  13  9d  13 - 17']);
    expect(r.rawRefText).toBe('13 - 17');
  });

  it('ignores output that is not the expected shape', () => {
    expect(acceptSlmRows(null, lines)).toEqual([]);
    expect(acceptSlmRows({ rows: 'x' }, lines)).toEqual([]);
    expect(acceptSlmRows({ rows: [null, { line: '0' }] }, lines)).toEqual([]);
  });

  it('numbers the lines in the prompt', () => {
    expect(slmUserPrompt(['a', 'b'])).toContain('0: a\n1: b');
  });
});

function fakeSlm(answer: (user: string) => string) {
  const session: SlmSession = {
    complete: vi.fn(async (_s: string, user: string) => answer(user)),
    release: vi.fn(async () => {}),
  };
  return { session, load: vi.fn(async () => session) };
}

describe('extractReport', () => {
  it('does not load the model when the parser reads every line', async () => {
    const { load } = fakeSlm(() => '{"rows":[]}');
    const r = await extractReport(fixture(1), load);
    expect(r).toMatchObject({ slm: 'not-needed', date: '2026-03-12', unparsed: [] });
    expect(r.rows).toHaveLength(11);
    expect(r.rows.every((x) => x.origin === 'parser')).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('leaves unparsed lines for manual entry when no model is imported', async () => {
    const r = await extractReport(`${fixture(1)}\n${MISREAD}`, null);
    expect(r).toMatchObject({ slm: 'no-model', unparsed: [MISREAD] });
  });

  it('adds checked SLM rows for unparsed lines and releases the model', async () => {
    const { session, load } = fakeSlm(() => JSON.stringify({ rows: [row(0, 'Haemoglobin', 13.4, 'g/dL', 13, 17)] }));
    const r = await extractReport(`${fixture(1)}\n${MISREAD}`, load);
    expect(r.slm).toBe('used');
    expect(r.unparsed).toEqual([]);
    expect(r.rows).toHaveLength(12);
    expect(r.rows.at(-1)).toMatchObject({ origin: 'slm', value: 13.4, unit: 'g/dL' });
    expect(session.release).toHaveBeenCalledTimes(1);
  });

  it('sends unparsed lines in batches', async () => {
    const lines = Array.from({ length: SLM_BATCH + 3 }, (_, i) => `Marker${i}           ${i + 1}.4   9d        1.0 - 99.0`);
    const { session, load } = fakeSlm(() => '{"rows":[]}');
    const r = await extractReport(lines.join('\n'), load);
    expect(session.complete).toHaveBeenCalledTimes(2);
    expect(r.unparsed).toHaveLength(lines.length);
  });

  it('skips a batch with broken JSON and keeps its lines', async () => {
    const { load } = fakeSlm(() => '{"rows":[');
    const r = await extractReport(MISREAD, load);
    expect(r).toMatchObject({ slm: 'used', unparsed: [MISREAD], rows: [] });
  });

  it('keeps parser rows and releases the model when the SLM throws', async () => {
    const { session, load } = fakeSlm(() => '');
    vi.mocked(session.complete).mockRejectedValueOnce(new Error('out of memory'));
    const r = await extractReport(`${fixture(1)}\n${MISREAD}`, load);
    expect(r).toMatchObject({ slm: 'failed', slmError: 'out of memory', unparsed: [MISREAD] });
    expect(r.rows).toHaveLength(11);
    expect(session.release).toHaveBeenCalledTimes(1);
  });

  it('reports a model that fails to load', async () => {
    const r = await extractReport(MISREAD, async () => {
      throw new Error('not a GGUF file');
    });
    expect(r).toMatchObject({ slm: 'failed', slmError: 'not a GGUF file', unparsed: [MISREAD] });
  });
});

describe('isGguf', () => {
  it('accepts the GGUF magic and rejects anything else', async () => {
    const { isGguf } = await import('./gguf');
    expect(isGguf(new TextEncoder().encode('GGUF\u0003\u0000'))).toBe(true);
    expect(isGguf(new TextEncoder().encode('%PDF-1.7'))).toBe(false);
    expect(isGguf(new Uint8Array([0x47, 0x47]))).toBe(false);
  });
});
