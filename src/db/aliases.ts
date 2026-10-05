// The alias table: the seed from src/utils/aliases.ts plus aliases the user adds when they map an
// unknown printed name on the Verification screen.
import { createCanonicalizer, normalizeName, seedEntries, type Canonicalizer } from '../utils/aliases';
import { transaction } from './transaction';
import type { Db } from './types';

const CHUNK = 200;

/** Inserts seed aliases that are missing. Never overwrites a row, so user mappings win. */
export async function seedAliases(db: Db): Promise<void> {
  const entries = seedEntries();
  await transaction(db, async () => {
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      await db.runAsync(
        `INSERT OR IGNORE INTO aliases (alias, canonical_name, source) VALUES ${chunk
          .map(() => "(?, ?, 'seed')")
          .join(', ')}`,
        chunk.flat(),
      );
    }
  });
}

/** Builds a canonicalizer from the alias table, user-added aliases included. */
export async function loadCanonicalizer(db: Db): Promise<Canonicalizer> {
  const rows = await db.getAllAsync<{ alias: string; canonical_name: string }>(
    'SELECT alias, canonical_name FROM aliases',
    [],
  );
  return createCanonicalizer(rows.map((r) => [r.alias, r.canonical_name]));
}

/** Maps a printed name to a canonical name, replacing any existing mapping for it. */
export async function setUserAlias(db: Db, printed: string, canonicalName: string): Promise<void> {
  const alias = normalizeName(printed);
  const canonical = canonicalName.trim();
  if (!alias || !canonical) throw new Error('Alias and canonical name must not be empty.');
  await db.runAsync(
    `INSERT INTO aliases (alias, canonical_name, source) VALUES (?, ?, 'user')
     ON CONFLICT(alias) DO UPDATE SET canonical_name = excluded.canonical_name, source = 'user'`,
    [alias, canonical],
  );
}

/** All canonical names, sorted, for pickers. */
export async function listCanonicalNames(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ canonical_name: string }>(
    'SELECT DISTINCT canonical_name FROM aliases ORDER BY canonical_name COLLATE NOCASE',
    [],
  );
  return rows.map((r) => r.canonical_name);
}
