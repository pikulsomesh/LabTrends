// Screen stack for the app. A plain reducer instead of a navigation library keeps Phase 3 free of
// new native modules. Pure, so it is unit-tested without a phone.

export type Route = { name: 'profiles' } | { name: 'profileHome' } | { name: 'ingest' } | { name: 'spike' };

export interface NavState {
  stack: Route[];
}

export type NavAction =
  | { type: 'openProfile' }
  | { type: 'openIngest' }
  | { type: 'openSpike' }
  | { type: 'closeProfile' }
  | { type: 'back' };

export const initialNav = (activeProfileId: number | null): NavState => ({
  stack: activeProfileId == null ? [{ name: 'profiles' }] : [{ name: 'profiles' }, { name: 'profileHome' }],
});

export const currentRoute = (s: NavState): Route => s.stack[s.stack.length - 1];

/** True when "back" has somewhere to go; otherwise Android's back button should leave the app. */
export const canGoBack = (s: NavState): boolean => s.stack.length > 1;

export function navReducer(s: NavState, a: NavAction): NavState {
  switch (a.type) {
    case 'openProfile':
      return { stack: [{ name: 'profiles' }, { name: 'profileHome' }] };
    case 'openIngest':
      // Always on top of the profile home, so back returns there and the extracted text is dropped.
      return { stack: [{ name: 'profiles' }, { name: 'profileHome' }, { name: 'ingest' }] };
    case 'closeProfile':
      return { stack: [{ name: 'profiles' }] };
    case 'openSpike':
      return { stack: [...s.stack, { name: 'spike' }] };
    case 'back':
      return canGoBack(s) ? { stack: s.stack.slice(0, -1) } : s;
  }
}
