import { normalizeListing, type OsRawListing } from '../../indexer/opensea';
import collections from '../../data/catalog/collections.json';
import { parseQuery } from '../lib/listing';

interface Env { OPENSEA_API_KEY?: string }
const KNOWN = new Set((collections as { contract?: string | null }[]).flatMap((c) => (c.contract ? [c.contract.toLowerCase()] : [])));
const TIMEOUT_MS = 6000;
const OS = 'https://api.opensea.io/api/v2';

const json = (body: unknown, status = 200, maxAge = 60) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store' } });

type Ctx = { request: Request; env: Env };

/** The handler for a given contract allowlist, so tests do not depend on the catalog. */
export const makeHandler = (known: Set<string>) => async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const q = parseQuery(new URL(request.url));
  if (!q) return json({ error: 'bad request' }, 400, 0);
  if (!known.has(q.contract)) return json({ error: 'unknown contract' }, 400, 0);
  const edge = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheKey = new Request(`${new URL(request.url).origin}/api/listing?contract=${q.contract}&id=${q.id}`);
  let hit: Response | undefined;
  try {
    hit = await edge?.match(cacheKey);
  } catch {
    // treat a cache failure as a miss
  }
  if (hit) return hit;
  if (!env.OPENSEA_API_KEY) return json({ error: 'unavailable' }, 503, 0);
  const headers = { 'x-api-key': env.OPENSEA_API_KEY, accept: 'application/json' };
  const get = (url: string) => fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const ok = async (listing: unknown) => {
    const res = json({ listing });
    try {
      await edge?.put(cacheKey, res.clone());
    } catch {
      // caching is best-effort
    }
    return res;
  };
  try {
    const c = await get(`${OS}/chain/ethereum/contract/${q.contract}`);
    if (!c.ok) return json({ error: 'upstream' }, 502, 0);
    const { collection } = (await c.json()) as { collection?: string | null };
    if (!collection) return ok(null);
    const r = await get(`${OS}/listings/collection/${encodeURIComponent(collection)}/nfts/${q.id}/best`);
    if (r.status === 404) return ok(null);
    if (!r.ok) return json({ error: 'upstream' }, 502, 0);
    return ok(normalizeListing((await r.json()) as OsRawListing, q.contract));
  } catch {
    return json({ error: 'upstream' }, 502, 0);
  }
}

export const onRequestGet = makeHandler(KNOWN);
