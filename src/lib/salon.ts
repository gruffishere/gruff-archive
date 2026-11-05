// Pure salon-wall layout: no DOM. The wall is a stack of bands; a band is a row of blocks across the full width.
// A block is a vertical stack of segments sharing one width; a segment is one piece or a row of 2-3 pieces sharing one height.
export interface SalonItem { w: number; h: number; weight: number }
export interface SalonRect { x: number; y: number; w: number; h: number }
export interface SalonBand { y: number; h: number; count: number; justified: boolean }
export interface SalonResult { rects: SalonRect[]; height: number; bands: SalonBand[] }

const SEED = 0x5a10;
/** Last band may be blown up this much to reach the full width; beyond that it stays left-aligned at the target. */
const MAX_BLOWUP = 1.4;
const CANDIDATES = 40;
const WINDOW = 16;
const ATTEMPTS = 100;

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

type Block = number[][]; // segments of item indexes
interface Cand { block: Block; take: number[]; k: number; d: number }

/** Band height -> block width is affine: w = k * (H + d). */
function blockAffine(block: Block, ratios: number[], g: number) {
  let a = 0;
  let d = -(block.length - 1) * g;
  for (const seg of block) {
    const R = seg.reduce((s, i) => s + ratios[i]!, 0);
    a += 1 / R;
    d += ((seg.length - 1) * g) / R;
  }
  return { k: 1 / a, d };
}

/** Target band height for a container width. */
export function bandTarget(W: number, phone: boolean): number {
  return phone ? Math.min(440, Math.max(360, W * 1.12)) : Math.min(720, Math.max(520, W * 0.44));
}

export function salonLayout(items: SalonItem[], containerWidth: number, gap: number, opts: { viewport?: number } = {}): SalonResult {
  if (!items.length) return { rects: [], height: 0, bands: [] };
  const W = containerWidth;
  const g = gap;
  const vw = opts.viewport ?? W;
  const ratios = items.map((i) => (i.h > 0 && i.w > 0 ? i.w / i.h : 1));
  const weights = items.map((i) => i.weight);
  const rects: SalonRect[] = new Array(items.length);
  const bands: SalonBand[] = [];

  if (vw < 380) {
    let y = 0;
    ratios.forEach((r, i) => {
      const h = W / r;
      rects[i] = { x: 0, y, w: W, h };
      bands.push({ y, h, count: 1, justified: true });
      y += h + g;
    });
    return { rects, height: y - g, bands };
  }

  const phone = vw < 768;
  const Ht = bandTarget(W, phone);
  const maxShare = phone ? 0.85 : 0.4;
  const rnd = rng(SEED);
  let q = ratios.map((_, i) => i);
  const cat = (i: number) => (ratios[i]! < 0.85 ? 'P' : ratios[i]! < 1.3 ? 'S' : 'L');

  const make = (block: Block, take: number[]): Cand => ({ block, take, ...blockAffine(block, ratios, g) });

  /** One candidate block built from a head near the front of the queue. */
  const build = (): Cand => {
    const pos = Math.min(q.length - 1, Math.floor(rnd() * Math.min(8, q.length)));
    const head = q[pos]!;
    const win = q.slice(0, WINDOW).filter((i) => i !== head);
    const pick = (pred: (i: number) => boolean, n: number, from = win) => {
      const out: number[] = [];
      for (const i of from) if (pred(i) && !out.includes(i)) { out.push(i); if (out.length === n) break; }
      return out;
    };
    const c = cat(head);
    const single = () => make([[head]], [head]);
    const stack = (n: number, pred: (i: number) => boolean) => {
      const more = pick(pred, n - 1);
      return more.length === n - 1 ? make([[head], ...more.map((i) => [i])], [head, ...more]) : null;
    };
    const wideRow = () => {
      const top = c === 'L' ? head : pick((i) => cat(i) === 'L', 1)[0];
      if (top === undefined) return null;
      const rowHead = top === head ? [] : [head];
      const need = (rnd() < 0.55 ? 3 : 2) - rowHead.length;
      const rest = pick((i) => i !== top && cat(i) !== 'L' && ratios[i]! > 0.6, need);
      if (rest.length < need) return null;
      const row = [...rowHead, ...rest];
      const block: Block = rnd() < 0.7 ? [[top], row] : [row, [top]];
      return make(block, [top, ...row]);
    };
    const options: Array<[number, () => Cand | null]> = [];
    if (c === 'P') {
      options.push([weights[head]! > 1.3 ? 0.5 : 0.3, single]);
      options.push([0.5, () => stack(2, (i) => ratios[i]! < 1.2)]);
      options.push([0.1, wideRow]);
    } else if (c === 'S') {
      if (ratios[head]! <= 1.1) options.push([weights[head]! > 1.2 ? 0.3 : 0.1, single]);
      options.push([0.3, () => stack(2, (i) => cat(i) !== 'P')]);
      options.push([0.3, () => stack(3, (i) => cat(i) !== 'P')]);
      options.push([0.3, wideRow]);
    } else {
      options.push([0.45, wideRow]);
      options.push([0.25, () => stack(2, (i) => cat(i) !== 'P')]);
      options.push([0.2, () => stack(3, (i) => cat(i) === 'S')]);
    }
    let total = options.reduce((s, o) => s + o[0], 0);
    while (options.length) {
      let r = rnd() * total;
      let oi = options.findIndex((o) => (r -= o[0]) < 0);
      if (oi < 0) oi = options.length - 1;
      const res = options[oi]![1]();
      if (res) return res;
      total -= options[oi]![0];
      options.splice(oi, 1);
    }
    return single();
  };

  const fill = () => {
    const blocks: Cand[] = [];
    let sumK = 0;
    let sumKD = 0;
    for (;;) {
      let cands = Array.from({ length: CANDIDATES }, build);
      const narrow = cands.filter((c) => c.k * (Ht + c.d) <= maxShare * W);
      cands = narrow.length ? narrow : [cands.reduce((a, b) => (a.k * (Ht + a.d) <= b.k * (Ht + b.d) ? a : b))];
      const after = (c: Cand) => heightOf(blocks.length + 1, sumK + c.k, sumKD + c.k * c.d);
      let chosen: Cand | null = cands[0]!;
      if (blocks.length && cands.some((c) => after(c) <= Ht)) {
        // the band is about to fill: take whichever outcome lands nearest the target, or stop as it is
        const now = heightOf(blocks.length, sumK, sumKD);
        let bestScore = now <= Ht * 1.1 ? Math.abs(Math.log(now / Ht)) : Infinity;
        chosen = cands[0]!;
        if (bestScore < Infinity) chosen = null;
        for (const c of cands) {
          const s = Math.abs(Math.log(after(c) / Ht));
          if (s < bestScore) { bestScore = s; chosen = c; }
        }
      }
      if (!chosen) break;
      blocks.push(chosen);
      sumK += chosen.k;
      sumKD += chosen.k * chosen.d;
      for (const i of chosen.take) q.splice(q.indexOf(i), 1);
      if (!q.length) break;
    }
    return { blocks, sumK, sumKD };
  };
  const heightOf = (n: number, k: number, kd: number) => (W - (n - 1) * g - kd) / k;

  let y = 0;
  while (q.length) {
    // a band is built several times from the same start; the one that lands nearest the target height hangs
    const start = q.slice();
    let best: ReturnType<typeof fill> | null = null;
    let bestQ: number[] = [];
    let bestScore = Infinity;
    for (let t = 0; t < ATTEMPTS; t++) {
      q = start.slice();
      // later attempts see the next pieces in a slightly different order
      for (let k = 0; k < Math.min(t, 10); k++) {
        const a = Math.floor(rnd() * Math.min(8, q.length));
        const b = Math.floor(rnd() * Math.min(16, q.length));
        [q[a], q[b]] = [q[b]!, q[a]!];
      }
      const r = fill();
      const hj = heightOf(r.blocks.length, r.sumK, r.sumKD);
      const sc = q.length === 0 && hj > Ht * MAX_BLOWUP ? 0.3 : Math.abs(Math.log(hj / Ht));
      if (sc < bestScore - 1e-9) { bestScore = sc; best = r; bestQ = q; }
      if (sc < 0.02) break;
    }
    q = bestQ;
    const { blocks, sumK, sumKD } = best!;
    const Hj = heightOf(blocks.length, sumK, sumKD);
    const justified = Hj <= Ht * MAX_BLOWUP;
    const H = justified ? Hj : Ht;
    let x = 0;
    let count = 0;
    for (const b of blocks) {
      const w = b.k * (H + b.d);
      let by = y;
      b.block.forEach((seg, si) => {
        const R = seg.reduce((s, i) => s + ratios[i]!, 0);
        const sh = (w - (seg.length - 1) * g) / R;
        let sx = x;
        for (const i of seg) {
          rects[i] = { x: sx, y: by, w: sh * ratios[i]!, h: sh };
          sx += sh * ratios[i]! + g;
          count++;
        }
        by += sh + g;
        void si;
      });
      x += w + g;
    }
    bands.push({ y, h: H, count, justified });
    y += H + g;
  }
  return { rects, height: y - g, bands };
}
