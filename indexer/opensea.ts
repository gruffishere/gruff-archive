import { HttpError, type FetchJson } from './http';
import type { Address, ArchiveEvent, Listing } from './types';

const OS = 'https://api.opensea.io/api/v2';

export interface OsNft {
  identifier: string;
  contract: string;
}

export interface OsRawEvent {
  event_type: string;
  order_type?: string;
  event_timestamp: number;
  transaction?: string | null;
  order_hash?: string | null;
  nft?: OsNft | null;
  asset?: OsNft | null;
  quantity?: number;
  seller?: string;
  buyer?: string;
  maker?: string;
  payment?: { quantity: string; decimals: number; symbol: string } | null;
}

export interface OsRawListing {
  order_hash: string;
  price: { current: { currency: string; decimals: number; value: string } };
  protocol_data: {
    parameters: {
      offerer: string;
      startTime: string;
      offer: { token: string; identifierOrCriteria: string; startAmount: string }[];
    };
  };
}

export interface OpenSea {
  slug(contract: Address): Promise<string | null>;
  collection(slug: string): Promise<{ description: string | null }>;
  floorWei(slug: string): Promise<string | null>;
  events(slug: string, afterUnix: number): AsyncGenerator<OsRawEvent>;
  nftEvents(contract: Address, tokenId: string, afterUnix: number): AsyncGenerator<OsRawEvent>;
  listings(slug: string): AsyncGenerator<OsRawListing>;
  bestListing(slug: string, tokenId: string): Promise<OsRawListing | null>;
  nftImageUrl(contract: Address, tokenId: string): Promise<string | null>;
}

export const ethToWei = (eth: number) => (BigInt(Math.round(eth * 1e9)) * 1_000_000_000n).toString();

export function createOpenSea(fetchJson: FetchJson, apiKey: string): OpenSea {
  const init = { headers: { 'x-api-key': apiKey } };

  async function* eventPages(base: string, afterUnix: number): AsyncGenerator<OsRawEvent> {
    let next: string | null = null;
    do {
      const u = new URL(base);
      u.searchParams.append('event_type', 'sale');
      u.searchParams.append('event_type', 'listing');
      u.searchParams.set('after', String(afterUnix));
      u.searchParams.set('limit', '50');
      if (next) u.searchParams.set('next', next);
      const r = await fetchJson<{ asset_events: OsRawEvent[]; next?: string | null }>(u.toString(), init);
      yield* r.asset_events;
      next = r.next ?? null;
    } while (next);
  }

  return {
    async slug(contract) {
      const r = await fetchJson<{ collection?: string | null }>(`${OS}/chain/ethereum/contract/${contract}`, init);
      return r.collection ?? null;
    },
    async collection(slug) {
      const r = await fetchJson<{ description?: string | null }>(`${OS}/collections/${slug}`, init);
      return { description: r.description || null };
    },
    async floorWei(slug) {
      const r = await fetchJson<{ total?: { floor_price?: number | null } }>(`${OS}/collections/${slug}/stats`, init);
      const floor = r.total?.floor_price;
      return floor == null || floor <= 0 ? null : ethToWei(floor);
    },
    events(slug, afterUnix) {
      return eventPages(`${OS}/events/collection/${slug}`, afterUnix);
    },
    nftEvents(contract, tokenId, afterUnix) {
      return eventPages(`${OS}/events/chain/ethereum/contract/${contract}/nfts/${tokenId}`, afterUnix);
    },
    async *listings(slug) {
      let next: string | null = null;
      do {
        const u = new URL(`${OS}/listings/collection/${slug}/all`);
        u.searchParams.set('limit', '100');
        if (next) u.searchParams.set('next', next);
        const r = await fetchJson<{ listings: OsRawListing[]; next?: string | null }>(u.toString(), init);
        yield* r.listings;
        next = r.next ?? null;
      } while (next);
    },
    async bestListing(slug, tokenId) {
      try {
        return await fetchJson<OsRawListing>(`${OS}/listings/collection/${slug}/nfts/${tokenId}/best`, init);
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) return null;
        throw err;
      }
    },
    async nftImageUrl(contract, tokenId) {
      const r = await fetchJson<{ nft?: { display_image_url?: string | null; image_url?: string | null } }>(
        `${OS}/chain/ethereum/contract/${contract}/nfts/${tokenId}`,
        init,
      );
      return r.nft?.display_image_url || r.nft?.image_url || null;
    },
  };
}

export function normalizeOsEvent(e: OsRawEvent, contract: Address): ArchiveEvent | null {
  const nft = e.nft ?? e.asset;
  if (!nft || nft.contract.toLowerCase() !== contract) return null;
  const isSale = e.event_type === 'sale';
  const isListing = e.event_type === 'listing' || (e.event_type === 'order' && e.order_type === 'listing');
  if (!isSale && !isListing) return null;
  const priceWei = e.payment && (e.payment.symbol === 'ETH' || e.payment.symbol === 'WETH') ? e.payment.quantity : null;
  const txHash = e.transaction ? e.transaction.toLowerCase() : null;
  const kind = isSale ? 'sale' : 'listed';
  return {
    id: isSale
      ? `os:${e.order_hash ?? ''}:${txHash ?? ''}:${nft.identifier}:sale`
      : `os:${e.order_hash ?? txHash}:${nft.identifier}:${kind}`,
    kind,
    contract,
    tokenId: String(nft.identifier),
    quantity: e.quantity ?? 1,
    from: (isSale ? e.seller : e.maker)?.toLowerCase() ?? null,
    to: isSale ? (e.buyer?.toLowerCase() ?? null) : null,
    priceWei,
    txHash,
    timestamp: new Date(e.event_timestamp * 1000).toISOString(),
  };
}

export function normalizeListing(l: OsRawListing, contract: Address): Listing | null {
  const item = l.protocol_data?.parameters?.offer?.[0];
  if (!item || item.token.toLowerCase() !== contract) return null;
  if (!['ETH', 'WETH'].includes(l.price.current.currency)) return null;
  const units = BigInt(item.startAmount || '1') || 1n;
  return {
    tokenId: String(item.identifierOrCriteria),
    priceWei: (BigInt(l.price.current.value) / units).toString(),
    maker: l.protocol_data.parameters.offerer.toLowerCase(),
    at: new Date(Number(l.protocol_data.parameters.startTime) * 1000).toISOString(),
  };
}

export function bestListings(list: Listing[]): Map<string, Listing> {
  const best = new Map<string, Listing>();
  for (const l of list) {
    const cur = best.get(l.tokenId);
    if (!cur || BigInt(l.priceWei) < BigInt(cur.priceWei)) best.set(l.tokenId, l);
  }
  return best;
}
