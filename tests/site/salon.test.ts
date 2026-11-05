import { describe, expect, it } from 'vitest';
import { bandTarget, salonLayout, type SalonItem } from '../../src/lib/salon';

// deterministic pseudo-random items: tall, wide, square, some extreme
const items = (n: number): SalonItem[] => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ratios = [1, 1, 0.66, 1.5, 0.75, 1.33, 0.5, 2.1, 1, 0.8, 1.78];
  return Array.from({ length: n }, (_, i) => ({ w: ratios[i % ratios.length]! * 100, h: 100, weight: 0.6 + rnd() * 1.2 }));
};
// a mix like the real wall: mostly squares and portraits, some landscapes
const typical = (n: number): SalonItem[] => {
  const ratios = [1, 0.8, 1, 0.75, 1.33, 1, 0.66, 1, 0.9, 1.5, 1, 0.8, 1, 1.78, 0.75, 1];
  return Array.from({ length: n }, (_, i) => ({ w: ratios[i % ratios.length]! * 100, h: 100, weight: 1 }));
};
// panoramas (3-6), very tall pieces (0.3) and the usual mix
const extremes = (n: number): SalonItem[] => {
  const base = [1, 0.75, 1, 0.66, 1.33, 1, 0.5, 1.5, 0.8, 1, 1.78, 0.75];
  return Array.from({ length: n }, (_, i) => {
    const r = i % 29 === 5 ? 4.5 : i % 41 === 9 ? 5.8 : i % 19 === 7 ? 3 : i % 7 === 3 ? 0.3 : base[i % base.length]!;
    return { w: r * 100, h: 100, weight: 1 };
  });
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
  it('justifies every band but an unjustified last one to the container width', () => {
    for (const [W, gap] of [[1440, 26], [1000, 26], [358, 14]] as const) {
      const { rects, bands } = check(items(95), W, gap);
      bands.forEach((b, bi) => {
        const inBand = rects.filter((r) => Math.abs(r.y - b.y) < b.h && r.y >= b.y - 1e-6);
        const right = Math.max(...inBand.map((r) => r.x + r.w));
        if (b.justified) expect(Math.abs(right - W)).toBeLessThan(1);
        else expect(bi).toBe(bands.length - 1);
      });
    }
  });
  const cases: Array<[string, SalonItem[], number, number, number | undefined]> = [
    ['1440 x95', items(95), 1440, 26, undefined],
    ['1326 x101', items(101), 1326, 26, undefined],
    ['1000 x60', items(60), 1000, 26, undefined],
    ['800 x60', items(60), 800, 26, undefined],
    ['768 x60', items(60), 768, 26, undefined],
    ['358 x95', items(95), 358, 14, 390],
    ['358 x60', items(60), 358, 14, 390],
    ['700 x40', items(40), 700, 14, 700],
    ['1440 extremes', extremes(84), 1440, 26, undefined],
    ['1000 extremes', extremes(60), 1000, 26, undefined],
    ['800 extremes', extremes(60), 800, 26, undefined],
    ['358 extremes', extremes(60), 358, 14, 390],
  ];
  it.each(cases)('keeps every band (last one aside, if left-aligned) within the target range: %s', (_n, its, W, gap, vw) => {
    const { bands } = check(its, W, gap, vw);
    const Ht = bandTarget(W, (vw ?? W) < 768);
    bands.forEach((b, bi) => {
      if (!b.justified) { expect(bi).toBe(bands.length - 1); expect(b.h).toBeCloseTo(Ht, 3); return; }
      expect(b.h).toBeGreaterThanOrEqual(Ht * 0.9 - 1e-6);
      expect(b.h).toBeLessThanOrEqual(Ht * 1.09 + 1e-6);
    });
  });
  it('lands in the spec heights at 1440 (560-720) and on a phone (360-440)', () => {
    check(items(95), 1440, 26).bands.forEach((b) => { if (b.justified) { expect(b.h).toBeGreaterThanOrEqual(560); expect(b.h).toBeLessThanOrEqual(720); } });
    check(items(95), 358, 14, 390).bands.forEach((b) => { if (b.justified) { expect(b.h).toBeGreaterThanOrEqual(360); expect(b.h).toBeLessThanOrEqual(440); } });
  });
  it('puts about 8-16 pieces in a desktop band at 1440', () => {
    const { bands } = check(typical(101), 1326, 26);
    const body = bands.slice(0, -1);
    body.forEach((b) => { expect(b.count).toBeGreaterThanOrEqual(5); expect(b.count).toBeLessThanOrEqual(18); });
    const mean = body.reduce((sum, b) => sum + b.count, 0) / body.length;
    expect(mean).toBeGreaterThanOrEqual(8);
    expect(mean).toBeLessThanOrEqual(16);
  });
  it('hangs a wall in well under 40 ms', () => {
    salonLayout(items(101), 1326, 26);
    for (const [W, gap] of [[1326, 26], [358, 14]] as const) {
      const t = performance.now();
      salonLayout(items(101), W, gap);
      expect(performance.now() - t).toBeLessThan(40);
    }
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
