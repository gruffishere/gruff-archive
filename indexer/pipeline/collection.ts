import { join } from 'node:path';
import { instanceUrl, instancesUrl, paginate, toRawTransfer, toTokenMeta, transfersUrl, txValueWei, type BsInstance, type BsTransfer } from '../blockscout';
import type { FetchJson } from '../http';
import { buildBalances, chainEvents, ensMap, type Balances } from '../ledger';
import { isStored, manifestKey, storeMedia, type ManifestEntry, type MediaDeps, type StoredMedia } from '../media';
import { mergeEvents } from '../merge-events';
import { mintInfo } from '../mint-prices';
import { bestListings, normalizeListing, normalizeOsEvent, type OpenSea } from '../opensea';
import { packTokenMeta, unpackTokenMeta } from '../meta-cache';
import { readJson, writeJsonAtomic, writeJsonIfChanged } from '../store';
import { stripPlaceholders } from '../placeholder';
import { compareChrono, syncTransfers } from '../sync-transfers';
import type { RpcCall } from '../tokenuri';
import { resolveChainMetas } from './chain-metas';
import { fillIndexGaps } from './index-gaps';
import type { ArchiveEvent, CollectionConfig, Listing, MintInfo, RawTransfer, TokenMeta } from '../types';

export interface PipelineContext {
  fetchJson: FetchJson;
  os: OpenSea | null;
  mediaDeps: MediaDeps;
  rpc: RpcCall | null;
  manifest: Record<string, ManifestEntry>;
  txValues: Record<string, string>;
  rawDir: string;
  log: (msg: string) => void;
  now?: () => Date;
}

export interface CollectionState {
  cfg: CollectionConfig;
  transfers: RawTransfer[];
  metas: Map<string, TokenMeta>;
  balances: Balances;
  events: ArchiveEvent[];
  mints: Map<string, MintInfo>;
  listings: Map<string, Listing>;
  floorWei: string | null;
  osDescription: string | null;
  media: Map<string, { image: StoredMedia | null; animation: StoredMedia | null }>;
  ens: Map<string, string>;
  osStatus: 'ok' | 'skipped' | 'error';
  bsStatus: 'ok' | 'error';
  /** Token ids whose image/animation the placeholder guard nulled. */
  placeholderIds: Set<string>;
  /** File names (basename) of the placeholder's stored media: previous media made of these is never carried over or validated. */
  placeholderFiles: Set<string>;
}

async function* transferStream(fetchJson: FetchJson, cfg: CollectionConfig, tokenId?: string): AsyncGenerator<RawTransfer> {
  for await (const t of paginate<BsTransfer>(fetchJson, transfersUrl(cfg.contract, tokenId))) {
    const raw = toRawTransfer(cfg.contract, t);
    if (raw) yield raw;
  }
}

async function loadTransfers(cfg: CollectionConfig, ctx: PipelineContext): Promise<{ transfers: RawTransfer[]; status: CollectionState['bsStatus'] }> {
  const path = join(ctx.rawDir, 'transfers', `${cfg.slug}.json`);
  const existing = readJson<RawTransfer[]>(path, []);
  try {
    return { transfers: await syncAll(cfg, ctx, path, existing), status: 'ok' };
  } catch (err) {
    ctx.log(`  transfers failed (${(err as Error).message}), using cache`);
    return { transfers: existing.slice().sort(compareChrono), status: 'error' };
  }
}

async function syncAll(cfg: CollectionConfig, ctx: PipelineContext, path: string, existing: RawTransfer[]): Promise<RawTransfer[]> {
  let transfers: RawTransfer[];
  if (cfg.tokenIds) {
    transfers = [];
    for (const id of cfg.tokenIds) {
      const r = await syncTransfers(
        existing.filter((t) => t.tokenId === id),
        transferStream(ctx.fetchJson, cfg, id),
      );
      transfers.push(...r.transfers);
    }
    transfers.sort(compareChrono);
  } else {
    transfers = (await syncTransfers(existing, transferStream(ctx.fetchJson, cfg))).transfers;
  }
  writeJsonIfChanged(path, transfers);
  ctx.log(`  transfers: ${transfers.length} (+${transfers.length - existing.length})`);
  return transfers;
}

async function loadMetas(cfg: CollectionConfig, ctx: PipelineContext): Promise<{ metas: Map<string, TokenMeta>; status: CollectionState['bsStatus'] }> {
  const path = join(ctx.rawDir, 'metas', `${cfg.slug}.json`);
  try {
    const list: TokenMeta[] = [];
    if (cfg.tokenIds) for (const id of cfg.tokenIds) list.push(toTokenMeta(await ctx.fetchJson<BsInstance>(instanceUrl(cfg.contract, id))));
    else for await (const i of paginate<BsInstance>(ctx.fetchJson, instancesUrl(cfg.contract))) list.push(toTokenMeta(i));
    // Chain collections keep no data-URI payloads here: this cache is only their fallback.
    writeJsonIfChanged(path, list.map((m) => packTokenMeta(m, { dropDataUris: cfg.metadata === 'chain' })));
    return { metas: new Map(list.map((m) => [m.tokenId, m])), status: 'ok' };
  } catch (err) {
    ctx.log(`  metas failed (${(err as Error).message}), using cache`);
    return { metas: new Map(readJson<TokenMeta[]>(path, []).map((m) => [m.tokenId, unpackTokenMeta(m)])), status: 'error' };
  }
}

interface OsResult {
  status: CollectionState['osStatus'];
  events: ArchiveEvent[];
  listings: Map<string, Listing>;
  floorWei: string | null;
  description: string | null;
}

async function loadOpenSea(cfg: CollectionConfig, ctx: PipelineContext): Promise<OsResult> {
  const evPath = join(ctx.rawDir, 'os-events', `${cfg.slug}.json`);
  const lsPath = join(ctx.rawDir, 'os-listings', `${cfg.slug}.json`);
  const metaPath = join(ctx.rawDir, 'os-meta', `${cfg.slug}.json`);
  const cachedEvents = readJson<ArchiveEvent[]>(evPath, []);
  const cachedListings = new Map(readJson<Listing[]>(lsPath, []).map((l) => [l.tokenId, l]));
  const cachedMeta = readJson<{ floorWei: string | null; description: string | null }>(metaPath, { floorWei: null, description: null });
  const cached = (status: OsResult['status']): OsResult => ({ status, events: cachedEvents, listings: cachedListings, ...cachedMeta });
  if (!ctx.os) return cached('skipped');

  try {
    const os = ctx.os;
    const slug = await os.slug(cfg.contract);
    if (!slug) throw new Error('no OpenSea collection for contract');
    const lastTs = cachedEvents.reduce((m, e) => Math.max(m, Math.floor(Date.parse(e.timestamp) / 1000)), 0);
    const after = Math.max(0, lastTs - 86_400);
    const byId = new Map(cachedEvents.map((e) => [e.id, e]));
    const listingList: Listing[] = [];
    let floorWei: string | null;

    if (cfg.tokenIds) {
      for (const id of cfg.tokenIds) {
        for await (const raw of os.nftEvents(cfg.contract, id, after)) {
          const e = normalizeOsEvent(raw, cfg.contract);
          if (e) byId.set(e.id, e);
        }
        const best = await os.bestListing(slug, id);
        const n = best && normalizeListing(best, cfg.contract);
        if (n) listingList.push(n);
      }
      floorWei = listingList.length ? listingList.map((l) => BigInt(l.priceWei)).reduce((a, b) => (a < b ? a : b)).toString() : null;
    } else {
      for await (const raw of os.events(slug, after)) {
        const e = normalizeOsEvent(raw, cfg.contract);
        if (e) byId.set(e.id, e);
      }
      for await (const raw of os.listings(slug)) {
        const n = normalizeListing(raw, cfg.contract);
        if (n) listingList.push(n);
      }
      floorWei = await os.floorWei(slug);
    }
    const { description } = await os.collection(slug);
    const events = [...byId.values()];
    const listings = bestListings(listingList);
    writeJsonAtomic(evPath, events);
    writeJsonAtomic(lsPath, [...listings.values()]);
    writeJsonAtomic(metaPath, { floorWei, description });
    ctx.log(`  opensea: ${events.length} events, ${listings.size} listed`);
    return { status: 'ok', events, listings, floorWei, description };
  } catch (err) {
    ctx.log(`  opensea failed (${(err as Error).message}), using cache`);
    return cached('error');
  }
}

const isHtmlAnimation = (src: string) => /^data:text\/html|\.html?(\?|$)/i.test(src);
/** Plainly an image by extension: never an animation worth downloading (everything else is sniffed). */
const isImageUrl = (src: string) => /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(src);

const OS_IMAGE_TTL_MS = 7 * 24 * 3600 * 1000;
const OS_CHECKPOINT = 100;
interface OsImageEntry {
  url: string | null;
  fetchedAt: string;
}

export async function loadMedia(cfg: CollectionConfig, metas: Map<string, TokenMeta>, ctx: PipelineContext): Promise<CollectionState['media']> {
  const media: CollectionState['media'] = new Map();
  const now = ctx.now ?? (() => new Date());
  const safe = async (src: string) => {
    try {
      // Same clock as the rest of the pipeline, so the retry window and the failedAt stamps agree.
      return await storeMedia(src, ctx.mediaDeps, ctx.manifest, now());
    } catch (err) {
      ctx.log(`  media failed for ${src.slice(0, 80)}: ${(err as Error).message}`);
      return null;
    }
  };

  // OpenSea fallback image urls are cached per token (null included) so a keyed run does not re-query ~1,500 tokens every time.
  const osPath = join(ctx.rawDir, 'os-images', `${cfg.slug}.json`);
  const osCache = ctx.os ? readJson<Record<string, OsImageEntry>>(osPath, {}) : {};
  let osDirty = 0;
  const fallbackUrl = async (id: string): Promise<string | null> => {
    if (!ctx.os) return null;
    const hit = osCache[id];
    if (hit && now().getTime() - Date.parse(hit.fetchedAt) < OS_IMAGE_TTL_MS) return hit.url;
    try {
      const url = await ctx.os.nftImageUrl(cfg.contract, id);
      osCache[id] = { url, fetchedAt: now().toISOString() };
      if (++osDirty % OS_CHECKPOINT === 0) writeJsonAtomic(osPath, osCache);
      return url;
    } catch {
      return hit?.url ?? null; // a failed lookup is not cached
    }
  };

  const imageSources = new Set([...metas.values()].map((m) => m.image));
  const isUsedAsImage = (src: string) => imageSources.has(src);
  for (const [id, m] of metas) {
    if (cfg.tokenIds && !cfg.tokenIds.includes(id)) continue;
    let image = m.image ? await safe(m.image) : null;
    if (!image) {
      const fallback = await fallbackUrl(id);
      if (fallback) image = await safe(fallback);
    }
    let animation: StoredMedia | null = null;
    if (m.animation && (isHtmlAnimation(m.animation) || (m.animation !== m.image && !isImageUrl(m.animation)))) {
      const stored = await safe(m.animation);
      if (stored && (stored.kind === 'html' || stored.kind === 'video')) animation = stored;
      else if (stored?.kind === 'svg' && !isUsedAsImage(m.animation)) {
        // Not an animation: remember that, so it is neither re-downloaded nor left to be gc'd and re-fetched every run.
        ctx.manifest[manifestKey(m.animation)] = { failedAt: now().toISOString() };
      }
    }
    media.set(id, { image, animation });
  }
  if (osDirty) writeJsonAtomic(osPath, osCache);
  return media;
}

export async function processCollection(cfg: CollectionConfig, ctx: PipelineContext): Promise<CollectionState> {
  const tr = await loadTransfers(cfg, ctx);
  const transfers = tr.transfers;
  const bs = await loadMetas(cfg, ctx);
  let metas = bs.metas;
  if (cfg.metadata === 'chain' && ctx.rpc) metas = await resolveChainMetas(cfg, metas, transfers, { rpc: ctx.rpc, rawDir: ctx.rawDir, log: ctx.log });
  const gaps = cfg.metadata === 'chain' && ctx.rpc ? await fillIndexGaps(cfg, new Set(transfers.map((t) => t.tokenId)), ctx.rpc, ctx.log) : null;
  if (gaps) for (const [id, m] of gaps.metas) metas.set(id, m);
  const placeholders = stripPlaceholders(metas);
  if (placeholders.count) ctx.log(`  warning: ${placeholders.count} tokens share one placeholder image/animation, ignoring it`);
  const placeholderFiles = new Set<string>();
  for (const src of placeholders.sources) {
    const entry = ctx.manifest[manifestKey(src)];
    if (isStored(entry)) for (const p of [entry.thumb, entry.large, entry.file]) if (p) placeholderFiles.add(p.slice(p.lastIndexOf('/') + 1));
  }
  const balances = buildBalances(transfers);
  if (gaps) for (const [id, owner] of gaps.owners) balances.set(id, new Map([[owner, 1n]]));

  let txFailures = 0;
  const getTxValue = async (hash: string) => {
    const cached = ctx.txValues[hash];
    if (cached !== undefined) return cached;
    if (txFailures >= 3) return '0'; // Blockscout is struggling: stop asking, keep what is cached
    try {
      return (ctx.txValues[hash] = await txValueWei(ctx.fetchJson, hash));
    } catch (err) {
      if (txFailures++ === 0) ctx.log(`  tx value lookup failed (${(err as Error).message}); skipping price lookups`);
      return '0';
    }
  };
  const mints = await mintInfo(transfers, getTxValue);
  const os = await loadOpenSea(cfg, ctx);
  const events = mergeEvents(chainEvents(transfers), os.events);
  const media = await loadMedia(cfg, metas, ctx);
  return {
    cfg,
    transfers,
    metas,
    balances,
    events,
    mints,
    listings: os.listings,
    floorWei: os.floorWei,
    osDescription: os.description,
    media,
    ens: ensMap(transfers),
    osStatus: os.status,
    bsStatus: bs.status === 'error' || tr.status === 'error' || txFailures > 0 ? 'error' : 'ok',
    placeholderIds: placeholders.ids,
    placeholderFiles,
  };
}
