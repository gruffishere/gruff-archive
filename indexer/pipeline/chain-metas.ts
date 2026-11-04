import { join } from 'node:path';
import { packFields, unpackFields } from '../meta-cache';
import { readJson, writeJsonAtomic } from '../store';
import { parseTokenUriJson, readTokenUri, type RpcCall } from '../tokenuri';
import type { CollectionConfig, RawTransfer, TokenMeta } from '../types';

export interface ChainEntry {
  /** null: a negative result (the tokenURI reverts or is not inline JSON), cached like any other entry. */
  meta: Omit<TokenMeta, 'tokenId'> | null;
  fetchedAt: string;
}

const isRevert = (err: unknown) => /execution reverted/i.test((err as Error)?.message ?? '');

const packEntry = (e: ChainEntry): ChainEntry => (e.meta ? { ...e, meta: { ...e.meta, ...packFields(e.meta.image, e.meta.animation) } } : e);
const unpackEntry = (e: ChainEntry): ChainEntry => (e.meta ? { ...e, meta: { ...e.meta, ...unpackFields(e.meta) } } : e);

/** Canonical form for change detection: the unpacked meta, independent of key order or gzip bytes. */
const metaKey = (m: ChainEntry['meta']): string => (m ? JSON.stringify([m.name, m.description, m.image, m.animation]) : 'null');

const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const MAX_CONSECUTIVE_FAILURES = 5;

export function needsChainFetch(entry: ChainEntry | undefined, lastTransferAt: string | null, now: Date): boolean {
  if (!entry) return true;
  const fetched = Date.parse(entry.fetchedAt);
  if (now.getTime() - fetched > MAX_AGE_MS) return true;
  return lastTransferAt !== null && Date.parse(lastTransferAt) > fetched;
}

/** Overlays on-chain tokenURI metadata on the Blockscout metas (Blockscout's cache can be stale or a shared placeholder). */
export async function resolveChainMetas(
  cfg: CollectionConfig,
  metas: Map<string, TokenMeta>,
  transfers: RawTransfer[],
  ctx: { rpc: RpcCall; rawDir: string; log: (msg: string) => void; now?: () => Date },
): Promise<Map<string, TokenMeta>> {
  const now = ctx.now ?? (() => new Date());
  const path = join(ctx.rawDir, 'metas-chain', `${cfg.slug}.json`);
  const stored = readJson<Record<string, ChainEntry>>(path, {});
  const cache: Record<string, ChainEntry> = {};
  const persisted = new Map<string, { key: string; fetchedAt: number }>(); // unpacked meta as last written, to tell real changes from fetchedAt churn
  for (const [id, e] of Object.entries(stored)) {
    cache[id] = unpackEntry(e);
    persisted.set(id, { key: metaKey(cache[id].meta), fetchedAt: Date.parse(e.fetchedAt) || 0 });
  }
  const touched = new Set<string>();
  // A cache written before the slim format (plain big data URIs, animation repeating the image) is migrated even with nothing to fetch.
  const legacy = Object.values(stored).some((e) => !!e.meta && ((e.meta.image?.startsWith('data:') && e.meta.image.length >= 512) || (e.meta.animation?.startsWith('data:') && e.meta.animation.length >= 512) || (e.meta.animation !== null && e.meta.animation === e.meta.image)));
  const lastTransfer = new Map<string, string>();
  for (const t of transfers) if ((lastTransfer.get(t.tokenId) ?? '') < t.timestamp) lastTransfer.set(t.tokenId, t.timestamp);

  let fetched = 0;
  let failed = 0;
  let streak = 0;
  for (const id of metas.keys()) {
    if (!needsChainFetch(cache[id], lastTransfer.get(id) ?? null, now())) continue;
    if (streak >= MAX_CONSECUTIVE_FAILURES) break;
    try {
      const uri = await readTokenUri(ctx.rpc, cfg.contract, id);
      streak = 0;
      const meta = parseTokenUriJson(uri);
      cache[id] = { meta, fetchedAt: now().toISOString() };
      touched.add(id);
      if (meta) fetched++;
    } catch (err) {
      if (isRevert(err)) {
        // Deterministic: the contract says this token has no URI. Cache it, and it says nothing about RPC health.
        cache[id] = { meta: null, fetchedAt: now().toISOString() };
        touched.add(id);
        continue;
      }
      failed++;
      streak++;
      ctx.log(`  tokenURI #${id} failed (${(err as Error).message})`);
    }
  }
  if (streak >= MAX_CONSECUTIVE_FAILURES) ctx.log('  tokenURI: too many consecutive failures, stopping (Blockscout/cached values used for the rest)');
  if (touched.size || legacy) {
    const packed = Object.fromEntries(Object.entries(cache).map(([id, e]) => [id, packEntry(e)]));
    const t = now().getTime();
    const changed = [...touched].some((id) => {
      const prev = persisted.get(id);
      // A new or different meta, or a refreshed entry whose saved fetchedAt had expired (persist it so it is not refetched again).
      return !prev || prev.key !== metaKey(cache[id].meta) || t - prev.fetchedAt >= MAX_AGE_MS;
    });
    if (changed || legacy) writeJsonAtomic(path, packed);
  }

  const out = new Map<string, TokenMeta>();
  let chain = 0;
  for (const [id, m] of metas) {
    const c = cache[id]?.meta;
    if (c) chain++;
    out.set(id, c ? { tokenId: id, name: c.name ?? m.name, description: c.description ?? m.description, image: c.image ?? m.image, animation: c.animation ?? m.animation } : m);
  }
  ctx.log(`  on-chain metadata: ${chain}/${metas.size} tokens (${fetched} fetched, ${failed} failed)`);
  return out;
}
