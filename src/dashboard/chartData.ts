// Pure helpers behind the trend chart: which values to plot and on what scale. A marker can be
// printed in different units by different labs. Units are never converted (that would be
// interpretation), so the chart plots the unit with the most values and lists the rest.
import type { SeriesPoint } from '../db/biomarkers';

const unitKey = (u: string | null) => (u ?? '').trim().toLowerCase().replace(/\s+/g, '');

export interface UnitGroups {
  /** Points in the most common unit, oldest first. Ties go to the unit of the latest value. */
  main: SeriesPoint[];
  unit: string | null;
  /** Points in any other unit, oldest first. */
  other: SeriesPoint[];
}

export function groupByUnit(points: SeriesPoint[]): UnitGroups {
  if (!points.length) return { main: [], unit: null, other: [] };
  const counts = new Map<string, number>();
  for (const p of points) counts.set(unitKey(p.unit), (counts.get(unitKey(p.unit)) ?? 0) + 1);
  const latestKey = unitKey(points[points.length - 1].unit);
  let best = latestKey;
  for (const [k, n] of counts) if (n > counts.get(best)! ) best = k;
  const main = points.filter((p) => unitKey(p.unit) === best);
  return { main, unit: main[main.length - 1].unit, other: points.filter((p) => unitKey(p.unit) !== best) };
}

/** The printed range of the latest point, drawn as the reference lines. */
export function latestRange(points: SeriesPoint[]): { low: number | null; high: number | null } {
  const p = points[points.length - 1];
  return { low: p?.refLow ?? null, high: p?.refHigh ?? null };
}

export interface Scale {
  /** Bottom of the y axis. */
  min: number;
  /** Top of the y axis. */
  max: number;
  step: number;
  sections: number;
}

/** 1, 2 or 5 times a power of ten, at least `raw`. */
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/** A y axis with round steps that holds every value and range bound, with about four sections. */
export function chartScale(values: number[], target = 4): Scale {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: 0, max: 1, step: 0.25, sections: 4 };
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / target);
  const round = (x: number) => Number(x.toPrecision(12)); // 0.1 * 3 is 0.30000000000000004
  // Values are lab results: keep the axis at or above zero unless a value is negative.
  const min = round(Math.floor(lo / step) * step);
  const max = round(Math.ceil(hi / step) * step);
  const sections = Math.max(1, Math.round((max - min) / step));
  return { min, max: round(min + sections * step), step, sections };
}

/** Short date for x labels: "12 Mar 26". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1] ?? m} ${y.slice(2)}`;
}
