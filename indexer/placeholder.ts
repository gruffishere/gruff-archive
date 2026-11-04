import type { TokenMeta } from './types';

const MIN_TOKENS = 10;
const SHARE = 0.5;

function findShared(metas: Map<string, TokenMeta>, field: 'image' | 'animation'): Set<string> {
  const out = new Set<string>();
  if (metas.size < MIN_TOKENS) return out;
  const counts = new Map<string, number>();
  for (const m of metas.values()) {
    const src = m[field];
    if (src) counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  for (const [src, n] of counts) if (n >= metas.size * SHARE) out.add(src);
  return out;
}

/** Image sources shared by at least half the tokens of a collection with >= 10 tokens: stale or placeholder art. */
export const findPlaceholderImages = (metas: Map<string, TokenMeta>): Set<string> => findShared(metas, 'image');

/** Same check for animation sources. */
export const findPlaceholderAnimations = (metas: Map<string, TokenMeta>): Set<string> => findShared(metas, 'animation');

/** Nulls placeholder images and animations in place; returns the affected token count, ids and the placeholder source urls. */
export function stripPlaceholders(metas: Map<string, TokenMeta>): { count: number; ids: Set<string>; sources: Set<string> } {
  const images = findPlaceholderImages(metas);
  const animations = findPlaceholderAnimations(metas);
  const ids = new Set<string>();
  const sources = new Set<string>([...images, ...animations]);
  for (const [id, m] of metas) {
    if (m.image && images.has(m.image)) {
      m.image = null;
      ids.add(id);
    }
    if (m.animation && animations.has(m.animation)) {
      m.animation = null;
      ids.add(id);
    }
  }
  return { count: ids.size, ids, sources };
}
