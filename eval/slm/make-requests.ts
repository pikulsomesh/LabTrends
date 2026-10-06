// Writes the exact prompts the app would send, one per batch of golden lines, for run_models.py.
// Usage: npx tsx eval/slm/make-requests.ts <out.json>
import { writeFileSync } from 'node:fs';
import { buildRequests } from './score';

const out = process.argv[2] ?? 'requests.json';
const requests = buildRequests();
writeFileSync(out, JSON.stringify(requests, null, 2));
console.log(`wrote ${requests.length} batches to ${out}`);
