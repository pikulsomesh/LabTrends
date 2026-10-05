import { describe, expect, it } from 'vitest';
import { canGoBack, currentRoute, initialNav, navReducer, type NavState } from './navigation';

const names = (s: NavState) => s.stack.map((r) => r.name);

describe('navigation', () => {
  it('opens on the landing screen when no profile is remembered', () => {
    const s = initialNav(null);
    expect(names(s)).toEqual(['profiles']);
    expect(canGoBack(s)).toBe(false);
  });

  it('reopens the remembered profile, with the landing screen behind it', () => {
    const s = initialNav(3);
    expect(currentRoute(s).name).toBe('profileHome');
    expect(names(navReducer(s, { type: 'back' }))).toEqual(['profiles']);
  });

  it('back on the landing screen leaves the state alone so Android can exit', () => {
    const s = initialNav(null);
    expect(navReducer(s, { type: 'back' })).toBe(s);
  });

  it('opening a profile never stacks profile screens', () => {
    let s = initialNav(null);
    s = navReducer(s, { type: 'openProfile' });
    s = navReducer(s, { type: 'openProfile' });
    expect(names(s)).toEqual(['profiles', 'profileHome']);
  });

  it('closing a profile returns to the landing screen', () => {
    const s = navReducer(navReducer(initialNav(1), { type: 'openSpike' }), { type: 'closeProfile' });
    expect(names(s)).toEqual(['profiles']);
  });

  it('pushes and pops the spike screen', () => {
    const s = navReducer(initialNav(null), { type: 'openSpike' });
    expect(currentRoute(s).name).toBe('spike');
    expect(names(navReducer(s, { type: 'back' }))).toEqual(['profiles']);
  });
});
