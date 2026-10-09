// Day and month order for reading and showing dates. "01/07/2026" is 1 July in India and the UK but
// 7 January in the US, so the order comes from the phone's region setting (no location access, no
// network), and the user can override it in Settings. Reading a report also looks at every date
// printed on it: one unambiguous date such as "13/03/2026" settles the order for the rest.
// Stored dates are always ISO yyyy-mm-dd; only reading and display use the order.

export type DateOrder = 'dmy' | 'mdy' | 'ymd';
/** What the user picked in Settings. 'auto' follows the phone's region. */
export type DatePref = 'auto' | DateOrder;

export const DATE_PREFS: readonly DatePref[] = ['auto', 'dmy', 'mdy', 'ymd'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Day, month and year order of a locale's short numeric date, e.g. 'mdy' for en-US. */
export function localeDateOrder(locale?: string): DateOrder | null {
  try {
    // 2026-07-01 is unambiguous: day 1, month 7.
    const probe = new Date(2026, 6, 1);
    const fmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
    let order = '';
    if (typeof fmt.formatToParts === 'function') {
      for (const p of fmt.formatToParts(probe)) {
        if (p.type === 'day') order += 'd';
        else if (p.type === 'month') order += 'm';
        else if (p.type === 'year') order += 'y';
      }
    } else {
      const s = fmt.format(probe);
      const at = { d: s.search(/(^|\D)0?1(\D|$)/), m: s.search(/(^|\D)0?7(\D|$)/), y: s.indexOf('2026') };
      if (at.d < 0 || at.m < 0 || at.y < 0) return null;
      order = (['d', 'm', 'y'] as ('d' | 'm' | 'y')[]).sort((a, b) => at[a] - at[b]).join('');
    }
    if (order === 'dmy' || order === 'mdy' || order === 'ymd') return order;
    if (order === 'ydm') return 'ymd';
    return null;
  } catch {
    return null;
  }
}

/** The phone's order. Hermes formats with the device locale when no locale is passed. */
export const deviceDateOrder = (): DateOrder => localeDateOrder() ?? 'dmy';

export const resolveDateOrder = (pref: DatePref): DateOrder => (pref === 'auto' ? deviceDateOrder() : pref);

const pad = (n: number) => String(n).padStart(2, '0');

function isoOf(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2999) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

const localIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const monthIndex = (name: string) => {
  const i = MONTHS.findIndex((m) => name.toLowerCase().startsWith(m.toLowerCase()));
  return i < 0 ? null : i + 1;
};

// The numeric forms: 01/07/2026, 1-7-26, 01.07.2026 (day and month, either order), and 2026-07-01.
const NUMERIC_DATE = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g;
const ISO_LIKE = /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/;
// 12 Mar 2026, 12-Mar-26, 12th March 2026
const DAY_MONTH_NAME = /\b(\d{1,2})(?:st|nd|rd|th)?[\s/.-]*([A-Za-z]{3,9})[\s/.,-]*(\d{4}|\d{2})\b/;
// Mar 12, 2026 or March 12 2026
const MONTH_NAME_DAY = /\b([A-Za-z]{3,9})[\s.-]*(\d{1,2})(?:st|nd|rd|th)?,?[\s.-]+(\d{4})\b/;

/**
 * The order the report itself shows, from any numeric date on it where one part is above 12:
 * "13/03/2026" can only be day first. Null when every date is ambiguous or they disagree.
 */
export function orderFromText(text: string): 'dmy' | 'mdy' | null {
  let dmy = false;
  let mdy = false;
  for (const m of text.matchAll(NUMERIC_DATE)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) mdy = true;
  }
  return dmy === mdy ? null : dmy ? 'dmy' : 'mdy';
}

export interface ReadDateOptions {
  /** The user's order, used only when a date could be read either way. */
  order: DateOrder;
  /** The whole report, to learn its order from other dates printed on it. */
  context?: string;
  /** Lab reports are not dated in the future: when one reading is, the other wins. */
  today?: Date;
}

/** Reads one printed date as ISO yyyy-mm-dd, or null. */
export function readDate(printed: string, { order, context, today }: ReadDateOptions): string | null {
  const s = printed.trim();
  const iso = ISO_LIKE.exec(s);
  if (iso) return isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const named = DAY_MONTH_NAME.exec(s);
  if (named && monthIndex(named[2])) return isoOf(fullYear(named[3]), monthIndex(named[2])!, Number(named[1]));
  const named2 = MONTH_NAME_DAY.exec(s);
  if (named2 && monthIndex(named2[1])) return isoOf(Number(named2[3]), monthIndex(named2[1])!, Number(named2[2]));

  const m = new RegExp(NUMERIC_DATE.source).exec(s);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), fullYear(m[3])];
  const dayFirst = isoOf(y, b, a);
  const monthFirst = isoOf(y, a, b);
  if (!dayFirst || !monthFirst) return dayFirst ?? monthFirst;
  if (dayFirst === monthFirst) return dayFirst;

  // Both readings are real dates. The report's own other dates decide first, then the user's order
  // (year-first regions rarely print day and month first; day first is the more common reading).
  const preferred = (context && orderFromText(context)) || (order === 'mdy' ? 'mdy' : 'dmy');
  const [first, second] = preferred === 'mdy' ? [monthFirst, dayFirst] : [dayFirst, monthFirst];
  if (today) {
    const t = localIso(today);
    if (first > t && second <= t) return second;
  }
  return first;
}

/** Shows an ISO date in the user's order with the month as a word, so it can't be misread. */
export function formatDate(iso: string, order: DateOrder): string {
  const [y, m, d] = iso.split('-');
  const mon = MONTHS[Number(m) - 1];
  if (!mon || !d) return iso;
  if (order === 'mdy') return `${mon} ${Number(d)}, ${y}`;
  if (order === 'ymd') return iso;
  return `${Number(d)} ${mon} ${y}`;
}

/** Short form for chart labels: "12 Mar 26", or "Mar 12 26" month first. */
export function shortDateIn(iso: string, order: DateOrder): string {
  const [y, m, d] = iso.split('-');
  const mon = MONTHS[Number(m) - 1] ?? m;
  return order === 'mdy' ? `${mon} ${Number(d)} ${y.slice(2)}` : `${Number(d)} ${mon} ${y.slice(2)}`;
}

/** The pattern the date field takes in this order. */
export const datePattern = (order: DateOrder) => (order === 'mdy' ? 'mm/dd/yyyy' : order === 'ymd' ? 'yyyy-mm-dd' : 'dd/mm/yyyy');

/** An ISO date as the user types it in this order: "12/03/2026", "03/12/2026" or "2026-03-12". */
export function formatDateInput(iso: string, order: DateOrder): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  if (order === 'mdy') return `${m}/${d}/${y}`;
  if (order === 'ymd') return iso;
  return `${d}/${m}/${y}`;
}

/**
 * A date typed in the date field. yyyy-mm-dd always works; otherwise day and month follow the
 * user's order exactly (no guessing: the user typed it). A two-digit year is not accepted.
 */
export function parseDateInput(text: string, order: DateOrder): string | null {
  const t = text.trim();
  const iso = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(t);
  if (iso) return isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return order === 'mdy' ? isoOf(y, a, b) : isoOf(y, b, a);
}

export const DATE_PREF_LABEL: Record<DatePref, string> = {
  auto: 'Automatic, from the phone’s region',
  dmy: 'Day first: 31/12/2026',
  mdy: 'Month first: 12/31/2026',
  ymd: 'Year first: 2026-12-31',
};
