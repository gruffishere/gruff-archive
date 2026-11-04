import type { RawTransfer } from './types';

export const transferKey = (t: RawTransfer) => `${t.txHash}:${t.logIndex}:${t.tokenId}`;

export const compareChrono = (a: RawTransfer, b: RawTransfer) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

/**
 * Blockscout returns transfers newest first. We pull until we have seen
 * `stopAfterKnown` consecutive transfers that are already stored.
 */
export async function syncTransfers(
  existing: RawTransfer[],
  newestFirst: AsyncIterable<RawTransfer>,
  stopAfterKnown = 50,
): Promise<{ transfers: RawTransfer[]; added: number }> {
  const known = new Set(existing.map(transferKey));
  const fresh: RawTransfer[] = [];
  let knownInARow = 0;
  for await (const t of newestFirst) {
    const key = transferKey(t);
    if (known.has(key)) {
      if (++knownInARow >= stopAfterKnown) break;
      continue;
    }
    knownInARow = 0;
    known.add(key);
    fresh.push(t);
  }
  return { transfers: [...existing, ...fresh].sort(compareChrono), added: fresh.length };
}
