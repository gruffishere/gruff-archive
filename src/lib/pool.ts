// The catalog pool and the per-visit draw. Pure and client-safe (no node imports): the page build writes the pool as
// JSON, the browser draws a wall from it.
export interface PoolItem {
  slug: string;
  id: string;
  title: string;
  collection: string;
  /** From a generative collection: the wall holds only a few of these per visit. */
  generative: boolean;
  kind: 'img' | 'iframe';
  /** The static thumb for `img`, the live page for `iframe`. */
  src: string;
  /** Larger static webp for the srcset. */
  large: string | null;
  tw: number | null;
  lw: number | null;
  /** Proportions of the shown file. */
  w: number;
  h: number;
  pixelated: boolean;
  /** What plays on hover or keyboard focus; never loaded before then. */
  hover: { type: 'gif' | 'video'; src: string } | null;
  weight: number;
  href: string;
}

export const PER_GENERATIVE = 5;
export const WALL_SIZE = 80;

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: readonly T[], rnd: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * One visit's wall: `perGenerative` random pieces of every generative collection, a random sample of the other
 * works so that the wall holds about `total` pieces (all of them when fewer exist), in random order. Same seed, same wall.
 */
export function drawWall(pool: readonly PoolItem[], seed: number, opts: { perGenerative?: number; total?: number } = {}): PoolItem[] {
  const perGen = opts.perGenerative ?? PER_GENERATIVE;
  const total = opts.total ?? WALL_SIZE;
  const rnd = mulberry32(seed);
  const gen = new Map<string, PoolItem[]>();
  const rest: PoolItem[] = [];
  for (const p of pool) {
    if (!p.generative) rest.push(p);
    else (gen.get(p.slug) ?? gen.set(p.slug, []).get(p.slug)!).push(p);
  }
  const drawn: PoolItem[] = [];
  for (const slug of [...gen.keys()].sort()) drawn.push(...shuffled(gen.get(slug)!, rnd).slice(0, perGen));
  drawn.push(...shuffled(rest, rnd).slice(0, Math.max(0, total - drawn.length)));
  return shuffled(drawn, rnd);
}
