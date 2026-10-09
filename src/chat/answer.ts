// Data-only chat, step 3 and 4 (PLAN.md Phase 7): one fixed query per intent, scoped to the active
// profile, answered from templates. Answers state recorded values, dates and printed ranges only.
// They never say whether a value is good, bad, normal, high or low (CLAUDE.md guardrail 4).
import { formatValue, getSeries, listMarkers, type SeriesPoint } from '../db/biomarkers';
import type { Db } from '../db/types';
import { panelOf, PANEL_ORDER } from '../utils/panels';
import type { Intent, Question } from './intent';

export interface Answer {
  text: string;
  /** Marker to draw inline, with its values oldest first. */
  chart?: { key: string; points: SeriesPoint[] };
}

export const OUT_OF_SCOPE_REPLY =
  'I can only show your recorded data. I can’t explain what results mean or suggest what to do. Please ask a clinician.';

export const HELP_REPLY =
  'Ask about your saved values, for example: “ALT trend”, “latest hemoglobin”, “compare HbA1c”, ' +
  '“TSH reference range”, or “list my tests”.';

const NO_MARKER_REPLY = 'I couldn’t find a test name in that. Try “ALT trend” or “latest hemoglobin”, or ask “list my tests”.';

/** Shows an ISO date the way the user reads dates. Answers use ISO when none is given. */
export type DateShower = (iso: string) => string;

const fmt = formatValue;
const printed = (p: SeriesPoint) => (p.rawRefText ? ` Printed range: ${p.rawRefText}.` : '');
const hasNumber = (p: SeriesPoint) => p.value != null && p.valueText == null;
/** A chart only when there is a number to plot; results printed as words are listed in the text. */
const chartOf = (key: string, points: SeriesPoint[]) => (points.some(hasNumber) ? { chart: { key, points } } : {});

function round(n: number) {
  return Number(n.toPrecision(10));
}

async function forMarker(db: Db, profileId: number, key: string, intent: Intent, showDate: DateShower): Promise<Answer> {
  const at = (p: SeriesPoint) => `on ${showDate(p.date)}${p.labName ? ` (${p.labName})` : ''}`;
  const points = await getSeries(db, profileId, key);
  if (!points.length) return { text: `No ${key} values are saved for this profile yet.` };
  const latest = points[points.length - 1];

  switch (intent) {
    case 'latest':
      return { text: `Your latest ${key} is ${fmt(latest)} ${at(latest)}.${printed(latest)}` };

    case 'range': {
      const text = latest.rawRefText
        ? `The range printed with your latest ${key} (${showDate(latest.date)}) is ${latest.rawRefText}${latest.unit ? ` ${latest.unit}` : ''}.`
        : `No range was printed with your latest ${key} (${showDate(latest.date)}).`;
      return { text };
    }

    case 'compare': {
      if (points.length < 2) return { text: `Only one ${key} value is saved: ${fmt(latest)} ${at(latest)}.` };
      const prev = points[points.length - 2];
      const sameUnit = (prev.unit ?? '') === (latest.unit ?? '');
      let diff = '';
      if (!hasNumber(prev) || !hasNumber(latest)) diff = '';
      else if (!sameUnit) diff = ' The two values use different units, so no difference is shown.';
      else {
        const d = round(latest.value! - prev.value!);
        diff = ` Difference: ${d >= 0 ? '+' : ''}${d}${latest.unit ? ` ${latest.unit}` : ''}.`;
      }
      return {
        text: `${key} was ${fmt(prev)} ${at(prev)} and ${fmt(latest)} ${at(latest)}.${diff}`,
        ...chartOf(key, points),
      };
    }

    case 'trend':
    case 'list': {
      const first = points[0];
      let text =
        points.length === 1
          ? `One ${key} value is saved: ${fmt(latest)} ${at(latest)}.${printed(latest)}`
          : `${points.length} ${key} values from ${showDate(first.date)} to ${showDate(latest.date)}. Latest: ${fmt(latest)} ${at(latest)}.${printed(latest)}`;
      // Results printed as words have no chart line, so the answer lists them, newest first.
      const words = points.filter((p) => !hasNumber(p));
      if (points.length > 1 && words.length) {
        const shown = [...words].reverse().slice(0, 8);
        text += ` Recorded as text: ${shown.map((p) => `${fmt(p)} (${showDate(p.date)})`).join(', ')}${words.length > shown.length ? ', and earlier' : ''}.`;
      }
      return { text, ...chartOf(key, points) };
    }
  }
}

export async function answer(db: Db, profileId: number, q: Question, showDate: DateShower = (iso) => iso): Promise<Answer[]> {
  if (q.kind === 'help') return [{ text: HELP_REPLY }];
  if (q.kind === 'out-of-scope') return [{ text: OUT_OF_SCOPE_REPLY }];

  if (q.intent === 'list' && !q.markers.length) {
    const markers = await listMarkers(db, profileId);
    if (!markers.length) return [{ text: 'No values are saved for this profile yet. Add a report first.' }];
    const groups = new Map<string, string[]>();
    for (const m of markers) {
      const panel = panelOf(m.key);
      groups.set(panel, [...(groups.get(panel) ?? []), `${m.key} (${m.count})`]);
    }
    const lines = PANEL_ORDER.filter((p) => groups.has(p)).map((p) => `${p}: ${groups.get(p)!.join(', ')}`);
    return [{ text: `Saved tests, with the number of values:\n${lines.join('\n')}` }];
  }

  if (!q.markers.length) return [{ text: NO_MARKER_REPLY }];
  const out: Answer[] = [];
  for (const key of q.markers.slice(0, 3)) out.push(await forMarker(db, profileId, key, q.intent, showDate));
  return out;
}
