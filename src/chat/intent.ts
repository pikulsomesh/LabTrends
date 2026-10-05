// Data-only chat, step 1 and 2 (PLAN.md Phase 7): a question becomes an intent plus the markers it
// names, by fixed rules. No model and no generated text. Questions asking what results mean, or
// what to do about them, are out of scope (CLAUDE.md guardrail 4).
import { normalizeName, type Canonicalizer } from '../utils/aliases';

export type Intent = 'trend' | 'latest' | 'compare' | 'list' | 'range';

export type Question =
  | { kind: 'ask'; intent: Intent; markers: string[] }
  | { kind: 'out-of-scope' }
  | { kind: 'help' };

export interface MarkerIndex {
  /** Printed names and aliases to canonical names, user aliases included. */
  canonicalize: Canonicalizer;
  /** Normalized alias to canonical name, for fuzzy matching of misspellings. */
  aliases: Map<string, string>;
  /** The profile's marker keys (canonical name, or printed name when none matched). */
  markerKeys: string[];
}

// "Normal range" and "reference range" ask for printed text, so they are not interpretation.
const RANGE_PHRASE = /\b(?:normal|reference|ref|printed|lab)\s+(?:range|interval|limits?)\b/g;
const OUT_OF_SCOPE =
  /\b(?:should|why|diagnos\w*|treat\w*|cure|medicin\w*|medication|drugs?|dose|diet|eat|food|exercise|worr\w*|serious|danger\w*|safe|healthy|unhealthy|good|bad|ok|okay|fine|normal|abnormal|high|low|elevated|deficien\w*|concern\w*|mean|means|meaning|cause\w*|symptoms?|disease|condition|doctor|risk\w*|improve\w*|better|worse)\b/;

const RULES: [Intent, RegExp][] = [
  ['range', /\b(?:range|reference|interval|limits?)\b/],
  ['compare', /\b(?:compare\w*|vs|versus|change[sd]?|difference|previous|before|earlier)\b/],
  ['trend', /\b(?:trend\w*|history|over time|graph|chart|plot|track\w*|progress|timeline|all (?:my )?values|every)\b/],
  ['latest', /\b(?:latest|last|recent|current|now|newest|value|level|result)\b/],
];

const LIST = /\b(?:list|which|what)\b.*\b(?:tests?|markers?|values|results|biomarkers)\b|\ball (?:my )?(?:tests|markers|results)\b/;
const HELP = /^(?:hi|hello|hey|help|\?|what can you do\b.*)$/;

const MAX_NGRAM = 4;

// Question words never fuzzily matched to a marker name ("values" is one edit from nothing useful,
// but "latest" or "change" could drift onto a short alias).
const STOP = new Set(
  'a an the my me i is are was were of for in on at to and or vs versus what which show tell give list all ' +
  'latest last recent current newest value values level levels result results trend trends history time graph ' +
  'chart plot compare change changed difference previous before earlier range reference interval limit limits ' +
  'printed normal from since over with how much many test tests marker markers report reports'.split(' '),
);

/** Levenshtein distance, stopping early once it exceeds `limit`. */
export function editDistance(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Markers named in the question, in the order they appear. Longer names win over their parts. */
export function findMarkers(text: string, index: MarkerIndex): string[] {
  const tokens = normalizeName(text).split(' ').filter(Boolean);
  const byKey = new Map(index.markerKeys.map((k) => [normalizeName(k), k]));
  const used = new Array(tokens.length).fill(false);
  const found: { at: number; key: string }[] = [];

  const exact = (phrase: string) => byKey.get(phrase) ?? index.canonicalize(phrase);
  const fuzzy = (phrase: string) => {
    if (phrase.length < 5) return null; // short names (ALT, AST, Hb) must be exact
    const limit = phrase.length >= 9 ? 2 : 1;
    let best: string | null = null;
    let bestD = limit + 1;
    for (const [alias, canonical] of [...index.aliases, ...byKey]) {
      const d = editDistance(phrase, alias, limit);
      if (d < bestD) [best, bestD] = [canonical, d];
    }
    return best;
  };

  for (const match of [exact, fuzzy]) {
    for (let n = MAX_NGRAM; n >= 1; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        if (used.slice(i, i + n).some(Boolean)) continue;
        const words = tokens.slice(i, i + n);
        if (match === fuzzy && words.some((w) => STOP.has(w))) continue;
        const hit = match(words.join(' '));
        if (!hit) continue;
        used.fill(true, i, i + n);
        if (!found.some((f) => f.key === hit)) found.push({ at: i, key: hit });
      }
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.key);
}

export function parseQuestion(text: string, index: MarkerIndex): Question {
  const q = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q || HELP.test(q)) return { kind: 'help' };
  if (OUT_OF_SCOPE.test(q.replace(RANGE_PHRASE, ' range '))) return { kind: 'out-of-scope' };

  const markers = findMarkers(q, index);
  if (!markers.length && LIST.test(q)) return { kind: 'ask', intent: 'list', markers };
  const intent = RULES.find(([, re]) => re.test(q))?.[0] ?? (markers.length > 1 ? 'compare' : 'latest');
  return { kind: 'ask', intent, markers };
}
