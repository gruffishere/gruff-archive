import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { FetchJson } from '../../indexer/http';
import { ZERO } from '../../indexer/ledger';
import type { ManifestEntry } from '../../indexer/media';
import type { OpenSea } from '../../indexer/opensea';
import { loadMedia, processCollection, type PipelineContext } from '../../indexer/pipeline/collection';
import type { CollectionConfig, RawTransfer, TokenMeta } from '../../indexer/types';

const cfg: CollectionConfig = { code: 'TST', slug: 'test', title: 'Test', contract: '0xabc', standard: 'erc721', platform: 'custom', section: 'index', techniques: ['x'] };
const DAY = 86_400_000;
const now = new Date('2026-11-05T12:00:00Z');
const meta = (id: string, p: Partial<TokenMeta> = {}): TokenMeta => ({ tokenId: id, name: null, description: null, image: null, animation: null, ...p });

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer();
});

type Files = Record<string, { bytes: Buffer; mime: string }>;

function ctxWith(over: Partial<PipelineContext> = {}, files: Files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pipe-'));
  const download = vi.fn(async (url: string) => files[url] ?? null);
  const manifest: Record<string, ManifestEntry> = {};
  const ctx: PipelineContext = {
    fetchJson: (async () => ({ items: [], next_page_params: null })) as unknown as FetchJson,
    os: null,
    rpc: null,
    mediaDeps: { download, outDir: join(dir, 'media'), publicPrefix: '/media' },
    manifest,
    txValues: {},
    rawDir: join(dir, 'raw'),
    log: () => {},
    now: () => now,
    ...over,
  };
  return { ctx, download, dir };
}

const fakeOs = (impl: (id: string) => Promise<string | null>) => ({ nftImageUrl: vi.fn(async (_c: string, id: string) => impl(id)) }) as unknown as OpenSea & { nftImageUrl: ReturnType<typeof vi.fn> };

describe('loadMedia OpenSea fallback cache (I3)', () => {
  it('queries each token once, then serves cached urls (and cached nulls) for 7 days', async () => {
    const os = fakeOs(async (id) => (id === '1' ? 'https://os/1.png' : null));
    const { ctx } = ctxWith({ os }, { 'https://os/1.png': { bytes: png, mime: 'image/png' } });
    const metas = new Map([
      ['1', meta('1')],
      ['2', meta('2')],
    ]);
    const m1 = await loadMedia(cfg, metas, ctx);
    expect(m1.get('1')!.image?.kind).toBe('image');
    expect(os.nftImageUrl).toHaveBeenCalledTimes(2);
    const cached = JSON.parse(readFileSync(join(ctx.rawDir, 'os-images', 'test.json'), 'utf8'));
    expect(cached['1']).toMatchObject({ url: 'https://os/1.png' });
    expect(cached['2'].url).toBeNull();

    os.nftImageUrl.mockClear();
    await loadMedia(cfg, metas, { ...ctx, now: () => new Date(now.getTime() + 6 * DAY) });
    expect(os.nftImageUrl).not.toHaveBeenCalled();
    await loadMedia(cfg, metas, { ...ctx, now: () => new Date(now.getTime() + 8 * DAY) });
    expect(os.nftImageUrl).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed lookup', async () => {
    const os = fakeOs(async () => {
      throw new Error('429');
    });
    const { ctx } = ctxWith({ os });
    const metas = new Map([['1', meta('1')]]);
    await loadMedia(cfg, metas, ctx);
    await loadMedia(cfg, metas, ctx);
    expect(os.nftImageUrl).toHaveBeenCalledTimes(2);
  });

  it('does not ask OpenSea for tokens that already have an image', async () => {
    const os = fakeOs(async () => 'https://os/x.png');
    const { ctx } = ctxWith({ os }, { 'https://a/1.png': { bytes: png, mime: 'image/png' } });
    await loadMedia(cfg, new Map([['1', meta('1', { image: 'https://a/1.png' })]]), ctx);
    expect(os.nftImageUrl).not.toHaveBeenCalled();
  });
});

describe('loadMedia animation sniffing (M8)', () => {
  const html = Buffer.from('<!doctype html><html><body>hi</body></html>');
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)]);
  const run = async (bytes: Buffer, mime = 'application/octet-stream') => {
    const { ctx } = ctxWith({}, { 'https://gateway.pinata.cloud/ipfs/anim': { bytes, mime } });
    return (await loadMedia(cfg, new Map([['1', meta('1', { animation: 'ipfs://anim' })]]), ctx)).get('1')!.animation;
  };

  it('keeps extensionless html and video animation_urls after sniffing', async () => {
    expect((await run(html))?.kind).toBe('html');
    expect((await run(mp4))?.kind).toBe('video');
  });

  it('ignores animations that sniff as anything else', async () => {
    expect(await run(png, 'image/png')).toBeNull();
    expect(await run(Buffer.from('not media at all'))).toBeNull();
  });

  it('does not download animations that are plainly images by extension, or the same url as the image', async () => {
    const { ctx, download } = ctxWith({}, { 'https://a/i.gif': { bytes: png, mime: 'image/gif' } });
    const out = await loadMedia(
      cfg,
      new Map([
        ['1', meta('1', { image: 'https://a/i.gif', animation: 'https://a/i.gif' })],
        ['2', meta('2', { animation: 'https://a/x.png' })],
      ]),
      ctx,
    );
    expect(out.get('1')!.animation).toBeNull();
    expect(out.get('2')!.animation).toBeNull();
    expect(download.mock.calls.map((c) => c[0])).toEqual(['https://a/i.gif']);
  });
});

describe('processCollection Blockscout failures (M1)', () => {
  const mint: RawTransfer = { contract: '0xabc', tokenId: '1', from: ZERO, to: '0xa', fromEns: null, toEns: null, value: '1', txHash: '0xtx', logIndex: 0, blockNumber: 1, timestamp: '2024-01-01T00:00:00.000Z' };
  const seed = (dir: string) => {
    mkdirSync(join(dir, 'raw', 'transfers'), { recursive: true });
    writeFileSync(join(dir, 'raw', 'transfers', 'test.json'), JSON.stringify([mint]));
  };

  it('falls back to cached transfers and flags the run partial instead of aborting', async () => {
    const fetchJson = (async (url: string) => {
      if (url.includes('/transfers')) throw new Error('HTTP 503');
      if (url.includes('/transactions/')) throw new Error('HTTP 503');
      return { items: [], next_page_params: null };
    }) as unknown as FetchJson;
    const { ctx, dir } = ctxWith({ fetchJson });
    seed(dir);
    const st = await processCollection(cfg, ctx);
    expect(st.transfers).toEqual([mint]);
    expect(st.bsStatus).toBe('error');
    expect(st.mints.get('1')?.priceWei).toBeNull();
    expect(st.balances.get('1')?.get('0xa')).toBe(1n);
    expect(ctx.txValues).toEqual({}); // the failed lookup is not cached as a price
  });

  it('keeps cached tx values when only the tx lookup fails', async () => {
    const fetchJson = (async (url: string) => {
      if (url.includes('/transactions/')) throw new Error('HTTP 503');
      return { items: [], next_page_params: null };
    }) as unknown as FetchJson;
    const { ctx, dir } = ctxWith({ fetchJson, txValues: { '0xtx': '100' } });
    seed(dir);
    const st = await processCollection(cfg, ctx);
    expect(st.mints.get('1')?.priceWei).toBe('100');
    expect(st.bsStatus).toBe('ok');
  });
});

describe('loadMedia OpenSea fallback at full size', () => {
  const small = 'https://i2c.seadn.io/ethereum/0xabc/p.png';
  const full = `${small}?w=4000`;

  it('downloads the 4000 px source and remembers the original png link', async () => {
    const os = fakeOs(async () => small);
    const { ctx, download } = ctxWith({ os }, { [full]: { bytes: png, mime: 'image/png' } });
    const media = await loadMedia(cfg, new Map([['1', meta('1')]]), ctx);
    expect(download).toHaveBeenCalledWith(full);
    expect(download).not.toHaveBeenCalledWith(small);
    expect(media.get('1')!.image?.kind).toBe('image');
    expect(media.get('1')!.osImage).toBe(small);
  });

  it('keeps the cached raw url as it is (the transform happens at use time)', async () => {
    const os = fakeOs(async () => small);
    const { ctx } = ctxWith({ os }, { [full]: { bytes: png, mime: 'image/png' } });
    await loadMedia(cfg, new Map([['1', meta('1')]]), ctx);
    expect(JSON.parse(readFileSync(join(ctx.rawDir, 'os-images', 'test.json'), 'utf8'))['1'].url).toBe(small);
  });

  it('marks no osImage when the token had its own image', async () => {
    const os = fakeOs(async () => small);
    const { ctx } = ctxWith({ os }, { 'https://a/1.png': { bytes: png, mime: 'image/png' } });
    const media = await loadMedia(cfg, new Map([['1', meta('1', { image: 'https://a/1.png' })]]), ctx);
    expect(media.get('1')!.osImage).toBeUndefined();
  });
});
