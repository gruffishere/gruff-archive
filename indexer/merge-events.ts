import type { ArchiveEvent } from './types';

export const newestFirst = (a: ArchiveEvent, b: ArchiveEvent) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0);

export function mergeEvents(chain: ArchiveEvent[], os: ArchiveEvent[]): ArchiveEvent[] {
  const saleKeys = new Set(os.filter((e) => e.kind === 'sale' && e.txHash).map((e) => `${e.txHash}:${e.tokenId}`));
  const kept = chain.filter((e) => !(e.kind === 'transfer' && saleKeys.has(`${e.txHash}:${e.tokenId}`)));
  const byId = new Map<string, ArchiveEvent>();
  for (const e of [...kept, ...os]) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort(newestFirst);
}
