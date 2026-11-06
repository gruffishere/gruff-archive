import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const dir = 'public/techniques';
describe('techniques assets', () => {
  it('has every note image, web-sized', async () => {
    for (const f of ['vector-1', 'vector-2', 'td-network', 'td-shoot', 'td-xcopy', 'pixel-grid', 'photoshop-a', 'photoshop-b', 'math-phigures']) {
      const p = `${dir}/${f}.webp`;
      expect(existsSync(p), p).toBe(true);
      const m = await sharp(p).metadata();
      expect(Math.max(m.width!, m.height!), p).toBeLessThanOrEqual(1200);
    }
    const v = await sharp(`${dir}/vector-1.webp`).metadata();
    expect(v.width).toBe(v.height);
    expect((await sharp(`${dir}/pixel-grid.webp`).metadata()).width).toBe(840);
  });
  it('keeps an eight-line excerpt of a real on-chain FACETS svg', () => {
    const lines = readFileSync('src/content/techniques/facets-onchain.txt', 'utf8').trimEnd().split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toMatch(/^<svg viewBox="0 0 35 35"/);
    expect(lines.slice(2).every((l) => /^<path fill="#[0-9a-f]{6}" d="M\d/.test(l))).toBe(true);
  });
});
