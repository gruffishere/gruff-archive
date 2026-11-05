import type { TimelineMonth } from '../../indexer/aggregate/timeline';

export interface ArchiveState { month: string; works: Record<string, number>; holders: number }

export function archiveAt(timeline: TimelineMonth[], month: string): ArchiveState {
  let found: TimelineMonth | undefined;
  for (const t of timeline) if (t.month <= month) found = t;
  if (!found) return { month, works: {}, holders: 0 };
  return { month, works: Object.fromEntries(found.collections.map((c) => [c.code, c.works])), holders: found.holders };
}

/** A room (not in the on-chain timeline) is on the wall from its `since` month on. Both are YYYY-MM. */
export const roomVisibleAt = (since: string, month: string) => month >= since;
export const monthLabel = (month: string) => `${month.slice(5, 7)}.${month.slice(0, 4)}`;
