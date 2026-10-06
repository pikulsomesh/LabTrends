// Scores every outputs/<model>-b<batch>.json against the golden set and writes a Markdown table
// plus JSON. Each run file carries the requests it answered, so any batch size scores correctly.
// Usage: npx tsx eval/slm/report.ts <outputs-dir> <results.md> [results.json]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import models from './models.json';
import { BAR, passes, scoreOutputs, type EvalOutput, type EvalRequest, type Metrics } from './score';

interface RunFile {
  id: string;
  batch: number;
  status: 'ok' | 'unavailable' | 'failed';
  error?: string;
  sizeMB?: number;
  requests?: EvalRequest[];
  outputs?: EvalOutput[];
}

const [dir = 'outputs', mdPath = 'results.md', jsonPath = 'results.json'] = process.argv.slice(2);
const f = (n: number, d = 3) => n.toFixed(d);
const pc = (n: number) => `${(n * 100).toFixed(1)}%`;

interface Row {
  id: string;
  label: string;
  batch: number;
  sizeMB?: number;
  status: string;
  error?: string;
  m?: Metrics;
  ok?: boolean;
}

const rows: Row[] = [];
const files = existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.json')) : [];
for (const model of models) {
  const mine = files.filter((x) => x.startsWith(`${model.id}-b`)).sort((a, b) => parseInt(a.split('-b')[1]) - parseInt(b.split('-b')[1]));
  if (!mine.length) rows.push({ id: model.id, label: model.label, batch: 0, status: 'not run' });
  for (const file of mine) {
    const run = JSON.parse(readFileSync(join(dir, file), 'utf8')) as RunFile;
    if (run.status !== 'ok' || !run.outputs || !run.requests) {
      rows.push({ id: model.id, label: model.label, batch: run.batch, status: run.status, error: run.error });
      continue;
    }
    const m = scoreOutputs(run.outputs, undefined, run.requests);
    rows.push({ id: model.id, label: model.label, batch: run.batch, sizeMB: run.sizeMB, status: 'ok', m, ok: passes(m) });
  }
}

const scored = rows.filter((r) => r.m);
const lines: string[] = [];
lines.push('## SLM fallback eval');
lines.push('');
lines.push(
  `Golden set: ${scored[0]?.m?.items ?? 99} lines the parser cannot read (${scored[0]?.m?.positives ?? '?'} results, ${scored[0]?.m?.negatives ?? '?'} non-results). ` +
    `Bar to bundle: F1 >= ${BAR.f1}, false-positive rate on non-results <= ${pc(BAR.negativeFalsePositiveRate)}, valid JSON on every batch. ` +
    `"Batch" is how many lines go in one model call.`,
);
lines.push('');
lines.push('| Model | Batch | Size | F1 | Precision | Recall | Non-result false positives | Valid JSON | Discarded by app check | p50 per call | Bar |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  if (!r.m) {
    lines.push(`| ${r.label} | ${r.batch || ''} | | | | | | | | | ${r.status}${r.error ? `: ${r.error.slice(0, 80)}` : ''} |`);
    continue;
  }
  const m = r.m;
  lines.push(
    `| ${r.label} | ${r.batch} | ${r.sizeMB ? `${r.sizeMB.toFixed(0)} MB` : '?'} | ${f(m.f1)} | ${f(m.precision)} | ${f(m.recall)} | ${pc(m.negativeFalsePositiveRate)} | ${pc(m.validJsonRate)} | ${pc(m.discardedRate)} | ${(m.msPerBatchP50 / 1000).toFixed(1)} s | ${r.ok ? 'pass' : 'fail'} |`,
  );
}
lines.push('');
lines.push('Field accuracy among rows the app kept, and exact-row rate by kind of line:');
lines.push('');
const kinds = ['spaces', 'range-words', 'flag', 'unit-ocr', 'one-sided', 'no-range', 'layout', 'not-a-result'];
lines.push(`| Model | Batch | Name | Value | Range | Unit | ${kinds.join(' | ')} |`);
lines.push(`|---|---|---|---|---|---|${kinds.map(() => '---').join('|')}|`);
for (const r of scored) {
  const m = r.m!;
  const cells = kinds.map((k) => (m.byKind[k] ? `${m.byKind[k].correct}/${m.byKind[k].n}` : '-'));
  lines.push(`| ${r.label} | ${r.batch} | ${pc(m.nameAccuracy)} | ${pc(m.valueAccuracy)} | ${pc(m.rangeAccuracy)} | ${pc(m.unitAccuracy)} | ${cells.join(' | ')} |`);
}
lines.push('');

// Concrete failures for the three best runs and any run that produced broken JSON, so a score can be read.
const worth = [...scored].sort((a, b) => b.m!.f1 - a.m!.f1).slice(0, 3);
for (const r of scored) if (r.m!.validJsonRate < 1 && !worth.includes(r)) worth.push(r);
for (const r of worth.slice(0, 5)) {
  lines.push(`<details><summary>Examples of failures: ${r.label}, batch ${r.batch}</summary>`);
  lines.push('');
  for (const e of r.m!.examples) {
    if (e.what === 'invalid-json') lines.push(`- invalid JSON: \`${(e.got ?? '').replace(/[`\n]/g, ' ')}\``);
    else if (e.what === 'missed') lines.push(`- missed: \`${e.line}\``);
    else if (e.what === 'false-positive') lines.push(`- false positive on \`${e.line}\`: ${e.got}`);
    else lines.push(`- wrong on \`${e.line}\`: expected ${e.expected}; got ${e.got}`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
}

const winners = scored.filter((r) => r.ok).sort((a, b) => (a.sizeMB ?? 1e9) - (b.sizeMB ?? 1e9));
lines.push(
  winners.length
    ? `Smallest run that clears the bar: **${winners[0].label}**, batch ${winners[0].batch} (${winners[0].sizeMB?.toFixed(0) ?? '?'} MB).`
    : 'No run cleared the bar.',
);
lines.push('');

writeFileSync(mdPath, lines.join('\n'));
writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
console.log(lines.join('\n'));
