// The active profile, remembered across launches. Screens read it through ActiveProfileProvider.
import type { Db } from './types';

/** The remembered active profile id, or null when none is set or it no longer exists. */
export async function getActiveProfileId(db: Db): Promise<number | null> {
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT p.id FROM app_state s JOIN profiles p ON p.id = s.active_profile_id WHERE s.id = 1',
    [],
  );
  return row?.id ?? null;
}

export async function setActiveProfileId(db: Db, id: number | null): Promise<void> {
  await db.runAsync('UPDATE app_state SET active_profile_id = ? WHERE id = 1', [id]);
}
