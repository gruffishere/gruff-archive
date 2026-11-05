import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  candidateUrls,
  createDownloader,
  decodeDataUri,
  gcMedia,
  MAX_ORIGINAL_BYTES,
  MAX_VIDEO_BYTES,
  sniffMime,
  storeMedia,
  type ManifestEntry,
} from '../../indexer/media';

describe('candidateUrls', () => {
  it('rewrites ipfs urls to working gateways', () => {
    expect(candidateUrls('ipfs://QmA/b.png')).toEqual(['https://gateway.pinata.cloud/ipfs/QmA/b.png', 'https://ipfs.filebase.io/ipfs/QmA/b.png']);
    expect(candidateUrls('https://dweb.link/ipfs/QmB/media')[0]).toBe('https://gateway.pinata.cloud/ipfs/QmB/media');
  });
  it('maps ar:// and keeps plain urls', () => {
    expect(candidateUrls('ar://XYZ')).toEqual(['https://arweave.net/XYZ']);
    expect(candidateUrls('https://arweave.net/XYZ')).toEqual(['https://arweave.net/XYZ']);
  });
});

describe('decodeDataUri / sniffMime', () => {
  it('decodes utf8 svg and base64 html', () => {
    expect(decodeDataUri('data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E')?.bytes.toString()).toBe('<svg></svg>');
    const html = decodeDataUri(`data:text/html;base64,${Buffer.from('<!doctype html><p>x').toString('base64')}`);
    expect(html?.mime).toBe('text/html');
    expect(sniffMime(html!.bytes, '')).toBe('text/html');
  });
  it('sniffs binary formats over a wrong header', () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'application/octet-stream')).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('GIF89a'), '')).toBe('image/gif');
  });
  it('classifies ISO-BMFF ftyp boxes by brand', () => {
    const ftyp = (brand: string) => Buffer.concat([Buffer.alloc(4), Buffer.from(`ftyp${brand}`)]);
    expect(sniffMime(ftyp('avif'), '')).toBe('image/avif');
    expect(sniffMime(ftyp('avis'), '')).toBe('image/avif');
    for (const brand of ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1']) expect(sniffMime(ftyp(brand), '')).toBe('image/heic');
    expect(sniffMime(ftyp('isom'), '')).toBe('video/mp4');
    expect(sniffMime(ftyp('mp42'), '')).toBe('video/mp4');
  });
});

describe('storeMedia', () => {
  it('writes a thumb and a large webp and reuses the manifest', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'media-'));
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#ff0000' } }).png().toBuffer();
    let downloads = 0;
    const deps = { outDir, publicPrefix: '/media', download: async () => (downloads++, { bytes: png, mime: 'application/octet-stream' }) };
    const manifest: Record<string, ManifestEntry> = {};
    const a = await storeMedia('ipfs://QmPng', deps, manifest);
    const b = await storeMedia('ipfs://QmPng', deps, manifest);
    expect(a?.kind).toBe('image');
    expect(b).toEqual(a);
    expect(downloads).toBe(1);
    const thumb = await sharp(join(outDir, a!.thumb!.replace('/media/', ''))).metadata();
    const large = await sharp(join(outDir, a!.large!.replace('/media/', ''))).metadata();
    expect([thumb.width, thumb.format]).toEqual([480, 'webp']);
    expect(large.width).toBe(1600);
  });

  it('stores svg data uris as files', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'media-'));
    const s = await storeMedia('data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', { outDir, publicPrefix: '/media', download: async () => null }, {});
    expect(s?.kind).toBe('svg');
    expect(readdirSync(outDir)).toHaveLength(1);
  });

  it('remembers failures for 6 hours', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'media-'));
    let tries = 0;
    const deps = { outDir, publicPrefix: '/media', download: async () => (tries++, null) };
    const manifest: Record<string, ManifestEntry> = {};
    await storeMedia('https://dead.test/a.png', deps, manifest, new Date('2026-01-01'));
    await storeMedia('https://dead.test/a.png', deps, manifest, new Date('2026-01-01T03:00:00Z'));
    expect(tries).toBe(1);
    await storeMedia('https://dead.test/a.png', deps, manifest, new Date('2026-01-01T07:00:00Z'));
    expect(tries).toBe(2);
  });
});

describe('storeMedia hardening', () => {
  const newDir = () => mkdtempSync(join(tmpdir(), 'media-'));
  const redPng = () => sharp({ create: { width: 100, height: 100, channels: 3, background: '#ff0000' } }).png().toBuffer();

  it('returns null without a manifest entry when every candidate was skipped', async () => {
    const outDir = newDir();
    const manifest: Record<string, ManifestEntry> = {};
    const deps = { outDir, publicPrefix: '/media', download: async () => 'skipped' as const };
    expect(await storeMedia('ipfs://QmSkipped', deps, manifest)).toBeNull();
    expect(manifest).toEqual({});
  });

  it('records a failure when at least one candidate was actually tried', async () => {
    const outDir = newDir();
    const manifest: Record<string, ManifestEntry> = {};
    const results: Array<'skipped' | null> = ['skipped', null];
    const deps = { outDir, publicPrefix: '/media', download: async () => results.shift() ?? null };
    expect(await storeMedia('ipfs://QmMixed', deps, manifest)).toBeNull();
    expect(Object.values(manifest)).toHaveLength(1);
    expect(Object.values(manifest)[0]).toHaveProperty('failedAt');
  });

  it('falls back to the next gateway when the first candidate fails', async () => {
    const outDir = newDir();
    const png = await redPng();
    const urls: string[] = [];
    const manifest: Record<string, ManifestEntry> = {};
    const deps = {
      outDir,
      publicPrefix: '/media',
      download: async (url: string) => {
        urls.push(url);
        return urls.length === 1 ? null : { bytes: png, mime: 'image/png' };
      },
    };
    const stored = await storeMedia('ipfs://QmFallback/x.png', deps, manifest);
    expect(stored?.kind).toBe('image');
    expect(urls).toEqual(['https://gateway.pinata.cloud/ipfs/QmFallback/x.png', 'https://ipfs.filebase.io/ipfs/QmFallback/x.png']);
  });

  it('records failedAt and leaves no files when sharp cannot decode the bytes', async () => {
    const outDir = newDir();
    const manifest: Record<string, ManifestEntry> = {};
    const deps = { outDir, publicPrefix: '/media', download: async () => ({ bytes: Buffer.from('definitely not an image'), mime: 'image/png' }) };
    await expect(storeMedia('https://bad.test/a.png', deps, manifest)).resolves.toBeNull();
    expect(Object.values(manifest)).toHaveLength(1);
    expect(Object.values(manifest)[0]).toHaveProperty('failedAt');
    expect(readdirSync(outDir)).toEqual([]);
  });

  it('records failedAt for oversize videos', async () => {
    const outDir = newDir();
    const manifest: Record<string, ManifestEntry> = {};
    const bytes = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(MAX_VIDEO_BYTES + 1 - 12)]);
    expect(bytes.length).toBe(MAX_VIDEO_BYTES + 1);
    const deps = { outDir, publicPrefix: '/media', download: async () => ({ bytes, mime: 'video/mp4' }) };
    expect(await storeMedia('https://big.test/v.mp4', deps, manifest)).toBeNull();
    expect(Object.values(manifest)).toHaveLength(1);
    expect(Object.values(manifest)[0]).toHaveProperty('failedAt');
    expect(readdirSync(outDir)).toEqual([]);
  });

  it('applies EXIF orientation before resizing', async () => {
    const outDir = newDir();
    const jpeg = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#00ff00' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).orientation).toBe(6);
    const deps = { outDir, publicPrefix: '/media', download: async () => ({ bytes: jpeg, mime: 'image/jpeg' }) };
    const stored = await storeMedia('https://exif.test/a.jpg', deps, {});
    const thumb = await sharp(join(outDir, stored!.thumb!.replace('/media/', ''))).metadata();
    expect(thumb.height!).toBeGreaterThan(thumb.width!);
  });
});

describe('storeMedia animated images', () => {
  const newDir = () => mkdtempSync(join(tmpdir(), 'media-'));
  const frame = (color: string) => sharp({ create: { width: 600, height: 400, channels: 3, background: color } }).png().toBuffer();
  const animatedGif = async () =>
    sharp([await frame('#ff0000'), await frame('#0000ff')], { join: { animated: true } }).gif({ delay: [100, 100] }).toBuffer();

  it('keeps the original gif and makes a static first-frame thumb', async () => {
    const outDir = newDir();
    const gif = await animatedGif();
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(2);
    const deps = { outDir, publicPrefix: '/media', download: async () => ({ bytes: gif, mime: 'image/gif' }) };
    const stored = await storeMedia('https://anim.test/a.gif', deps, {});
    expect(stored?.animated).toBe(true);
    expect(stored?.large).toMatch(/^\/media\/[0-9a-f]{16}\.gif$/);
    expect(stored?.file).toBe(stored?.large);
    expect(readFileSync(join(outDir, stored!.large!.replace('/media/', '')))).toEqual(gif);
    const thumb = await sharp(join(outDir, stored!.thumb!.replace('/media/', ''))).metadata();
    expect(thumb.format).toBe('webp');
    expect(thumb.pages ?? 1).toBe(1);
    expect(thumb.width!).toBeLessThanOrEqual(480);
    expect(readdirSync(outDir).filter((f) => f.endsWith('-l.webp'))).toEqual([]);
  });

  it('stores only the thumb when the original exceeds MAX_ORIGINAL_BYTES', async () => {
    const outDir = newDir();
    const gif = await animatedGif();
    const big = Buffer.concat([gif, Buffer.alloc(MAX_ORIGINAL_BYTES + 1)]); // trailing bytes after the GIF trailer
    expect((await sharp(big, { animated: true }).metadata()).pages).toBe(2);
    const deps = { outDir, publicPrefix: '/media', download: async () => ({ bytes: big, mime: 'image/gif' }) };
    const stored = await storeMedia('https://anim.test/big.gif', deps, {});
    expect(stored).toMatchObject({ kind: 'image', large: null, file: null, animated: true, remote: 'https://anim.test/big.gif' });
    expect(readdirSync(outDir)).toHaveLength(1);
    expect(readdirSync(outDir)[0]).toMatch(/-t\.webp$/);
  });

  it('still produces thumb and large webp for static images without an animated flag', async () => {
    const outDir = newDir();
    const png = await frame('#00ff00');
    const deps = { outDir, publicPrefix: '/media', download: async () => ({ bytes: png, mime: 'image/png' }) };
    const stored = await storeMedia('https://static.test/a.png', deps, {});
    expect(stored?.animated).toBeUndefined();
    expect(stored?.thumb).toMatch(/-t\.webp$/);
    expect(stored?.large).toMatch(/-l\.webp$/);
    expect(readdirSync(outDir).sort()).toHaveLength(2);
  });
});

describe('createDownloader', () => {
  it('does not give up on a host after repeated 404s', async () => {
    let calls = 0;
    const download = createDownloader({ fetchImpl: async () => (calls++, new Response('missing', { status: 404 })) });
    for (let i = 0; i < 4; i++) expect(await download('https://gone.test/a.png')).toBeNull();
    expect(calls).toBe(4);
  });

  it("gives up on a host after three 503s and returns 'skipped' without fetching", async () => {
    let calls = 0;
    const download = createDownloader({ fetchImpl: async () => (calls++, new Response('busy', { status: 503 })) });
    for (let i = 0; i < 3; i++) expect(await download('https://busy.test/a.png')).toBeNull();
    expect(await download('https://busy.test/a.png')).toBe('skipped');
    expect(calls).toBe(3);
    // other hosts are unaffected
    expect(await download('https://other.test/a.png')).toBeNull();
    expect(calls).toBe(4);
  });

  it('counts 429s and network errors, and a success resets the counter', async () => {
    const script: Array<number | 'throw'> = [429, 'throw', 200, 429, 'throw', 'throw'];
    let calls = 0;
    const download = createDownloader({
      fetchImpl: async () => {
        calls++;
        const step = script.shift();
        if (step === 'throw') throw new Error('socket hang up');
        return new Response(step === 200 ? 'ok' : 'slow down', { status: step ?? 200, headers: { 'content-type': 'image/png; charset=x' } });
      },
    });
    const url = 'https://flaky.test/a.png';
    expect(await download(url)).toBeNull(); // 429 (1)
    expect(await download(url)).toBeNull(); // throw (2)
    expect(await download(url)).toEqual({ bytes: Buffer.from('ok'), mime: 'image/png' }); // success resets
    expect(await download(url)).toBeNull(); // 429 (1)
    expect(await download(url)).toBeNull(); // throw (2)
    expect(await download(url)).toBeNull(); // throw (3)
    expect(await download(url)).toBe('skipped');
    expect(calls).toBe(6);
  });

  it('returns null for an invalid url instead of throwing', async () => {
    let calls = 0;
    const download = createDownloader({ fetchImpl: async () => (calls++, new Response('x')) });
    await expect(download('not a url')).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  it('defaults to a 300 s timeout', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const download = createDownloader({ fetchImpl: async () => new Response('ok') });
      await download('https://slow.test/a.png');
      expect(spy).toHaveBeenCalledWith(300_000);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('gcMedia', () => {
  it('removes unreferenced files and their manifest entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gc-'));
    writeFileSync(join(dir, 'keep-t.webp'), 'x');
    writeFileSync(join(dir, 'drop.svg'), 'x');
    const manifest: Record<string, ManifestEntry> = {
      k1: { kind: 'image', thumb: '/media/keep-t.webp', large: '/media/keep-t.webp', file: null },
      k2: { kind: 'svg', thumb: '/media/drop.svg', large: '/media/drop.svg', file: '/media/drop.svg' },
    };
    expect(gcMedia(dir, new Set(['keep-t.webp']), manifest)).toBe(1);
    expect(readdirSync(dir)).toEqual(['keep-t.webp']);
    expect(Object.keys(manifest)).toEqual(['k1']);
  });
});
