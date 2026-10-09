// Holds the profile list and the active profile_id for every screen. Screens that show or save
// lab data read it from useActiveProfile() and pass its id to every query (CLAUDE.md).
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Db, Profile } from '../db';
import { resolveDateOrder, type DateOrder, type DatePref } from '../utils/dates';
import * as session from './session';

interface ActiveProfileValue {
  db: Db;
  profiles: Profile[];
  active: Profile | null;
  select(id: number | null): Promise<void>;
  create(name: string): Promise<void>;
  rename(id: number, name: string): Promise<void>;
  remove(id: number): Promise<void>;
  /** Re-reads profiles from the database, after a restore. */
  reload(): Promise<void>;
  /** The date setting, and the day and month order it resolves to on this phone. */
  datePref: DatePref;
  dateOrder: DateOrder;
  setDatePref(pref: DatePref): Promise<void>;
}

const Ctx = createContext<ActiveProfileValue | null>(null);

interface Props {
  db: Db;
  initial: session.Session;
  children: ReactNode;
}

export function ActiveProfileProvider({ db, initial, children }: Props) {
  const [state, setState] = useState(initial);
  const apply = useCallback(
    <A extends unknown[]>(fn: (db: Db, ...args: A) => Promise<session.Session>) =>
      async (...args: A) => setState(await fn(db, ...args)),
    [db],
  );
  const value = useMemo<ActiveProfileValue>(
    () => ({
      db,
      profiles: state.profiles,
      active: state.profiles.find((p) => p.id === state.activeId) ?? null,
      select: apply(session.selectProfile),
      create: apply(session.addProfile),
      rename: apply(session.editProfileName),
      remove: apply(session.removeProfile),
      reload: apply(session.loadSession),
      datePref: state.datePref,
      dateOrder: resolveDateOrder(state.datePref),
      setDatePref: apply(session.changeDatePref),
    }),
    [db, state, apply],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfiles(): ActiveProfileValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfiles must be used inside ActiveProfileProvider.');
  return v;
}

/** The active profile, for screens that only make sense with one selected. */
export function useActiveProfile(): Profile {
  const { active } = useProfiles();
  if (!active) throw new Error('No active profile.');
  return active;
}

/** The day and month order for reading and showing dates. */
export const useDateOrder = (): DateOrder => useProfiles().dateOrder;
