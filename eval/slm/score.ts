// Scoring for the SLM eval. Model output goes through the app's own acceptSlmRows, so a row only
// counts if the app would keep it. Nothing here touches a model; outputs come from run_models.py.
import { acceptSlmRows, SLM_SCHEMA, SLM_SYSTEM, slmUserPrompt } from '../../src/ai/slmRows';
import { SLM_BATCH } from '../../src/ai/extract';
import { canonicalize } from '../../src/utils/aliases';
import { GOLDEN, type GoldItem } from './golden';

export interface EvalRequest {
  id: number;
  system: string;
  user: string;
  schema: object;
  lines: string[];
}

export interface EvalOutput {
  id: number;
  /** Raw model text, or null when the call failed. */
  raw: string | null;
  ms: number;
  completionTokens: number;
}

/** Deterministic shuffle, so every model sees the same batches and each batch mixes kinds. */
export function orderedItems(items: GoldItem[] = GOLDEN, seed = 20261006): GoldItem[] {
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildRequests(items: GoldItem[] = GOLDEN): EvalRequest[] {
  const ordered = orderedItems(items);
  const requests: EvalRequest[] = [];
  for (let i = 0; i < ordered.length; i += SLM_BATCH) {
    const lines = ordered.slice(i, i + SLM_BATCH).map((it) => it.line);
    requests.push({ id: requests.length, system: SLM_SYSTEM, user: slmUserPrompt(lines), schema: SLM_SCHEMA, lines });
  }
  return requests;
}

const compactName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const compactUnit = (s: string) =>
  s.toLowerCase().replace(/\s+/g, '').replace(/µ/g, 'u').replace(/^gm\//, 'g/').replace(/^rng\//, 'mg/');

export interface Metrics {
  items: number;
  positives: number;
  negatives: number;
  batches: number;
  /** Batches whose output parsed as JSON with a rows array. */
  validJsonRate: number;
  /** Rows exactly right: line, name, value, ref_low, ref_high. */
  truePositives: number;
  wrongRows: number;
  missed: number;
  falsePositives: number;
  precision: number;
  recall: number;
  f1: number;
  /** Of positives the model returned a row for and the app kept: share with the right name / value / range / unit. */
  nameAccuracy: number;
  valueAccuracy: number;
  rangeAccuracy: number;
  unitAccuracy: number;
  /** Rows the model wrote that the app discarded (a number not on the line, a name not on the line). */
  rawRows: number;
  discardedRows: number;
  discardedRate: number;
  /** Share of not-a-result lines where the app would have kept a row. */
  negativeFalsePositiveRate: number;
  byKind: Record<string, { n: number; correct: number }>;
  msPerBatchP50: number;
  msPerBatchP95: number;
  tokensPerSecond: number;
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function scoreOutputs(outputs: EvalOutput[], items: GoldItem[] = GOLDEN): Metrics {
  const requests = buildRequests(items);
  const byId = new Map(outputs.map((o) => [o.id, o]));
  const expectByLine = new Map(items.map((it) => [it.line, it]));

  let validBatches = 0;
  let tp = 0, wrong = 0, fp = 0, rawRows = 0, kept = 0;
  let nameOk = 0, valueOk = 0, rangeOk = 0, unitOk = 0, answered = 0;
  const byKind: Metrics['byKind'] = {};
  const ms: number[] = [];
  let tokens = 0, totalMs = 0;
  let negKept = 0;

  for (const req of requests) {
    const out = byId.get(req.id);
    let json: unknown = null;
    let valid = false;
    if (out?.raw != null) {
      try {
        json = JSON.parse(out.raw);
        valid = Array.isArray((json as { rows?: unknown })?.rows);
      } catch {
        valid = false;
      }
    }
    if (valid) validBatches++;
    if (out) {
      ms.push(out.ms);
      tokens += out.completionTokens;
      totalMs += out.ms;
    }
    const accepted = valid ? acceptSlmRows(json, req.lines) : [];
    if (valid) rawRows += (json as { rows: unknown[] }).rows.length;
    kept += accepted.length;
    const acceptedByLine = new Map(accepted.map((r) => [r.sourceLine, r]));

    for (const line of req.lines) {
      const item = expectByLine.get(line)!;
      const row = acceptedByLine.get(line);
      const kind = (byKind[item.kind] ??= { n: 0, correct: 0 });
      kind.n++;
      if (!item.expect) {
        if (row) {
          fp++;
          negKept++;
        } else kind.correct++;
        continue;
      }
      if (!row) continue;
      answered++;
      const e = item.expect;
      const name = compactName(row.name) === compactName(e.name) || (row.canonicalName != null && row.canonicalName === canonicalize(e.name));
      const value = row.value === e.value;
      const range = row.refLow === e.ref_low && row.refHigh === e.ref_high;
      const unit = compactUnit(row.unit) === compactUnit(e.unit);
      if (name) nameOk++;
      if (value) valueOk++;
      if (range) rangeOk++;
      if (unit) unitOk++;
      if (name && value && range) {
        tp++;
        kind.correct++;
      } else {
        wrong++;
      }
    }
  }

  const positives = items.filter((i) => i.expect).length;
  const negatives = items.length - positives;
  const missed = positives - tp - wrong;
  const precision = ratio(tp, tp + wrong + fp);
  const recall = ratio(tp, positives);
  const sorted = [...ms].sort((a, b) => a - b);
  return {
    items: items.length,
    positives,
    negatives,
    batches: requests.length,
    validJsonRate: ratio(validBatches, requests.length),
    truePositives: tp,
    wrongRows: wrong,
    missed,
    falsePositives: fp,
    precision,
    recall,
    f1: ratio(2 * precision * recall, precision + recall),
    nameAccuracy: ratio(nameOk, answered),
    valueAccuracy: ratio(valueOk, answered),
    rangeAccuracy: ratio(rangeOk, answered),
    unitAccuracy: ratio(unitOk, answered),
    rawRows,
    discardedRows: Math.max(0, rawRows - kept),
    discardedRate: ratio(Math.max(0, rawRows - kept), rawRows),
    negativeFalsePositiveRate: ratio(negKept, negatives),
    byKind,
    msPerBatchP50: pct(sorted, 0.5),
    msPerBatchP95: pct(sorted, 0.95),
    tokensPerSecond: totalMs ? tokens / (totalMs / 1000) : 0,
  };
}

/** What "works well" means for this app. A model must clear all three to be bundled. */
export const BAR = { f1: 0.9, negativeFalsePositiveRate: 0.1, validJsonRate: 1 } as const;

export const passes = (m: Metrics) =>
  m.f1 >= BAR.f1 && m.negativeFalsePositiveRate <= BAR.negativeFalsePositiveRate && m.validJsonRate >= BAR.validJsonRate;
