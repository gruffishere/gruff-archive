import type { ActivityRow } from '../../indexer/aggregate/activity';
import type { EventKind } from '../../indexer/types';
import type { KeeperOut } from '../../indexer/aggregate/keepers';
import { displayName, eventLabel } from './format';

export interface DisplayRow {
  key: string;
  kind: EventKind;
  label: string;
  timestamp: string;
  slug: string;
  tokenId: string;
  ids: string[];
  tokenName: string;
  accession: string;
  thumb: string | null;
  from: string | null;
  fromName: string | null;
  to: string | null;
  toName: string | null;
  priceWei: string | null;
}

export function toDisplayRows(rows: ActivityRow[]): DisplayRow[] {
  return rows.map((r) => ({
    key: r.id,
    kind: r.kind,
    label: eventLabel(r.kind, r.quantity),
    timestamp: r.timestamp,
    slug: r.slug,
    tokenId: r.tokenId,
    ids: [r.tokenId],
    tokenName: r.tokenName,
    accession: r.accession,
    thumb: r.thumb,
    from: r.from,
    fromName: r.from ? displayName(r.from, r.fromEns) : null,
    to: r.to,
    toName: r.to ? displayName(r.to, r.toEns) : null,
    priceWei: r.priceWei,
  }));
}

export const KIND_FILTERS = ['all', 'sale', 'mint', 'transfer', 'listed'] as const;

export function collapseMints(rows: ActivityRow[]): DisplayRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: DisplayRow[] = [];
  let qty = 0;
  for (const d of toDisplayRows(rows)) {
    const src = byId.get(d.key)!;
    const prev = out.at(-1);
    const prevSrc = prev ? byId.get(prev.key) : undefined;
    if (prev && prevSrc && d.kind === 'mint' && prev.kind === 'mint' && src.txHash && src.txHash === prevSrc.txHash && d.slug === prev.slug && d.to === prev.to) {
      prev.ids.push(d.tokenId);
      qty += src.quantity;
      prev.label = eventLabel('mint', qty);
      continue;
    }
    qty = src.quantity;
    out.push(d);
  }
  return out;
}

export function summary(rows: ActivityRow[], keepers: KeeperOut[], now: Date, days = 30) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const sales = rows.filter((r) => r.kind === 'sale' && r.timestamp >= since);
  return {
    sales: sales.length,
    volumeWei: sales.reduce((s, r) => s + BigInt(r.priceWei ?? '0'), 0n).toString(),
    newKeepers: keepers.filter((k) => k.firstAcquired && k.firstAcquired >= since).length,
  };
}

/** The monthly activity files (YYYY-MM) that cover the `days` days before `now`, newest first. */
export function summaryMonths(now: Date, days = 30): string[] {
  const since = new Date(now.getTime() - days * 86_400_000);
  const key = (d: Date) => d.toISOString().slice(0, 7);
  return key(since) === key(now) ? [key(now)] : [key(now), key(since)];
}
