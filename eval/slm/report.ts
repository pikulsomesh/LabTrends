// Scores every outputs/<model>.json against the golden set and writes a Markdown table plus JSON.
// Usage: npx tsx eval/slm/report.ts <outputs-dir> <results.md> [results.json]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import models from './models.json';
import { BAR, passes, scoreOutputs, type EvalOutput, type Metrics } from './score';

interface RunFile {
  id: string;
  status: 'ok' | 'unavailable' | 'failed';
  error?: string;
  sizeMB?: number;
  outputs?: EvalOutput[];
}

const [dir = 'outputs', mdPath = 'results.md', jsonPath = 'results.json'] = process.argv.slice(2);
const f = (n: number, d = 3) => n.toFixed(d);
const pc = (n: number) => `${(n * 100).toFixed(1)}%`;

const rows: { id: string; label: string; params: string; sizeMB?: number; status: string; error?: string; m?: Metrics; ok?: boolean }[] = [];
for (const model of models) {
  const p = join(dir, `${model.id}.json`);
  if (!existsSync(p)) {
    rows.push({ ...model, status: 'not run' });
    continue;
  }
  const run = JSON.parse(readFileSync(p, 'utf8')) as RunFile;
  if (run.status !== 'ok' || !run.outputs) {
    rows.push({ ...model, status: run.status, error: run.error });
    continue;
  }
  const m = scoreOutputs(run.outputs);
  rows.push({ ...model, sizeMB: run.sizeMB, status: 'ok', m, ok: passes(m) });
}

const scored = rows.filter((r) => r.m);
const lines: string[] = [];
lines.push('## SLM fallback eval');
lines.push('');
lines.push(
  `Golden set: ${scored[0]?.m?.items ?? 99} lines the parser cannot read (${scored[0]?.m?.positives ?? '?'} results, ${scored[0]?.m?.negatives ?? '?'} non-results). ` +
    `Bar to bundle: F1 >= ${BAR.f1}, false-positive rate on non-results <= ${pc(BAR.negativeFalsePositiveRate)}, valid JSON on every batch.`,
);
lines.push('');
lines.push('| Model | Size | F1 | Precision | Recall | Non-result false positives | Valid JSON | Discarded by app check | p50 per batch | Bar |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  if (!r.m) {
    lines.push(`| ${r.label} | | | | | | | | | ${r.status}${r.error ? `: ${r.error.slice(0, 80)}` : ''} |`);
    continue;
  }
  const m = r.m;
  lines.push(
    `| ${r.label} | ${r.sizeMB ? `${r.sizeMB.toFixed(0)} MB` : '?'} | ${f(m.f1)} | ${f(m.precision)} | ${f(m.recall)} | ${pc(m.negativeFalsePositiveRate)} | ${pc(m.validJsonRate)} | ${pc(m.discardedRate)} | ${(m.msPerBatchP50 / 1000).toFixed(1)} s | ${r.ok ? 'pass' : 'fail'} |`,
  );
}
lines.push('');
lines.push('Field accuracy among rows the app kept, and exact-row rate by kind of line:');
lines.push('');
const kinds = ['spaces', 'range-words', 'flag', 'unit-ocr', 'one-sided', 'no-range', 'layout', 'not-a-result'];
lines.push(`| Model | Name | Value | Range | Unit | ${kinds.join(' | ')} |`);
lines.push(`|---|---|---|---|---|${kinds.map(() => '---').join('|')}|`);
for (const r of scored) {
  const m = r.m!;
  const cells = kinds.map((k) => (m.byKind[k] ? `${m.byKind[k].correct}/${m.byKind[k].n}` : '-'));
  lines.push(`| ${r.label} | ${pc(m.nameAccuracy)} | ${pc(m.valueAccuracy)} | ${pc(m.rangeAccuracy)} | ${pc(m.unitAccuracy)} | ${cells.join(' | ')} |`);
}
lines.push('');
const winners = scored.filter((r) => r.ok).sort((a, b) => (a.sizeMB ?? 1e9) - (b.sizeMB ?? 1e9));
lines.push(
  winners.length
    ? `Smallest model that clears the bar: **${winners[0].label}** (${winners[0].sizeMB?.toFixed(0) ?? '?'} MB).`
    : 'No model cleared the bar. The best by F1 is the one to improve the prompt for, or the bar needs a second look.',
);
lines.push('');

writeFileSync(mdPath, lines.join('\n'));
writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
console.log(lines.join('\n'));
