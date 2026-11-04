import { ZERO } from './ledger';
import { compareChrono } from './sync-transfers';
import type { MintInfo, RawTransfer } from './types';

export async function mintInfo(
  transfers: RawTransfer[],
  getTxValue: (txHash: string) => Promise<string>,
  maxLookupsPerToken = 5,
): Promise<Map<string, MintInfo>> {
  const allMints = transfers.filter((t) => t.from === ZERO);
  const mints = allMints.filter((t) => BigInt(t.value) > 0n);
  const unitsByTx = new Map<string, bigint>();
  const byToken = new Map<string, RawTransfer[]>();
  for (const m of mints) {
    unitsByTx.set(m.txHash, (unitsByTx.get(m.txHash) ?? 0n) + BigInt(m.value));
    const list = byToken.get(m.tokenId) ?? [];
    list.push(m);
    byToken.set(m.tokenId, list);
  }

  const out = new Map<string, MintInfo>();
  for (const [tokenId, list] of byToken) {
    list.sort(compareChrono);
    let priceWei: string | null = null;
    const seenTx = new Set<string>();
    for (const m of list) {
      if (seenTx.has(m.txHash)) continue;
      if (seenTx.size >= maxLookupsPerToken) break;
      seenTx.add(m.txHash);
      const value = BigInt(await getTxValue(m.txHash));
      const units = unitsByTx.get(m.txHash) ?? 0n;
      if (value > 0n && units > 0n) {
        priceWei = (value / units).toString();
        break;
      }
    }
    out.set(tokenId, { at: list[0].timestamp, txHash: list[0].txHash, priceWei, primary: false });
  }
  // Tokens that only ever had zero-value mints (e.g. Manifold "mint 0"): dated by that creation mint, never priced.
  for (const m of allMints.sort(compareChrono)) {
    if (!out.has(m.tokenId)) out.set(m.tokenId, { at: m.timestamp, txHash: m.txHash, priceWei: null, primary: false });
  }
  return out;
}
