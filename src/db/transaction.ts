// Transactions run on the main connection so the foreign_keys pragma applies. (expo-sqlite's
// withExclusiveTransactionAsync opens a second connection, where foreign keys would be off.)
// They are queued, because SQLite cannot nest BEGIN on one connection.
import type { Db } from './types';

const queues = new WeakMap<Db, Promise<unknown>>();

export function transaction<T>(db: Db, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(db) ?? Promise.resolve();
  const next = prev.then(async () => {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await task();
    });
    return result;
  });
  queues.set(db, next.catch(() => undefined));
  return next;
}
