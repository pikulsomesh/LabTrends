// Opens the on-device database. The file lives in the app's private storage; allowBackup=false
// keeps it out of Android cloud backups.
import { openDatabaseAsync } from 'expo-sqlite';
import { prepareDatabase } from './schema';
import type { Db } from './types';

export const DB_NAME = 'labtrends.db';

let opening: Promise<Db> | null = null;

/** Returns the shared, migrated database connection. */
export function openDatabase(): Promise<Db> {
  opening ??= (async () => {
    const db = await openDatabaseAsync(DB_NAME);
    await prepareDatabase(db);
    return db;
  })().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}
