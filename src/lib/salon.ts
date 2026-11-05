// Pure salon-wall layout: no DOM. The wall is a stack of bands; a band is a row of blocks across the full width.
// A block is a vertical stack of segments sharing one width; a segment is one piece or a row of 2-3 pieces sharing one height.
export interface SalonItem { w: number; h: number; weight: number }
export interface SalonRect { x: number; y: number; w: number; h: number }
export interface SalonBand { y: number; h: number; count: number; justified: boolean }
export interface SalonResult { rects: SalonRect[]; height: number; bands: SalonBand[] }
const SEED = 0x5a10;
/** A justified band must land within [LO, HI] x the target height; only the last band may instead stay left-aligned at the target. */
const LO = 0.9;
const HI = 1.09;
const WINDOW = 16;
/** Heights the successive whole-wall plans aim for, as a share of the target. */
const AIMS = [1, 0.96, 1.04, 0.98, 1.02, 0.94, 1.06];
/** Pieces left when the last bands are searched together. */
const TAIL = 30;
/** Band searches allowed per plan. */
const CALLS = 60;
/** In-range bands compared per level (the one nearest the aim hangs). */
const PICK = 5;
/** Candidate blocks built per band when the queue is long. */
const POOL_BLOCKS = 36;
/** Search steps allowed while looking for the bands at one level. */
const NODES_PER_BAND = 300;
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
  const maxShare = phone ? 1 : 0.55;
  const rnd = rng(SEED);
  let q = ratios.map((_, i) => i);
  const cat = (i: number) => (ratios[i]! < 0.85 ? 'P' : ratios[i]! < 1.3 ? 'S' : 'L');
  const make = (block: Block, take: number[]): Cand => ({ block, take, ...blockAffine(block, ratios, g) });
  /** One candidate block around `head`; companions come from the first `wl` pieces of `pool`, from a random start. */
  const build = (head: number, pool: number[], wl: number): Cand => {
    const win = pool.slice(0, wl).filter((i) => i !== head);
    const off = win.length ? Math.floor(rnd() * win.length) : 0;
    const pick = (pred: (i: number) => boolean, n: number) => {
      const out: number[] = [];
      for (let k = 0; k < win.length; k++) {
        const i = win[(k + off) % win.length]!;
        if (pred(i) && !out.includes(i)) { out.push(i); if (out.length === n) break; }
      }
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
      let block: Block = rnd() < 0.7 ? [[top], row] : [row, [top]];
      let take = [top, ...row];
      if (ratios[top]! > 2.4 || rnd() < 0.12) {
        // a very wide piece needs more height beside it: a second row
        const row2 = pick((i) => !take.includes(i) && cat(i) !== 'L' && ratios[i]! > 0.6, 2);
        if (row2.length === 2) { block = [[top], row, row2]; take = [...take, ...row2]; }
      }
      return make(block, take);
    };
    const options: Array<[number, () => Cand | null]> = [];
    if (c === 'P') {
      options.push([weights[head]! > 1.3 ? 0.35 : 0.2, single]);
      options.push([0.5, () => stack(2, (i) => ratios[i]! < 1.2)]);
      options.push([0.3, () => stack(3, (i) => ratios[i]! < 1.2)]);
      options.push([0.2, wideRow]);
    } else if (c === 'S') {
      if (ratios[head]! <= 1.1) options.push([weights[head]! > 1.2 ? 0.15 : 0.04, single]);
      options.push([0.3, () => stack(2, (i) => cat(i) !== 'P')]);
      options.push([0.45, () => stack(3, (i) => cat(i) !== 'P')]);
      options.push([0.4, wideRow]);
    } else {
      options.push([0.6, wideRow]);
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
  interface Band { blocks: Cand[]; items: number[]; hj: number }
  const heightOf = (n: number, k: number, kd: number) => (W - (n - 1) * g - kd) / k;
  const lo = Ht * LO;
  const hi = Ht * HI;
  const shuffle = <T,>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
  };
  const widthAtTarget = (c: Cand) => c.k * (Ht + c.d);
  /** Distinct candidate blocks over the front of `pool`; a small pool is covered completely. */
  const candidatesFor = (pool: number[]): Cand[] => {
    const small = pool.length <= 2 * WINDOW;
    const wl = small ? pool.length : WINDOW;
    const seen = new Set<string>();
    const out: Cand[] = [];
    const add = (c: Cand) => {
      const key = [...c.take].sort((x, y) => x - y).join(',');
      if (!seen.has(key)) { seen.add(key); out.push(c); }
    };
    const hw = pool.slice(0, 10).find((i) => cat(i) === 'L') ?? pool[0]!;
    for (let n = 0; n < 16; n++) add(build(hw, pool, wl));
    const rounds = small ? pool.length * 3 : POOL_BLOCKS;
    for (let n = 0; n < rounds; n++) add(build(pool[Math.floor(rnd() * Math.min(pool.length, wl))]!, pool, wl));
    const narrow = out.filter((c) => widthAtTarget(c) <= maxShare * W);
    if (!narrow.some((c) => c.take.includes(pool[0]!))) {
      const mine = out.filter((c) => c.take.includes(pool[0]!)).sort((x, y) => widthAtTarget(x) - widthAtTarget(y))[0];
      if (mine) narrow.push(mine);
    }
    return narrow;
  };
  /** Bands (disjoint blocks, the first holding the oldest piece) whose height lands in range, in random order. */
  function* bandsOf(pool: number[]): Generator<Band> {
    const cands = candidatesFor(pool);
    shuffle(cands);
    // the oldest wide piece (wide ones are the hardest to hang, so they must not pile up at the end), else the oldest piece
    const wide = pool.slice(0, 10).find((i) => cat(i) === 'L');
    const front = pool.length <= 2 * WINDOW ? pool.slice() : [wide ?? pool[0]!];
    const first = cands.filter((c) => c.take.some((t) => front.includes(t)));
    const used = new Set<number>();
    const chosen: Cand[] = [];
    let local = 0;
    const emit = (blocks: Cand[], hj: number): Band => {
      const out = blocks.slice();
      shuffle(out);
      return { blocks: out, items: out.flatMap((c) => c.take), hj };
    };
    // `chosen` is a partial band that is still too tall: first try every single block that finishes it in range, then go deeper
    function* dfs(from: number, sumK: number, sumKD: number, count: number): Generator<Band> {
      const deeper: Array<[number, Cand]> = [];
      for (let i = from; i < cands.length; i++) {
        const c = cands[i]!;
        if (c.take.some((t) => used.has(t))) continue;
        const hj = heightOf(chosen.length + 1, sumK + c.k, sumKD + c.k * c.d);
        if (hj < lo) continue; // overfull
        const covers = count + c.take.length === pool.length;
        if (hj <= hi || covers) yield emit([...chosen, c], hj);
        else deeper.push([i, c]);
      }
      for (const [i, c] of deeper) {
        if (++local > NODES_PER_BAND) return;
        chosen.push(c);
        c.take.forEach((t) => used.add(t));
        yield* dfs(i + 1, sumK + c.k, sumKD + c.k * c.d, count + c.take.length);
        c.take.forEach((t) => used.delete(t));
        chosen.pop();
      }
    }
    for (const f of first) {
      if (local > NODES_PER_BAND) return;
      const hj = heightOf(1, f.k, f.k * f.d);
      if (hj < lo) continue;
      if (hj <= hi || f.take.length === pool.length) { yield emit([f], hj); continue; }
      chosen.push(f);
      f.take.forEach((t) => used.add(t));
      yield* dfs(0, f.k, f.k * f.d, f.take.length);
      f.take.forEach((t) => used.delete(t));
      chosen.pop();
    }
  }

  let calls = 0;
  /** In-range bands for `pool`, nearest the aim first. */
  const options = (pool: number[], aim: number): Band[] => {
    const opts: Band[] = [];
    calls++;
    for (const band of bandsOf(pool)) { opts.push(band); if (opts.length >= PICK) break; }
    return opts.sort((x, y) => Math.abs(Math.log(x.hj / aim)) - Math.abs(Math.log(y.hj / aim)));
  };
  const without = (pool: number[], band: Band) => {
    const taken = new Set(band.items);
    return pool.filter((i) => !taken.has(i));
  };
  /** Depth-first over the last bands: if the rest cannot be hung in range, the band before it is replaced. */
  const solve = (pool: number[], aim: number): Band[] | null => {
    if (!pool.length) return [];
    if (calls >= CALLS) return null;
    for (const band of options(pool, aim)) {
      const more = solve(without(pool, band), aim);
      if (more) return [band, ...more];
      if (calls >= CALLS) return null;
    }
    return null;
  };
  let planned: Band[] | null = null;
  for (let pass = 0; pass < AIMS.length && !planned; pass++) {
    const aim = Ht * AIMS[pass]!;
    const out: Band[] = [];
    let pool = ratios.map((_, i) => i);
    calls = 0;
    while (pool.length > TAIL) {
      const band = options(pool, aim)[0];
      if (!band) break;
      out.push(band);
      pool = without(pool, band);
    }
    if (pool.length > TAIL) continue;
    const tail = solve(pool, aim);
    if (tail) planned = [...out, ...tail];
  }
  if (!planned) {
    // search budget spent: hang the best single-pass bands, front to back
    planned = [];
    let pool = ratios.map((_, i) => i);
    while (pool.length) {
      let best: Band | null = null;
      for (const band of bandsOf(pool)) { best = band; break; }
      if (!best) {
        // nothing lands in range: take the oldest piece's block alone-ish, filled greedily
        const blocks: Cand[] = [];
        const items: number[] = [];
        let sumK = 0;
        let sumKD = 0;
        const rest = pool.slice();
        while (rest.length) {
          const c = build(rest[0]!, rest, WINDOW);
          blocks.push(c);
          sumK += c.k;
          sumKD += c.k * c.d;
          for (const t of c.take) { rest.splice(rest.indexOf(t), 1); items.push(t); }
          if (heightOf(blocks.length, sumK, sumKD) <= Ht) break;
        }
        best = { blocks, items, hj: heightOf(blocks.length, sumK, sumKD) };
      }
      const taken = new Set(best.items);
      planned.push(best);
      pool = pool.filter((i) => !taken.has(i));
    }
  }
  let y = 0;
  planned.forEach((band, bi) => {
    const last = bi === planned.length - 1;
    // only the last band may stay left-aligned (at the target height); every other band is justified
    const justified = !(last && band.hj > Ht * HI);
    const H = justified ? band.hj : Ht;
    let x = 0;
    for (const b of band.blocks) {
      const w = b.k * (H + b.d);
      let by = y;
      for (const seg of b.block) {
        const R = seg.reduce((sum, i) => sum + ratios[i]!, 0);
        const sh = (w - (seg.length - 1) * g) / R;
        let sx = x;
        for (const i of seg) {
          rects[i] = { x: sx, y: by, w: sh * ratios[i]!, h: sh };
          sx += sh * ratios[i]! + g;
        }
        by += sh + g;
      }
      x += w + g;
    }
    bands.push({ y, h: H, count: band.items.length, justified });
    y += H + g;
  });
  return { rects, height: y - g, bands };
}
