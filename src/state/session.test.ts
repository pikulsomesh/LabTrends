import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getActiveProfileId, setActiveProfileId } from '../db/appState';
import { createProfile } from '../db/profiles';
import { prepareDatabase } from '../db/schema';
import { openTestDb } from '../db/testDb';
import { addProfile, editProfileName, loadSession, removeProfile, selectProfile } from './session';

let db: ReturnType<typeof openTestDb>;

beforeEach(async () => {
  db = openTestDb();
  await prepareDatabase(db);
});
afterEach(() => db.close());

describe('active profile', () => {
  it('starts with no profiles and none active', async () => {
    expect(await loadSession(db)).toEqual({ profiles: [], activeId: null });
  });

  it('makes a new profile active and remembers it', async () => {
    await addProfile(db, 'Ravi');
    const s = await addProfile(db, 'Asha');
    expect(s.profiles.map((p) => p.name)).toEqual(['Asha', 'Ravi']);
    expect(s.profiles.find((p) => p.id === s.activeId)!.name).toBe('Asha');
    expect((await loadSession(db)).activeId).toBe(s.activeId);
  });

  it('switches and clears the active profile', async () => {
    const a = await createProfile(db, 'Asha');
    const r = await createProfile(db, 'Ravi');
    expect((await selectProfile(db, a.id)).activeId).toBe(a.id);
    expect((await selectProfile(db, r.id)).activeId).toBe(r.id);
    expect((await selectProfile(db, null)).activeId).toBeNull();
  });

  it('refuses a profile that does not exist', async () => {
    await expect(setActiveProfileId(db, 999)).rejects.toThrow(/FOREIGN KEY/);
    expect(await getActiveProfileId(db)).toBeNull();
  });

  it('clears the active profile when it is deleted, and keeps it when another is', async () => {
    const a = await createProfile(db, 'Asha');
    const r = await createProfile(db, 'Ravi');
    await selectProfile(db, a.id);
    expect((await removeProfile(db, r.id)).activeId).toBe(a.id);
    const s = await removeProfile(db, a.id);
    expect(s).toEqual({ profiles: [], activeId: null });
  });

  it('renames without changing the active profile', async () => {
    const { activeId } = await addProfile(db, 'Asha');
    const s = await editProfileName(db, activeId!, 'Asha M');
    expect(s.activeId).toBe(activeId);
    expect(s.profiles[0].name).toBe('Asha M');
  });

  it('rejects an empty name and changes nothing', async () => {
    await expect(addProfile(db, '  ')).rejects.toThrow(/empty/);
    expect(await loadSession(db)).toEqual({ profiles: [], activeId: null });
  });
});
