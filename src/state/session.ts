// Profile actions that keep the profile list and the remembered active profile in step.
// No React here, so it runs under vitest against testDb.
// Imports the db modules directly, not '../db', which pulls in expo-sqlite.
import { getActiveProfileId, getDatePref, setActiveProfileId, setDatePref } from '../db/appState';
import { createProfile, deleteProfile, listProfiles, renameProfile } from '../db/profiles';
import type { Db, Profile } from '../db/types';
import type { DatePref } from '../utils/dates';

export interface Session {
  profiles: Profile[];
  /** Always one of `profiles`, or null. */
  activeId: number | null;
  /** Day and month order for reading and showing dates. A setting for the phone, not per profile. */
  datePref: DatePref;
}

export async function loadSession(db: Db): Promise<Session> {
  const [profiles, activeId, datePref] = await Promise.all([listProfiles(db), getActiveProfileId(db), getDatePref(db)]);
  return { profiles, activeId, datePref };
}

export async function changeDatePref(db: Db, pref: DatePref): Promise<Session> {
  await setDatePref(db, pref);
  return loadSession(db);
}

export async function selectProfile(db: Db, id: number | null): Promise<Session> {
  await setActiveProfileId(db, id);
  return loadSession(db);
}

/** Creates a profile and makes it the active one. */
export async function addProfile(db: Db, name: string): Promise<Session> {
  const p = await createProfile(db, name);
  return selectProfile(db, p.id);
}

export async function editProfileName(db: Db, id: number, name: string): Promise<Session> {
  await renameProfile(db, id, name);
  return loadSession(db);
}

/** Deletes a profile with all its reports. If it was active, no profile is active afterwards. */
export async function removeProfile(db: Db, id: number): Promise<Session> {
  await deleteProfile(db, id);
  return loadSession(db);
}
