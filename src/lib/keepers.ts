import type { KeeperOut } from '../../indexer/aggregate/keepers';

export type KeeperSort = 'pieces' | 'works' | 'collections' | 'since';
export const KEEPERS_SHOWN = 300;
const filled = (mask: string) => [...mask].filter((c) => c === '1').length;

/** The minimal shape a keeper row carries, both in the catalog and in the page's data attributes. */
export interface KeeperShape {
  name: string;
  pieces: number;
  works: number;
  collections: number;
  since: string;
}

export const toShape = (k: KeeperOut): KeeperShape => ({
  name: `${k.ens ?? ''} ${k.address}`,
  pieces: k.pieces,
  works: k.works,
  collections: filled(k.mask),
  since: k.firstAcquired ?? '9999',
});

export function compareKeepers(by: KeeperSort): (a: KeeperShape, b: KeeperShape) => number {
  switch (by) {
    case 'works':
      return (a, b) => b.works - a.works || b.pieces - a.pieces;
    case 'collections':
      return (a, b) => b.collections - a.collections || b.pieces - a.pieces;
    case 'since':
      return (a, b) => a.since.localeCompare(b.since);
    default:
      return (a, b) => b.pieces - a.pieces || b.works - a.works;
  }
}

export function matchesKeeper(shape: Pick<KeeperShape, 'name'>, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || shape.name.toLowerCase().includes(s);
}

export function sortKeepers(list: KeeperOut[], by: KeeperSort): KeeperOut[] {
  const cmp = compareKeepers(by);
  return [...list].sort((a, b) => cmp(toShape(a), toShape(b)));
}

export const maskCells = (mask: string) => [...mask].map((c) => c === '1');

/** Strip cells as raw markup (no per-cell attributes keeps 1,944 rows light). Built from the mask only. */
export const stripHtml = (mask: string) => maskCells(mask).map((on) => (on ? '<i class="on"></i>' : '<i></i>')).join('');

export const matchesQuery = (k: KeeperOut, q: string) => matchesKeeper(toShape(k), q);
