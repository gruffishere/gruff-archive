import { mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildCollectionOutputs } from '../../indexer/aggregate/outputs';
import { buildKeepers } from '../../indexer/aggregate/keepers';
import { buildTokens } from '../../indexer/aggregate/tokens';
import type { FetchJson } from '../../indexer/http';
import { buildBalances, chainEvents, ZERO } from '../../indexer/ledger';
import type { ManifestEntry } from '../../indexer/media';
import { packFields } from '../../indexer/meta-cache';
import { resolveChainMetas } from '../../indexer/pipeline/chain-metas';
import { loadMedia, type PipelineContext } from '../../indexer/pipeline/collection';
import { createRpc } from '../../indexer/tokenuri';
import type { CollectionConfig, RawTransfer, TokenMeta } from '../../indexer/types';

const DAY = 86_400_000;
const now = new Date('2026-11-05T12:00:00Z');
const ARTIST = '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646';
const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const cfg: CollectionConfig = { code: 'TST', slug: 'facets', title: 'Test', contract: '0xabc', standard: 'erc721', platform: 'custom', section: 'index', techniques: ['x'] };

let block = 0;
const tr = (tokenId: string, from: string, to: string, value: string, timestamp: string): RawTransfer => ({
  contract: '0xabc', tokenId, from, to, fromEns: null, toEns: null, value, txHash: `0x${++block}`, logIndex: 0, blockNumber: block, timestamp,
});

describe('R1 buildCollectionOutputs applies excludeHolders', () => {
  it('excludes configured addresses from token holderCount and collection holders', () => {
    const st = {
      metas: new Map<string, TokenMeta>(),
      balances: new Map([['1', new Map([[A, 1n], [B, 1n]])]]),
      mints: new Map([['1', { at: '2023-03-27T00:00:00.000Z', txHash: '0xm', priceWei: null, primary: false }]]),
      events: [],
      listings: new Map(),
      media: new Map(),
      ens: new Map<string, string>(),
      floorWei: null,
      osDescription: null,
      placeholderIds: new Set<string>(),
      placeholderFiles: new Set<string>(),
    };
    const base = { cfg, artist: ARTIST, year: 2023, st, prevTokens: [], staleSince: null };
    const plain = buildCollectionOutputs({ ...base, excludeHolders: new Set<string>() });
    const excl = buildCollectionOutputs({ ...base, excludeHolders: new Set([A]) });
    expect(plain.tokens[0].holderCount).toBe(2);
    expect(excl.tokens[0].holderCount).toBe(1);
    expect(excl.collection.holders).toBe(1);
  });
});

describe('R6 keepers ignore zero-value transfers', () => {
  it('uses only value>0 inbound transfers for dates and longest held', () => {
    const transfers = [
      tr('1', B, A, '0', '2020-01-01T00:00:00.000Z'),
      tr('1', ZERO, A, '1', '2023-01-15T00:00:00.000Z'),
      tr('1', B, A, '0', '2030-01-01T00:00:00.000Z'),
    ];
    const balances = buildBalances(transfers);
    const events = chainEvents(transfers);
    const mints = new Map([['1', { at: transfers[1].timestamp, txHash: '0x', priceWei: null, primary: false }]]);
    const tokens = buildTokens({ cfg, artist: ARTIST, year: 2023, metas: new Map(), balances, mints, events, listings: new Map(), media: new Map(), ens: new Map() });
    const [k] = buildKeepers({ artist: ARTIST, ens: new Map(), indexOrder: ['TST'], collections: [{ cfg, transfers, balances, events, tokens }] });
    expect(k.firstAcquired).toBe('2023-01-15T00:00:00.000Z');
    expect(k.lastAcquired).toBe('2023-01-15T00:00:00.000Z');
    expect(k.longestHeld?.since).toBe('2023-01-15T00:00:00.000Z');
  });
});

describe('R7 createRpc timeout', () => {
  it('passes an abort signal to every request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: '0x' }), { status: 200 }));
    await createRpc('https://rpc.test', { fetchImpl, sleepImpl: async () => {} })('m', []);
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('R5 svg animation negative manifest entry', () => {
  it('does not re-download an animation that sniffs as svg', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'r5-'));
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const download = vi.fn(async (url: string) => (url === 'https://gateway.pinata.cloud/ipfs/anim' ? { bytes: svg, mime: 'application/octet-stream' } : null));
    const manifest: Record<string, ManifestEntry> = {};
    const ctx: PipelineContext = {
      fetchJson: (async () => ({ items: [], next_page_params: null })) as unknown as FetchJson,
      os: null, rpc: null, manifest, txValues: {}, rawDir: join(dir, 'raw'), log: () => {}, now: () => now,
      mediaDeps: { download, outDir: join(dir, 'media'), publicPrefix: '/media' },
    };
    const metas = new Map<string, TokenMeta>([['1', { tokenId: '1', name: null, description: null, image: null, animation: 'ipfs://anim' }]]);
    expect((await loadMedia(cfg, metas, ctx)).get('1')!.animation).toBeNull();
    expect(Object.values(manifest).some((e) => 'failedAt' in e)).toBe(true);
    download.mockClear();
    await loadMedia(cfg, metas, ctx);
    expect(download).not.toHaveBeenCalled();
  });
});

const bsMeta = (id: string): TokenMeta => ({ tokenId: id, name: 'stale', description: 'stale', image: 'https://stale/x.svg', animation: null });
const uriFor = (id: string) => 'data:application/json,' + encodeURIComponent(JSON.stringify({ name: `n${id}`, image: `data:image/svg+xml;base64,${id}` }));
const abi = (s: string) => {
  const d = Buffer.from(s);
  const head = Buffer.alloc(64);
  head.writeUInt8(0x20, 31);
  head.writeUInt32BE(d.length, 60);
  return '0x' + Buffer.concat([head, d, Buffer.alloc((32 - (d.length % 32)) % 32)]).toString('hex');
};
const idOf = (params: unknown[]) => String(parseInt((params[0] as { data: string }).data.slice(10), 16));

describe('R2-R4 chain-meta cache write rules', () => {
  const path = (dir: string) => join(dir, 'metas-chain', 'facets.json');

  it('R2: expired entries are refetched once and persisted in the same run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const metas = new Map([['1', bsMeta('1')]]);
    const rpc = vi.fn(async () => abi(uriFor('1')));
    const run = (d: number) => resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log: () => {}, now: () => new Date(now.getTime() + d * DAY) });
    await run(0);
    await run(8);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(path(dir), 'utf8'))['1'].fetchedAt).toBe(new Date(now.getTime() + 8 * DAY).toISOString());
    await run(9);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('R2: a mid-cycle write does not cause an endless refetch loop for other expired entries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const two = new Map([['1', bsMeta('1')], ['2', bsMeta('2')]]);
    const rpc = vi.fn(async (_m: string, params: unknown[]) => abi(uriFor(idOf(params))));
    const run = (d: number, t: RawTransfer[] = []) => resolveChainMetas(cfg, two, t, { rpc, rawDir: dir, log: () => {}, now: () => new Date(now.getTime() + d * DAY) });
    await run(0);
    await run(4, [{ tokenId: '1', timestamp: new Date(now.getTime() + 3.5 * DAY).toISOString() }] as RawTransfer[]);
    rpc.mockClear();
    await run(8); // the mid-cycle refetch of token 1 was not persisted (unchanged), so both are expired on disk
    expect(rpc).toHaveBeenCalledTimes(2); // refetched once, persisted in the same run
    rpc.mockClear();
    await run(8.5);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('R3: packing is deterministic with a pinned gzip OS byte; an OS-byte-only difference does not rewrite', async () => {
    const metas = new Map([['1', bsMeta('1')]]);
    const big = 'data:image/svg+xml;base64,' + Buffer.from('<svg>' + '<g/>'.repeat(300) + '</svg>').toString('base64');
    const a = packFields(big, null);
    expect(a).toEqual(packFields(big, null));
    expect(Buffer.from(a.image!.slice(3), 'base64')[9]).toBe(3);
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const rpc = vi.fn(async () => abi('data:application/json,' + encodeURIComponent(JSON.stringify({ name: 'n', image: big }))));
    await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log: () => {}, now: () => now });
    const file = JSON.parse(readFileSync(path(dir), 'utf8'));
    const gz = Buffer.from(file['1'].meta.image.slice(3), 'base64');
    gz[9] = 0; // header written on another OS
    file['1'].meta.image = 'gz:' + gz.toString('base64');
    writeFileSync(path(dir), JSON.stringify(file));
    utimesSync(path(dir), new Date(1000), new Date(1000));
    const t = [{ tokenId: '1', timestamp: new Date(now.getTime() + 500).toISOString() }] as RawTransfer[];
    await resolveChainMetas(cfg, metas, t, { rpc, rawDir: dir, log: () => {}, now: () => new Date(now.getTime() + 1000) });
    expect(statSync(path(dir)).mtimeMs).toBe(1000);
  });

  it('R4: a big data-URI animation different from the image migrates to the packed format', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const html = 'data:text/html;base64,' + Buffer.from('<html>' + '<p>x</p>'.repeat(300) + '</html>').toString('base64');
    mkdirSync(join(dir, 'metas-chain'));
    writeFileSync(path(dir), JSON.stringify({ '1': { meta: { name: 'n1', description: null, image: 'https://x/i.png', animation: html }, fetchedAt: now.toISOString() } }));
    const rpc = vi.fn(async () => abi(uriFor('1')));
    const out = await resolveChainMetas(cfg, new Map([['1', bsMeta('1')]]), [], { rpc, rawDir: dir, log: () => {}, now: () => now });
    expect(rpc).not.toHaveBeenCalled();
    expect(out.get('1')!.animation).toBe(html);
    expect(JSON.parse(readFileSync(path(dir), 'utf8'))['1'].meta.animation.startsWith('gz:')).toBe(true);
  });
});
