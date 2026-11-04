import type { FetchJson } from './http';
import type { Address, RawTransfer, TokenMeta } from './types';

const BASE = 'https://eth.blockscout.com/api/v2';

export interface BsAddress {
  hash: string;
  ens_domain_name: string | null;
}

export interface BsTransfer {
  from: BsAddress;
  to: BsAddress;
  log_index: number;
  block_number: number;
  timestamp: string;
  transaction_hash: string;
  total: { token_id: string; value?: string } | null;
  type: string;
}

export interface BsInstance {
  id: string;
  image_url: string | null;
  animation_url: string | null;
  metadata: Record<string, unknown> | null;
}

interface Page<T> {
  items: T[];
  next_page_params: Record<string, string | number> | null;
}

function withParams(url: string, params: Record<string, string | number> | null): string {
  if (!params) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

export async function* paginate<T>(fetchJson: FetchJson, url: string): AsyncGenerator<T> {
  let params: Record<string, string | number> | null = null;
  do {
    const page: Page<T> = await fetchJson<Page<T>>(withParams(url, params));
    for (const item of page.items) yield item;
    const next: Record<string, string | number> | null = page.next_page_params;
    if (next && params && JSON.stringify(next) === JSON.stringify(params)) throw new Error(`pagination stuck: next_page_params repeated for ${url}`);
    params = next;
  } while (params);
}

export const transfersUrl = (contract: Address, tokenId?: string) =>
  tokenId === undefined ? `${BASE}/tokens/${contract}/transfers` : `${BASE}/tokens/${contract}/instances/${tokenId}/transfers`;
export const instancesUrl = (contract: Address) => `${BASE}/tokens/${contract}/instances`;
export const instanceUrl = (contract: Address, tokenId: string) => `${BASE}/tokens/${contract}/instances/${tokenId}`;

export function toRawTransfer(contract: Address, t: BsTransfer): RawTransfer | null {
  if (!t.total?.token_id) return null;
  return {
    contract,
    tokenId: t.total.token_id,
    from: t.from.hash.toLowerCase(),
    to: t.to.hash.toLowerCase(),
    fromEns: t.from.ens_domain_name ?? null,
    toEns: t.to.ens_domain_name ?? null,
    value: t.total.value ?? '1',
    txHash: t.transaction_hash.toLowerCase(),
    logIndex: t.log_index,
    blockNumber: t.block_number,
    timestamp: new Date(t.timestamp).toISOString(),
  };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function toTokenMeta(i: BsInstance): TokenMeta {
  const m = i.metadata ?? {};
  return {
    tokenId: String(i.id),
    name: str(m.name),
    description: str(m.description),
    image: str(m.image) ?? str(m.image_url) ?? i.image_url ?? null,
    animation: str(m.animation_url) ?? i.animation_url ?? null,
  };
}

export async function txValueWei(fetchJson: FetchJson, txHash: string): Promise<string> {
  const tx = await fetchJson<{ value?: string | null }>(`${BASE}/transactions/${txHash}`);
  return tx.value ?? '0';
}
