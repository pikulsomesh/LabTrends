// ML Kit returns text in column-wise reading order, so a table row's name, value, unit and
// range arrive as separate lines. This rebuilds visual rows from the line bounding boxes.
export interface OcrLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function rebuildRows(lines: OcrLine[]): string {
  const items = lines
    .filter((l) => l.text.trim())
    .map((l) => ({ ...l, cy: l.top + l.height / 2, right: l.left + l.width }));
  if (!items.length) return '';

  const heights = items.map((l) => l.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];

  items.sort((a, b) => a.cy - b.cy);
  const rows: (typeof items)[] = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    const rowCy = row ? row.reduce((s, r) => s + r.cy, 0) / row.length : 0;
    if (row && Math.abs(it.cy - rowCy) <= medianH * 0.5) row.push(it);
    else rows.push([it]);
  }

  return rows
    .map((row) => {
      row.sort((a, b) => a.left - b.left);
      let out = row[0].text.trim();
      for (let i = 1; i < row.length; i++) {
        const gap = row[i].left - row[i - 1].right;
        out += (gap > medianH * 0.6 ? '  ' : ' ') + row[i].text.trim();
      }
      return out;
    })
    .join('\n');
}
