// Writes the exact prompts the app would send, one per batch of golden lines, for run_models.py.
// Usage: npx tsx eval/slm/make-requests.ts <out.json> [batch size]
import { writeFileSync } from 'node:fs';
import { buildRequests } from './score';

const out = process.argv[2] ?? 'requests.json';
const batch = Number(process.argv[3] ?? 10);
const requests = buildRequests(undefined, batch);
writeFileSync(out, JSON.stringify(requests, null, 2));
console.log(`wrote ${requests.length} batches of ${batch} to ${out}`);
