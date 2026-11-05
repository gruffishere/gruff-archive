import { describe, expect, it } from 'vitest';
import { bandTarget, salonLayout, type SalonItem } from '../../src/lib/salon';

// deterministic pseudo-random items: tall, wide, square, some extreme
const items = (n: number): SalonItem[] => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ratios = [1, 1, 0.66, 1.5, 0.75, 1.33, 0.5, 2.1, 1, 0.8, 1.78];
  return Array.from({ length: n }, (_, i) => ({ w: ratios[i % ratios.length]! * 100, h: 100, weight: 0.6 + rnd() * 1.2 }));
};
type R = { x: number; y: number; w: number; h: number };
const overlap = (a: R, b: R, gap = 0) =>
  a.x < b.x + b.w + gap - 1e-6 && b.x < a.x + a.w + gap - 1e-6 && a.y < b.y + b.h + gap - 1e-6 && b.y < a.y + a.h + gap - 1e-6;

function check(its: SalonItem[], W: number, gap: number, vw?: number) {
  const res = salonLayout(its, W, gap, { viewport: vw });
  const { rects, height, bands } = res;
  expect(rects).toHaveLength(its.length);
  rects.forEach((r, i) => {
    expect(r.x).toBeGreaterThanOrEqual(-1e-6);
    expect(r.y).toBeGreaterThanOrEqual(-1e-6);
    expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6);
    expect(r.y + r.h).toBeLessThanOrEqual(height + 1e-6);
    const ratio = its[i]!.w / its[i]!.h;
    expect(Math.abs(r.w / r.h / ratio - 1)).toBeLessThan(0.01);
    for (let j = 0; j < i; j++) expect(overlap(r, rects[j]!, gap - 0.01)).toBe(false);
  });
  expect(bands.reduce((s, b) => s + b.count, 0)).toBe(its.length);
  return res;
}

describe('salonLayout bands', () => {
  it('hangs without overlaps, inside the container, aspect kept, even gaps', () => {
    for (const W of [1400, 1000, 768]) check(items(95), W, 26);
  });
  it('justifies every full band to the container width', () => {
    for (const [W, gap] of [[1440, 26], [1000, 26], [358, 14]] as const) {
      const { rects, bands } = check(items(95), W, gap);
      bands.forEach((b, bi) => {
        const inBand = rects.filter((r) => r.y >= b.y - 1e-6 && r.y < b.y + b.h - 1e-6 && Math.abs(r.y - b.y) < b.h);
        const right = Math.max(...inBand.filter((r) => r.y + r.h > b.y).map((r) => r.x + r.w));
        if (b.justified) expect(Math.abs(right - W)).toBeLessThan(1);
        else expect(bi).toBe(bands.length - 1);
      });
      expect(bands.slice(0, -1).every((b) => b.justified)).toBe(true);
    }
  });
  it('keeps band heights in the target range at 1440 and on a phone', () => {
    const d = check(items(95), 1440, 26);
    d.bands.slice(0, -1).forEach((b) => { expect(b.h).toBeGreaterThanOrEqual(560); expect(b.h).toBeLessThanOrEqual(720); });
    const p = check(items(95), 358, 14, 390);
    p.bands.slice(0, -4).forEach((b) => { expect(b.h).toBeGreaterThanOrEqual(360); expect(b.h).toBeLessThanOrEqual(440); });
    expect(bandTarget(1440, false)).toBeGreaterThanOrEqual(560);
  });
  it('puts about 10-15 pieces in a desktop band', () => {
    const { bands } = check(items(95), 1440, 26);
    bands.slice(0, -1).forEach((b) => { expect(b.count).toBeGreaterThanOrEqual(5); expect(b.count).toBeLessThanOrEqual(18); });
  });
  it('mixes block types: tall singles, stacks and rows', () => {
    const { rects } = check(items(95), 1440, 26);
    const sameX = rects.filter((r) => rects.some((o) => o !== r && Math.abs(o.x - r.x) < 0.01 && Math.abs(o.w - r.w) < 0.01 && o.y > r.y)).length;
    const sameY = rects.filter((r) => rects.some((o) => o !== r && Math.abs(o.y - r.y) < 0.01 && Math.abs(o.h - r.h) < 0.01 && o.x > r.x)).length;
    expect(sameX).toBeGreaterThan(10);
    expect(sameY).toBeGreaterThan(5);
    expect(new Set(rects.map((r) => Math.round(r.h / 20))).size).toBeGreaterThan(10);
  });
  it('is deterministic', () => {
    const a = salonLayout(items(60), 1200, 26);
    expect(salonLayout(items(60), 1200, 26)).toEqual(a);
  });
  it('handles empty input and a single piece', () => {
    expect(salonLayout([], 800, 24)).toEqual({ rects: [], height: 0, bands: [] });
    check([{ w: 10, h: 100, weight: 1.8 }], 800, 24);
  });
  it('leaves a short last band left-aligned instead of blowing it up', () => {
    const { bands, rects } = check(items(3), 1440, 26);
    expect(bands[0]!.justified).toBe(false);
    expect(Math.min(...rects.map((r) => r.x))).toBe(0);
  });
  it('uses bands below 768 px with no horizontal overflow, one column below 380 px', () => {
    check(items(40), 700, 14);
    const { rects, height } = salonLayout(items(5), 340, 12);
    let y = 0;
    for (const r of rects) { expect(r.x).toBe(0); expect(r.w).toBe(340); expect(r.y).toBeCloseTo(y, 3); y += r.h + 12; }
    expect(height).toBeCloseTo(y - 12, 3);
  });
  it('picks the mode from the viewport when given', () => {
    const one = salonLayout(items(4), 358, 12, { viewport: 390 });
    expect(one.bands.length).toBeLessThan(4);
  });
});
