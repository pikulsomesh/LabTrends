// The active profile, remembered across launches. Screens read it through ActiveProfileProvider.
import { DATE_PREFS, type DatePref } from '../utils/dates';
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

/** How dates are read and shown: 'auto' follows the phone's region. */
export async function getDatePref(db: Db): Promise<DatePref> {
  const row = await db.getFirstAsync<{ date_pref: string }>('SELECT date_pref FROM app_state WHERE id = 1', []);
  return DATE_PREFS.includes(row?.date_pref as DatePref) ? (row!.date_pref as DatePref) : 'auto';
}

export async function setDatePref(db: Db, pref: DatePref): Promise<void> {
  if (!DATE_PREFS.includes(pref)) throw new Error(`Unknown date order "${pref}".`);
  await db.runAsync('UPDATE app_state SET date_pref = ? WHERE id = 1', [pref]);
}
