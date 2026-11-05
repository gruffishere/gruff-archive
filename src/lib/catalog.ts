import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';
import { inCirculation } from './collections';
import { chooseMedia } from './media';

export interface Piece {
  slug: string;
  id: string;
  title: string;
  collection: string;
  kind: 'img' | 'iframe';
  src: string;
  /** Larger static webp for the srcset; never an animated original. */
  large: string | null;
  pixelated: boolean;
  weight: number;
}
export interface SizedPiece extends Piece {
  /** Intrinsic proportions of the file that is shown. */
  w: number;
  h: number;
  /** Pixel widths of `src` and `large`, for the srcset. */
  tw: number | null;
  lw: number | null;
}

const PER_GENERATIVE = 5;
const SEED = 0x6772_7566; // "gruf"

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Stable per-piece size weight in [0.6, 1.8]; skewed so a few pieces hang large. */
export const pieceWeight = (slug: string, id: string) => {
  const u = hash(`${slug}/${id}`) / 4294967296;
  return Math.round((0.6 + 1.2 * Math.pow(u, 1.3)) * 1000) / 1000;
};

const idCmp = (a: string, b: string) => {
  try {
    const d = BigInt(a) - BigInt(b);
    return d < 0n ? -1 : d > 0n ? 1 : 0;
  } catch {
    return a.localeCompare(b);
  }
};

function pieceOf(c: CollectionOut, t: TokenOut): Piece | null {
  if (!inCirculation(t)) return null;
  const thumb = chooseMedia(t, 'thumb');
  let kind: Piece['kind'];
  let src: string;
  let large: string | null = null;
  let pixelated = false;
  if (thumb.kind === 'img' && thumb.src) {
    kind = 'img';
    src = thumb.src;
    pixelated = thumb.pixelated;
    const l = t.image?.large;
    if (l && l !== src && /\.(webp|svg)$/i.test(l)) large = l;
  } else {
    const live = chooseMedia(t, 'large');
    if (live.kind !== 'iframe' || !live.src) return null;
    kind = 'iframe';
    src = live.src;
  }
  return { slug: c.slug, id: t.id, title: t.name, collection: c.title, kind, src, large, pixelated, weight: pieceWeight(c.slug, t.id) };
}

/** The wall: every work of the non-generative collections once, five spread pieces of each generative one, mixed by a fixed-seed shuffle. */
export function catalogPieces(collections: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>): Piece[] {
  const all: Piece[] = [];
  for (const c of [...collections].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (c.section !== 'index' && c.section !== 'experiments') continue;
    const ps = [...(tokensBySlug[c.slug] ?? [])]
      .sort((a, b) => idCmp(a.id, b.id))
      .map((t) => pieceOf(c, t))
      .filter((p): p is Piece => !!p);
    if (c.techniques.includes('generative') && ps.length > PER_GENERATIVE) {
      const n = ps.length;
      all.push(...Array.from({ length: PER_GENERATIVE }, (_, i) => ps[Math.floor(((i + 0.5) * n) / PER_GENERATIVE)]!));
    } else all.push(...ps);
  }
  const rnd = mulberry32(SEED);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all;
}

const dims = new Map<string, Promise<{ w: number; h: number } | null>>();
type Reader = (src: string) => Promise<{ w: number; h: number } | null>;
/** Reader of stored media dimensions (read-only) under `root`, cached for the build. */
export function mediaReader(root = 'public'): Reader {
  return (src) => {
    const file = join(root, src.replace(/^\//, ''));
    if (!dims.has(file))
      dims.set(
        file,
        (async () => {
          try {
            const { default: sharp } = await import('sharp');
            const m = await sharp(await readFile(file)).metadata();
            return m.width && m.height ? { w: m.width, h: m.height } : null;
          } catch {
            return null;
          }
        })(),
      );
    return dims.get(file)!;
  };
}

/**
 * Attach proportions. Html works shown live are 1:1; a raster or svg piece whose file cannot be measured is dropped
 * (with one warning) rather than shown as a wrong-shaped crop.
 */
export async function measurePieces(pieces: Piece[], read: Reader = mediaReader()): Promise<SizedPiece[]> {
  const out = await Promise.all(
    pieces.map(async (p): Promise<SizedPiece | null> => {
      if (p.kind === 'iframe') return { ...p, w: 1, h: 1, tw: null, lw: null };
      const [t, l] = await Promise.all([read(p.src), p.large ? read(p.large) : Promise.resolve(null)]);
      if (!t) {
        console.warn(`catalog: dropping ${p.slug}/${p.id}, cannot measure ${p.src}`);
        return null;
      }
      return { ...p, w: t.w, h: t.h, tw: t.w, lw: l?.w ?? null };
    }),
  );
  return out.filter((p): p is SizedPiece => !!p);
}
