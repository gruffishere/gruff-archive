import { buildBalances } from '../ledger';
import type { RawTransfer } from '../types';
import { isKeeperAddress } from './exclusions';

export interface TimelineMonth {
  month: string;
  collections: { code: string; works: number }[];
  holders: number;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - 1).toISOString();
}

export function buildTimeline(i: { artist: string; from: string; to: string; collections: { code: string; transfers: RawTransfer[] }[]; excludeHolders?: Iterable<string> }): TimelineMonth[] {
  const extra = new Set(i.excludeHolders ?? []);
  return monthRange(i.from, i.to).map((month) => {
    const end = monthEnd(month);
    const holders = new Set<string>();
    const collections: TimelineMonth['collections'] = [];
    for (const c of i.collections) {
      let works = 0;
      for (const [, h] of buildBalances(c.transfers, end)) {
        if (h.size > 0) works++;
        for (const a of h.keys()) if (isKeeperAddress(a, i.artist, extra)) holders.add(a);
      }
      if (works > 0) collections.push({ code: c.code, works });
    }
    return { month, collections, holders: holders.size };
  });
}
