import { describe, expect, it } from 'vitest';
import {
  datePattern, formatDate, formatDateInput, localeDateOrder, orderFromText, parseDateInput, readDate, resolveDateOrder,
} from './dates';

describe('localeDateOrder', () => {
  it.each([
    ['en-IN', 'dmy'],
    ['en-GB', 'dmy'],
    ['de-DE', 'dmy'],
    ['en-US', 'mdy'],
    ['ja-JP', 'ymd'],
    ['sv-SE', 'ymd'],
  ])('%s -> %s', (locale, order) => expect(localeDateOrder(locale)).toBe(order));

  it('resolves a fixed preference without looking at the phone', () => {
    expect(resolveDateOrder('mdy')).toBe('mdy');
    expect(resolveDateOrder('dmy')).toBe('dmy');
  });
});

describe('readDate', () => {
  it('reads an ambiguous date in the user order', () => {
    expect(readDate('01/07/2026', { order: 'dmy' })).toBe('2026-07-01');
    expect(readDate('01/07/2026', { order: 'mdy' })).toBe('2026-01-07');
  });

  it('reads a year-first region like day first for a day-and-month date', () => {
    expect(readDate('01/07/2026', { order: 'ymd' })).toBe('2026-07-01');
  });

  it('needs no order when one part is above 12', () => {
    expect(readDate('13/03/2026', { order: 'mdy' })).toBe('2026-03-13');
    expect(readDate('03/13/2026', { order: 'dmy' })).toBe('2026-03-13');
  });

  it('lets the other dates on the report settle the order', () => {
    expect(readDate('01/07/2026', { order: 'mdy', context: 'Collected: 01/07/2026 Reported: 13/07/2026' })).toBe('2026-07-01');
    expect(readDate('04/03/2026', { order: 'dmy', context: 'Collected 04/03/2026 Reported 04/15/2026' })).toBe('2026-04-03');
  });

  it('ignores a report whose dates disagree', () => {
    expect(orderFromText('13/01/2026 and 01/13/2026')).toBeNull();
  });

  it('prefers the reading that is not in the future', () => {
    const today = new Date('2026-10-09T12:00:00');
    // 12/03/2026 month first is 3 December 2026, after today.
    expect(readDate('12/03/2026', { order: 'mdy', today })).toBe('2026-03-12');
    expect(readDate('03/01/2026', { order: 'mdy', today })).toBe('2026-03-01');
  });

  it.each([
    ['2026-03-12', '2026-03-12'],
    ['12-Mar-2026', '2026-03-12'],
    ['12 March 2026', '2026-03-12'],
    ['12th Mar 26', '2026-03-12'],
    ['Mar 12, 2026', '2026-03-12'],
    ['12.03.2026', '2026-03-12'],
    ['31/02/2026', null],
    ['no date', null],
  ])('reads %j', (printed, iso) => expect(readDate(printed, { order: 'dmy' })).toBe(iso));
});

describe('display and input', () => {
  it('shows the month as a word in the user order', () => {
    expect(formatDate('2026-07-01', 'dmy')).toBe('1 Jul 2026');
    expect(formatDate('2026-07-01', 'mdy')).toBe('Jul 1, 2026');
    expect(formatDate('2026-07-01', 'ymd')).toBe('2026-07-01');
  });

  it('round-trips the date field in each order', () => {
    for (const order of ['dmy', 'mdy', 'ymd'] as const) {
      const shown = formatDateInput('2026-07-01', order);
      expect(parseDateInput(shown, order), order).toBe('2026-07-01');
    }
    expect(formatDateInput('2026-07-01', 'dmy')).toBe('01/07/2026');
    expect(formatDateInput('2026-07-01', 'mdy')).toBe('07/01/2026');
    expect(datePattern('mdy')).toBe('mm/dd/yyyy');
  });

  it('always accepts yyyy-mm-dd and never guesses a typed date', () => {
    expect(parseDateInput('2026-03-12', 'mdy')).toBe('2026-03-12');
    expect(parseDateInput('13/03/2026', 'mdy')).toBeNull();
    expect(parseDateInput('1/7/26', 'dmy')).toBeNull();
  });
});
