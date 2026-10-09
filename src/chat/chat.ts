// Entry point for the chat screen: builds the marker index for a profile and answers one question.
// Direct module imports keep this free of expo-sqlite so it runs under vitest.
import { loadCanonicalizer } from '../db/aliases';
import { listMarkers } from '../db/biomarkers';
import type { Db } from '../db/types';
import { normalizeName } from '../utils/aliases';
import { answer, type Answer, type DateShower } from './answer';
import { parseQuestion, type MarkerIndex } from './intent';

export async function loadMarkerIndex(db: Db, profileId: number): Promise<MarkerIndex> {
  const rows = await db.getAllAsync<{ alias: string; canonical_name: string }>('SELECT alias, canonical_name FROM aliases', []);
  const aliases = new Map<string, string>();
  for (const r of rows) {
    aliases.set(normalizeName(r.alias), r.canonical_name);
    aliases.set(normalizeName(r.canonical_name), r.canonical_name);
  }
  return {
    canonicalize: await loadCanonicalizer(db),
    aliases,
    markerKeys: (await listMarkers(db, profileId)).map((m) => m.key),
  };
}

export async function ask(db: Db, profileId: number, index: MarkerIndex, text: string, showDate?: DateShower): Promise<Answer[]> {
  return answer(db, profileId, parseQuestion(text, index), showDate);
}
