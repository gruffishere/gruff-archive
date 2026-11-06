import { continuousLine } from './techniques';

/** Values map into a 0..100 plot with a small inset, so a line at 0% or 100% is never clipped by the frame. */
export const PLOT_TOP = 3;
export const PLOT_SPAN = 94;
/** The y of value `v` (0..100) for line `k` of four; the tiny per-line offset keeps equal lines side by side. */
export const yOf = (v: number, k: number) => PLOT_TOP + ((100 - v) * PLOT_SPAN) / 100 + (k - 1.5) * 1.1;
const f = (n: number) => +n.toFixed(2);

type Pt = { x: number; y: number };

/** Fritsch–Carlson tangents: a monotone cubic never swings past a real value, so no line dips below 0 or above 100. */
function tangents(pts: Pt[]): number[] {
  const d: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) d.push(pts[i + 1]!.y - pts[i]!.y);
  const m: number[] = pts.map((_, i) => {
    if (i === 0) return d[0] ?? 0;
    if (i === pts.length - 1) return d[i - 1] ?? 0;
    const before = d[i - 1] ?? 0;
    const after = d[i] ?? 0;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  for (let i = 0; i < d.length; i++) {
    const dk = d[i] ?? 0;
    if (dk === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] ?? 0) / dk;
    const b = (m[i + 1] ?? 0) / dk;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * dk;
      m[i + 1] = t * b * dk;
    }
  }
  return m;
}

/**
 * One technique as one smooth SVG path in a `quarters × 100` viewBox: points at quarter centres, the line in one piece
 * where `continuousLine` keeps it, a lone point as a short tick.
 */
export function smoothPath(values: (number | null)[], k: number): string {
  const line = continuousLine(values);
  const runs: Pt[][] = [];
  line.forEach((v, i) => {
    if (v === null) return;
    const p = { x: i + 0.5, y: yOf(v, k) };
    if (line[i - 1] == null) runs.push([p]);
    else runs[runs.length - 1]!.push(p);
  });
  return runs
    .map((pts) => {
      const first = pts[0]!;
      if (pts.length === 1) return `M${f(first.x - 0.3)} ${f(first.y)} L${f(first.x + 0.3)} ${f(first.y)}`;
      const m = tangents(pts);
      let path = `M${f(first.x)} ${f(first.y)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i]!;
        const q = pts[i + 1]!;
        path += ` C${f(p.x + 1 / 3)} ${f(p.y + (m[i] ?? 0) / 3)} ${f(q.x - 1 / 3)} ${f(q.y - (m[i + 1] ?? 0) / 3)} ${f(q.x)} ${f(q.y)}`;
      }
      return path;
    })
    .join(' ');
}
