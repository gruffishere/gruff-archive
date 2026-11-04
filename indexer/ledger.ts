import type { Address, ArchiveEvent, RawTransfer } from './types';

export const ZERO = '0x0000000000000000000000000000000000000000';
export const DEAD = '0x000000000000000000000000000000000000dead';

export type Balances = Map<string, Map<Address, bigint>>;

const isBurnTarget = (a: Address) => a === ZERO || a === DEAD;

export function buildBalances(transfers: RawTransfer[], until?: string): Balances {
  const balances: Balances = new Map();
  for (const t of transfers) {
    if (until && t.timestamp > until) break;
    const v = BigInt(t.value);
    let holders = balances.get(t.tokenId);
    if (!holders) balances.set(t.tokenId, (holders = new Map()));
    if (v === 0n) continue; // zero-value transfers (e.g. Manifold "mint 0") move nothing; the token id stays known
    if (t.from !== ZERO) {
      const left = (holders.get(t.from) ?? 0n) - v;
      if (left > 0n) holders.set(t.from, left);
      else holders.delete(t.from);
    }
    if (!isBurnTarget(t.to)) holders.set(t.to, (holders.get(t.to) ?? 0n) + v);
  }
  return balances;
}

export function chainEvents(transfers: RawTransfer[]): ArchiveEvent[] {
  const out = new Map<string, ArchiveEvent>();
  for (const t of transfers) {
    if (BigInt(t.value) === 0n) continue;
    const qty = Number(t.value);
    if (t.from === ZERO) {
      const id = `${t.txHash}:${t.tokenId}:${t.to}:mint`;
      const prev = out.get(id);
      if (prev) {
        prev.quantity += qty;
        continue;
      }
      out.set(id, { id, kind: 'mint', contract: t.contract, tokenId: t.tokenId, quantity: qty, from: null, to: t.to, priceWei: null, txHash: t.txHash, timestamp: t.timestamp });
      continue;
    }
    const burn = isBurnTarget(t.to);
    const id = `${t.txHash}:${t.logIndex}:${t.tokenId}`;
    out.set(id, {
      id,
      kind: burn ? 'burn' : 'transfer',
      contract: t.contract,
      tokenId: t.tokenId,
      quantity: qty,
      from: t.from,
      to: burn ? null : t.to,
      priceWei: null,
      txHash: t.txHash,
      timestamp: t.timestamp,
    });
  }
  return [...out.values()];
}

export function ensMap(transfers: RawTransfer[]): Map<Address, string> {
  const m = new Map<Address, string>();
  for (const t of transfers) {
    if (t.fromEns) m.set(t.from, t.fromEns);
    if (t.toEns) m.set(t.to, t.toEns);
  }
  return m;
}
