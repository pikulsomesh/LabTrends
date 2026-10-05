#!/usr/bin/env node
// Guardrail 1 check (CLAUDE.md): no network calls, analytics, crash reporters or telemetry.
// Fails on network APIs in app code and on known network or telemetry packages in package.json.
// The release APK permission check in .github/workflows/release.yml is the second line of defence.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const SCAN = ['App.tsx', 'index.ts', 'src', 'modules', 'plugins'];
const EXT = /\.(tsx?|jsx?|mjs|cjs|kt|java)$/;

const CODE_PATTERNS = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/HttpURLConnection|HttpsURLConnection|\bokhttp3\b|java\.net\.(URL|Socket)\b/, 'JVM networking'],
];

const PACKAGE_DENY = [
  /^axios$/, /^ky$/, /^got$/, /^node-fetch$/, /^socket\.io/, /^@apollo\//, /^graphql-request$/,
  /sentry/, /firebase/, /crashlytics/, /bugsnag/, /analytics/, /amplitude/, /mixpanel/,
  /posthog/, /datadog/, /newrelic/, /appcenter/, /^@segment\//,
  /^expo-updates$/, /^expo-insights$/, /^expo-notifications$/,
];

function* walk(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) {
      if (name === 'node_modules' || name === 'build') continue;
      yield* walk(join(path, name));
    }
  } else if (EXT.test(path)) {
    yield path;
  }
}

const problems = [];
const self = new URL(import.meta.url).pathname;

for (const entry of SCAN) {
  let start;
  try {
    start = join(root, entry);
    statSync(start);
  } catch {
    continue;
  }
  for (const file of walk(start)) {
    if (file === self) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/^\s*(\/\/|\*|#)/.test(line)) return;
        for (const [re, label] of CODE_PATTERNS) {
          if (re.test(line)) problems.push(`${relative(root, file)}:${i + 1}: ${label}`);
        }
      });
  }
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (PACKAGE_DENY.some((re) => re.test(name))) problems.push(`package.json: ${name}`);
}

if (problems.length) {
  console.error('Network or telemetry use found (CLAUDE.md guardrail 1):');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('No network or telemetry use found.');
