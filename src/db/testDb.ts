// Test-only Db over node:sqlite (Node 22.13+), so the data layer runs under vitest without a
// phone. Imported by *.test.ts files only; never import it from app code.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Db } from './types';

export function openTestDb(): Db & { close(): void } {
  const raw = new DatabaseSync(':memory:');
  const plain = <T>(row: unknown) => (row ? ({ ...(row as object) } as T) : null);
  const db = {
    async execAsync(source: string) {
      raw.exec(source);
    },
    async runAsync(source: string, params: SQLInputValue[]) {
      const r = raw.prepare(source).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync<T>(source: string, params: SQLInputValue[]) {
      return plain<T>(raw.prepare(source).get(...params));
    },
    async getAllAsync<T>(source: string, params: SQLInputValue[]) {
      return raw.prepare(source).all(...params).map((r) => plain<T>(r)!);
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    close: () => raw.close(),
  };
  return db;
}
