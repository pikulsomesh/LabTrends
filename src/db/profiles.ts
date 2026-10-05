import type { Db, Profile } from './types';

interface ProfileRow {
  id: number;
  name: string;
  created_at: string;
}

const toProfile = (r: ProfileRow): Profile => ({ id: r.id, name: r.name, createdAt: r.created_at });

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error('Profile name must not be empty.');
  if (n.length > 60) throw new Error('Profile name must be 60 characters or fewer.');
  return n;
}

export async function createProfile(db: Db, name: string): Promise<Profile> {
  const { lastInsertRowId } = await db.runAsync('INSERT INTO profiles (name) VALUES (?)', [cleanName(name)]);
  return (await getProfile(db, lastInsertRowId))!;
}

export async function listProfiles(db: Db): Promise<Profile[]> {
  const rows = await db.getAllAsync<ProfileRow>(
    'SELECT id, name, created_at FROM profiles ORDER BY name COLLATE NOCASE, id',
    [],
  );
  return rows.map(toProfile);
}

export async function getProfile(db: Db, id: number): Promise<Profile | null> {
  const row = await db.getFirstAsync<ProfileRow>('SELECT id, name, created_at FROM profiles WHERE id = ?', [id]);
  return row ? toProfile(row) : null;
}

export async function renameProfile(db: Db, id: number, name: string): Promise<boolean> {
  const { changes } = await db.runAsync('UPDATE profiles SET name = ? WHERE id = ?', [cleanName(name), id]);
  return changes > 0;
}

/** Deletes the profile and, through ON DELETE CASCADE, all of its reports and values. */
export async function deleteProfile(db: Db, id: number): Promise<boolean> {
  const { changes } = await db.runAsync('DELETE FROM profiles WHERE id = ?', [id]);
  return changes > 0;
}
