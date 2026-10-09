// The PDF summary (PLAN.md Phase 8): one profile's recorded values as plain HTML for expo-print.
// Self-contained (no fonts, images or scripts to fetch) and every user-entered string is escaped.
// It lists values, dates, labs and printed ranges only, with the not-a-medical-device notice.
import { getSeries, listMarkers, type SeriesPoint } from '../db/biomarkers';
import { formatDate, type DateOrder } from '../utils/dates';
import type { Db } from '../db/types';
import { panelOf, PANEL_ORDER } from '../utils/panels';

export interface SummaryMarker {
  key: string;
  points: SeriesPoint[];
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function loadSummary(db: Db, profileId: number): Promise<SummaryMarker[]> {
  const out: SummaryMarker[] = [];
  for (const m of await listMarkers(db, profileId)) out.push({ key: m.key, points: await getSeries(db, profileId, m.key) });
  return out;
}

export function summaryHtml(profileName: string, markers: SummaryMarker[], disclaimer: string, now = new Date(), order: DateOrder = 'ymd'): string {
  const e = escapeHtml;
  const byPanel = new Map<string, SummaryMarker[]>();
  for (const m of markers) byPanel.set(panelOf(m.key), [...(byPanel.get(panelOf(m.key)) ?? []), m]);

  const sections = PANEL_ORDER.filter((p) => byPanel.has(p))
    .map((panel) => {
      const tables = byPanel
        .get(panel)!
        .map((m) => {
          const rows = [...m.points]
            .reverse()
            .map(
              (p) =>
                `<tr><td>${e(formatDate(p.date, order))}</td><td class="num">${e(String(p.valueText ?? p.value))}</td><td>${e(p.unit ?? '')}</td>` +
                `<td>${e(p.rawRefText ?? '')}</td><td>${e(p.labName ?? '')}</td></tr>`,
            )
            .join('');
          return `<h3>${e(m.key)}</h3><table><thead><tr><th>Date</th><th>Value</th><th>Unit</th><th>Printed range</th><th>Lab</th></tr></thead><tbody>${rows}</tbody></table>`;
        })
        .join('');
      return `<h2>${e(panel)}</h2>${tables}`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(profileName)}</title><style>
body{font-family:sans-serif;font-size:11px;color:#111;margin:24px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 4px;border-bottom:1px solid #999}
h3{font-size:12px;margin:10px 0 2px}table{border-collapse:collapse;width:100%;page-break-inside:avoid}
th,td{border:1px solid #ccc;padding:3px 5px;text-align:left}th{background:#f2f2f2}.num{text-align:right}
.meta,.note{color:#555}.note{margin-top:20px}
</style></head><body>
<h1>${e(profileName)}: recorded lab values</h1>
<div class="meta">Made with LabTrends on ${e(formatDate(now.toISOString().slice(0, 10), order))}. Values as entered and verified by the user.</div>
${sections || '<p>No values recorded.</p>'}
<p class="note">${e(disclaimer)}</p>
</body></html>`;
}
