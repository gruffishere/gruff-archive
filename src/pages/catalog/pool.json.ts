import type { APIRoute } from 'astro';
import { collections, tokensOf } from '../../lib/data';
import { catalogPool, measurePieces, toPoolItem } from '../../lib/catalog';

/** The pool the catalog page draws its wall from on every visit (src/scripts/catalog.ts). */
export const GET: APIRoute = async () => {
  const cols = collections();
  const pool = await measurePieces(catalogPool(cols, Object.fromEntries(cols.map((c) => [c.slug, tokensOf(c.slug)]))));
  return new Response(JSON.stringify(pool.map(toPoolItem)), { headers: { 'content-type': 'application/json' } });
};
