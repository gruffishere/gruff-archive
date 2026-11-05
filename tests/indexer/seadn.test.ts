import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { sniffMime } from '../../indexer/media';
import { seadnFull, seadnOriginal } from '../../indexer/seadn';

const U = 'https://i2c.seadn.io/ethereum/0x72b1/c92a1c5e.png';

describe('seadnFull', () => {
  it('sets w=4000 on a seadn.io url without a query', () => {
    expect(seadnFull(U)).toBe(`${U}?w=4000`);
  });
  it('replaces any existing query', () => {
    expect(seadnFull(`${U}?w=500&auto=format`)).toBe(`${U}?w=4000`);
    expect(seadnFull(`${U}?format=png&w=2048`)).toBe(`${U}?w=4000`);
  });
  it('handles seadn.io itself and its subdomains only', () => {
    expect(seadnFull('https://seadn.io/a.png')).toBe('https://seadn.io/a.png?w=4000');
    expect(seadnFull('https://evilseadn.io/a.png')).toBe('https://evilseadn.io/a.png');
    expect(seadnFull('https://seadn.io.evil.com/a.png')).toBe('https://seadn.io.evil.com/a.png');
  });
  it('leaves every other url unchanged', () => {
    expect(seadnFull('https://arweave.net/abc?x=1')).toBe('https://arweave.net/abc?x=1');
    expect(seadnFull('ipfs://bafy/1.png')).toBe('ipfs://bafy/1.png');
    expect(seadnFull('not a url')).toBe('not a url');
  });
});

describe('seadnOriginal', () => {
  it('points a seadn.io url at the full-size png', () => {
    expect(seadnOriginal(`${U}?w=500`)).toBe(`${U}?format=png&w=4000`);
  });
  it('leaves other urls unchanged', () => {
    expect(seadnOriginal('https://example.com/a.png')).toBe('https://example.com/a.png');
  });
});

describe('avif decoding', () => {
  it('sharp decodes an avif (what seadn serves), sniffed as avif', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'avif-'));
    try {
      const file = join(dir, 'f.avif');
      await sharp({ create: { width: 8, height: 6, channels: 3, background: '#808080' } }).avif().toFile(file);
      const bytes = readFileSync(file);
      expect(sniffMime(bytes, '')).toBe('image/avif');
      const m = await sharp(bytes).metadata();
      expect([m.format, m.width, m.height]).toEqual(['heif', 8, 6]);
      const webp = await sharp(bytes).resize(4).webp().toBuffer();
      expect((await sharp(webp).metadata()).format).toBe('webp');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
