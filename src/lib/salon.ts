// Pure salon-wall layout: no DOM. Rectangles of many sizes hang on one wall with an even gap.
export interface SalonItem { w: number; h: number; weight: number }
export interface SalonRect { x: number; y: number; w: number; h: number }
export interface SalonResult { rects: SalonRect[]; height: number }

const EPS = 1e-6;
const TRIALS = 24;
/** Widest a piece may be, as a share of the wall. */
/** Smallest reference tile, so tablet widths hang fewer, larger pieces. */
const MIN_REF = 120;
const MAX_SHARE = 0.5;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Seg { x: number; w: number; y: number }
interface Sized { ratio: number; w: number; h: number }

/** One skyline pass. Padded boxes (piece + gap) are packed so the gap stays even everywhere. */
function pack(sized: Sized[], W: number, gap: number, trial: number) {
  const noise = trial === 0 ? () => 0 : rng(1000 + trial);
  const noiseAmp = trial === 0 ? 0 : 0.25;
  const placed: SalonRect[] = new Array(sized.length);
  const left = sized.map((_, i) => i);
  const PW = W + gap;
  let segs: Seg[] = [{ x: 0, w: PW, y: 0 }];
  let lastH = -1;

  while (left.length) {
    // lowest segment, leftmost on ties
    let si = 0;
    for (let i = 1; i < segs.length; i++) if (segs[i]!.y < segs[si]!.y - EPS) si = i;
    const seg = segs[si]!;
    const minPad = Math.min(...left.map((i) => sized[i]!.w + gap)) * 0.9;

    let best = -1;
    let bestCost = Infinity;
    let bestW = 0;
    left.forEach((idx, pos) => {
      const it = sized[idx]!;
      const pw = it.w + gap;
      let w = it.w;
      let cost: number;
      const f = seg.w / pw;
      if (f >= 0.93 && f <= 1.12) {
        // close enough: stretch or shrink the piece to close the segment exactly
        w = seg.w - gap;
        cost = 0.4 * Math.abs(f - 1);
      } else if (pw < seg.w) {
        const rest = seg.w - pw;
        cost = rest < minPad ? 1.5 : 0.1 + 0.15 * (rest / seg.w);
      } else return;
      if (w > W) return;
      const h = w / it.ratio;
      if (lastH > 0 && Math.abs(h - lastH) / lastH < 0.04) cost += 0.35;
      cost += 0.012 * pos + noiseAmp * noise();
      if (cost < bestCost) { bestCost = cost; best = idx; bestW = w; }
    });

    if (best < 0) {
      // nothing fits this notch: level it up to its lower neighbour
      const l = segs[si - 1], r = segs[si + 1];
      const target = Math.min(l ? l.y : Infinity, r ? r.y : Infinity);
      seg.y = target === Infinity ? seg.y + 1 : target;
      segs = mergeSegs(segs);
      continue;
    }
    const it = sized[best]!;
    const w = bestW;
    const h = w / it.ratio;
    placed[best] = { x: seg.x, y: seg.y, w, h };
    lastH = h;
    const pw = w + gap;
    const next: Seg[] = [{ x: seg.x, w: pw, y: seg.y + h + gap }];
    if (seg.w - pw > EPS) next.push({ x: seg.x + pw, w: seg.w - pw, y: seg.y });
    segs = mergeSegs([...segs.slice(0, si), ...next, ...segs.slice(si + 1)]);
    left.splice(left.indexOf(best), 1);
  }
  const maxY = Math.max(...segs.map((s) => s.y));
  return { rects: placed, height: Math.max(0, maxY - gap) };
}

function mergeSegs(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    const p = out[out.length - 1];
    if (p && Math.abs(p.y - s.y) < EPS) p.w += s.w;
    else out.push({ ...s });
  }
  return out;
}

/**
 * Hang `items` (aspect from w/h, area from weight) on a wall `containerWidth` wide.
 * Wide walls get a skyline hang; < 768 px two masonry columns; < 380 px one column.
 * `opts.viewport` lets the caller pick the mode from the window rather than from the container.
 */
export function salonLayout(items: SalonItem[], containerWidth: number, gap: number, opts: { viewport?: number } = {}): SalonResult {
  if (!items.length) return { rects: [], height: 0 };
  const W = containerWidth;
  const vw = opts.viewport ?? W;
  const ratios = items.map((i) => (i.h > 0 && i.w > 0 ? i.w / i.h : 1));

  if (vw < 768) {
    const cols = vw < 380 ? 1 : 2;
    const colW = (W - gap * (cols - 1)) / cols;
    const ys = new Array<number>(cols).fill(0);
    const rects = ratios.map((r) => {
      let c = 0;
      for (let i = 1; i < cols; i++) if (ys[i]! < ys[c]! - EPS) c = i;
      const h = colW / r;
      const rect = { x: c * (colW + gap), y: ys[c]!, w: colW, h };
      ys[c]! += h + gap;
      return rect;
    });
    return { rects, height: Math.max(...ys) - gap };
  }

  // reference tile: about six across; a piece's area is weight * ref^2
  const ref = Math.max(MIN_REF, (W - gap * 6) / 7);
  const sized: Sized[] = items.map((it, i) => {
    const r = ratios[i]!;
    let w = Math.sqrt(it.weight * ref * ref * r);
    w = Math.min(w, W * MAX_SHARE);
    // keep very tall pieces from towering over their neighbours
    if (w / r > ref * 2.6) w = ref * 2.6 * r;
    return { ratio: r, w, h: w / r };
  });

  let best: ReturnType<typeof pack> | null = null;
  let bestWaste = Infinity;
  for (let t = 0; t < TRIALS; t++) {
    const res = pack(sized, W, gap, t);
    // wasted wall area: everything under the final skyline that is not a piece
    const used = res.rects.reduce((s, r) => s + (r.w + gap) * (r.h + gap), 0);
    const waste = W * (res.height + gap) + gap * (res.height + gap) - used;
    if (waste < bestWaste - EPS) { bestWaste = waste; best = res; }
  }
  return best!;
}
