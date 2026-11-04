import { mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { needsChainFetch, resolveChainMetas } from '../../indexer/pipeline/chain-metas';
import type { CollectionConfig, RawTransfer, TokenMeta } from '../../indexer/types';

const DAY = 86_400_000;
const now = new Date('2026-11-05T12:00:00Z');
const iso = (offsetDays: number) => new Date(now.getTime() + offsetDays * DAY).toISOString();

describe('needsChainFetch', () => {
  const entry = (fetchedAt: string) => ({ meta: { name: 'x', description: null, image: null, animation: null }, fetchedAt });

  it('fetches when missing, older than 7 days, or transferred since', () => {
    expect(needsChainFetch(undefined, null, now)).toBe(true);
    expect(needsChainFetch(entry(iso(-8)), null, now)).toBe(true);
    expect(needsChainFetch(entry(iso(-1)), iso(-0.5), now)).toBe(true);
  });

  it('keeps a fresh entry with no newer transfer', () => {
    expect(needsChainFetch(entry(iso(-1)), iso(-3), now)).toBe(false);
    expect(needsChainFetch(entry(iso(-1)), null, now)).toBe(false);
  });
});

const cfg = { slug: 'facets', contract: '0xabc' } as CollectionConfig;
const bsMeta = (id: string): TokenMeta => ({ tokenId: id, name: 'stale', description: 'stale', image: 'https://stale/x.svg', animation: null });
const uriFor = (id: string) => 'data:application/json,' + encodeURIComponent(JSON.stringify({ name: `n${id}`, image: `data:image/svg+xml;base64,${id}` }));
const abi = (s: string) => {
  const d = Buffer.from(s);
  const head = Buffer.alloc(64);
  head.writeUInt8(0x20, 31);
  head.writeUInt32BE(d.length, 60);
  return '0x' + Buffer.concat([head, d, Buffer.alloc((32 - (d.length % 32)) % 32)]).toString('hex');
};

describe('resolveChainMetas', () => {
  it('prefers chain metadata, caches it and only refetches what is needed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const calls: string[] = [];
    const rpc = vi.fn(async (_m: string, params: unknown[]) => {
      const data = (params[0] as { data: string }).data;
      const id = String(parseInt(data.slice(10), 16));
      calls.push(id);
      if (id === '3') throw new Error('execution reverted');
      return abi(uriFor(id));
    });
    const metas = new Map([
      ['1', bsMeta('1')],
      ['2', bsMeta('2')],
      ['3', bsMeta('3')],
    ]);
    const log = vi.fn();
    const out = await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log, now: () => now });
    expect(out.get('1')).toMatchObject({ name: 'n1', image: 'data:image/svg+xml;base64,1' });
    expect(out.get('3')!.name).toBe('stale'); // revert falls back to Blockscout
    const cache = JSON.parse(readFileSync(join(dir, 'metas-chain', 'facets.json'), 'utf8'));
    expect(Object.keys(cache).sort()).toEqual(['1', '2', '3']); // the revert is cached as a negative entry
    expect(cache['3'].meta).toBeNull();

    calls.length = 0;
    const transfers = [{ tokenId: '2', timestamp: new Date(now.getTime() + 500).toISOString() }] as RawTransfer[];
    await resolveChainMetas(cfg, metas, transfers, { rpc, rawDir: dir, log, now: () => new Date(now.getTime() + 1000) });
    expect(calls).toEqual(['2']); // 1 cached, 3 negatively cached, 2 transferred after fetch
  });

  it('gives up after repeated rpc failures', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const rpc = vi.fn(async () => {
      throw new Error('boom');
    });
    const metas = new Map(Array.from({ length: 20 }, (_, i) => [String(i + 1), bsMeta(String(i + 1))] as const));
    await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log: () => {}, now: () => now });
    expect(rpc.mock.calls.length).toBeLessThan(20);
  });
});

describe('resolveChainMetas: reverts and negative caching (M9)', () => {
  it('does not count deterministic reverts toward the failure streak, and caches them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const rpc = vi.fn(async () => {
      throw new Error('rpc eth_call: execution reverted');
    });
    const metas = new Map(Array.from({ length: 20 }, (_, i) => [String(i + 1), bsMeta(String(i + 1))] as const));
    const log = vi.fn();
    await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log, now: () => now });
    expect(rpc).toHaveBeenCalledTimes(20);
    expect(log.mock.calls.flat().join('\n')).not.toMatch(/too many consecutive/);
    rpc.mockClear();
    await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log, now: () => now });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('caches tokens whose tokenURI is not inline JSON instead of refetching them every run', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const rpc = vi.fn(async () => abi('ipfs://bafy/1.json'));
    const metas = new Map([['1', bsMeta('1')]]);
    const out = await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log: () => {}, now: () => now });
    expect(out.get('1')!.name).toBe('stale');
    await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log: () => {}, now: () => now });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('resolveChainMetas: slim cache file (I4)', () => {
  const bigSvg = 'data:image/svg+xml;base64,' + Buffer.from('<svg>' + '<rect width="1" height="1"/>'.repeat(400) + '</svg>').toString('base64');
  const bigUri = (id: string) => 'data:application/json,' + encodeURIComponent(JSON.stringify({ name: `n${id}`, image: bigSvg, animation_url: bigSvg }));
  const metas = new Map([['1', bsMeta('1')]]);

  it('stores data URIs gzipped, animation as =image, and reads them back in full', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const rpc = vi.fn(async () => abi(bigUri('1')));
    const path = join(dir, 'metas-chain', 'facets.json');
    const out = await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log: () => {}, now: () => now });
    expect(out.get('1')).toMatchObject({ image: bigSvg, animation: bigSvg });
    const raw = readFileSync(path, 'utf8');
    expect(raw.length).toBeLessThan(bigSvg.length / 2);
    expect(JSON.parse(raw)['1'].meta.animation).toBe('=image');
    rpc.mockClear();
    const again = await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log: () => {}, now: () => new Date(now.getTime() + 1000) });
    expect(rpc).not.toHaveBeenCalled();
    expect(again.get('1')).toMatchObject({ image: bigSvg, animation: bigSvg });
  });

  it('rewrites the file only when metadata changed or after 7 days', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const rpc = vi.fn(async () => abi(uriFor('1')));
    const path = join(dir, 'metas-chain', 'facets.json');
    await resolveChainMetas(cfg, metas, [], { rpc, rawDir: dir, log: () => {}, now: () => now });
    utimesSync(path, new Date(1000), new Date(1000));
    const transfers = [{ tokenId: '1', timestamp: new Date(now.getTime() + 500).toISOString() }] as RawTransfer[];
    // refetched after a transfer, identical metadata: no rewrite
    await resolveChainMetas(cfg, metas, transfers, { rpc, rawDir: dir, log: () => {}, now: () => new Date(now.getTime() + 1000) });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(statSync(path).mtimeMs).toBe(1000);
    // metadata changed: rewrite
    const changed = vi.fn(async () => abi(uriFor('9')));
    await resolveChainMetas(cfg, metas, transfers, { rpc: changed, rawDir: dir, log: () => {}, now: () => new Date(now.getTime() + 2000) });
    expect(statSync(path).mtimeMs).not.toBe(1000);
    // identical again but >= 7 days since the last write: rewrite so fetchedAt does not expire forever
    utimesSync(path, new Date(1000), new Date(1000));
    const later = new Date(now.getTime() + 8 * DAY);
    await resolveChainMetas(cfg, metas, [], { rpc: changed, rawDir: dir, log: () => {}, now: () => later });
    expect(statSync(path).mtimeMs).not.toBe(1000);
    expect(JSON.parse(readFileSync(path, 'utf8'))['1'].fetchedAt).toBe(later.toISOString());
  });
});

describe('resolveChainMetas: legacy cache migration (I4)', () => {
  it('rewrites a pre-slim cache in the compact format without refetching', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'chain-'));
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg>' + '<rect width="1" height="1"/>'.repeat(400) + '</svg>').toString('base64');
    mkdirSync(join(dir, 'metas-chain'));
    const path = join(dir, 'metas-chain', 'facets.json');
    writeFileSync(path, JSON.stringify({ '1': { meta: { name: 'n1', description: null, image: svg, animation: svg }, fetchedAt: now.toISOString() } }));
    const rpc = vi.fn(async () => abi(uriFor('1')));
    const out = await resolveChainMetas(cfg, new Map([['1', bsMeta('1')]]), [], { rpc, rawDir: dir, log: () => {}, now: () => now });
    expect(rpc).not.toHaveBeenCalled();
    expect(out.get('1')).toMatchObject({ image: svg, animation: svg });
    const raw = readFileSync(path, 'utf8');
    expect(raw.length).toBeLessThan(svg.length / 2);
    expect(JSON.parse(raw)['1'].meta.animation).toBe('=image');
  });
});
