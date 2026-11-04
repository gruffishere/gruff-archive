import type { TokenMeta } from './types';

export type RpcCall = (method: string, params: unknown[]) => Promise<unknown>;
export const DEFAULT_RPC_URL = 'https://ethereum-rpc.publicnode.com';

const RPC_TIMEOUT_MS = 60_000;
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRpc(
  url = DEFAULT_RPC_URL,
  opts: {
    retries?: number;
    minIntervalMs?: number;
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
    sleepImpl?: (ms: number) => Promise<void>;
  } = {},
): RpcCall {
  const retries = opts.retries ?? 3;
  const minInterval = opts.minIntervalMs ?? 100;
  const doFetch = opts.fetchImpl ?? ((u: string, init?: RequestInit) => fetch(u, init));
  const sleep = opts.sleepImpl ?? realSleep;
  let lastRequest = 0;
  let id = 0;

  return async (method, params) => {
    for (let attempt = 0; ; attempt++) {
      const gap = lastRequest + minInterval - Date.now();
      if (gap > 0) await sleep(gap);
      lastRequest = Date.now();

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
          signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.ok) {
        const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
        if (body.error) throw new Error(`rpc ${method}: ${body.error.message ?? 'error'}`);
        return body.result;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
  };
}

export const encodeTokenUriCall = (tokenId: string): string => '0xc87b56dd' + BigInt(tokenId).toString(16).padStart(64, '0');

/** Decodes the ABI encoding of a single dynamic `string` return value. */
export function decodeAbiString(hex: string): string | null {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length < 128) return null;
  const offset = Number(BigInt('0x' + h.slice(0, 64)));
  const start = offset * 2;
  if (h.length < start + 64) return null;
  const len = Number(BigInt('0x' + h.slice(start, start + 64)));
  const data = h.slice(start + 64, start + 64 + len * 2);
  if (data.length < len * 2) return null;
  return Buffer.from(data, 'hex').toString('utf8');
}

export async function readTokenUri(rpc: RpcCall, contract: string, tokenId: string): Promise<string> {
  const result = await rpc('eth_call', [{ to: contract, data: encodeTokenUriCall(tokenId) }, 'latest']);
  const uri = typeof result === 'string' ? decodeAbiString(result) : null;
  if (uri === null) throw new Error(`tokenURI(${tokenId}): empty result`);
  return uri;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Decodes inline `data:application/json` token URIs; anything remote (http, ipfs, ar) yields null. */
export function parseTokenUriJson(uri: string): Omit<TokenMeta, 'tokenId'> | null {
  const m = uri.match(/^data:application\/json((?:;[^,;]*)*),(.*)$/s);
  if (!m) return null;
  let text: string;
  if (m[1].includes(';base64')) text = Buffer.from(m[2], 'base64').toString('utf8');
  else {
    try {
      text = decodeURIComponent(m[2]);
    } catch {
      text = m[2];
    }
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const imageData = str(o.image_data);
  return {
    name: str(o.name),
    description: str(o.description),
    image: str(o.image) ?? (imageData ? `data:image/svg+xml;utf8,${encodeURIComponent(imageData)}` : null),
    animation: str(o.animation_url),
  };
}
