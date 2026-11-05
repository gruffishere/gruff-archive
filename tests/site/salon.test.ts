import { describe, expect, it } from 'vitest';
import { salonLayout, type SalonItem } from '../../src/lib/salon';

// deterministic pseudo-random items: tall, wide, square, some extreme
const items = (n: number): SalonItem[] => {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ratios = [1, 1, 0.66, 1.5, 0.75, 1.33, 0.5, 2.1, 1];
  return Array.from({ length: n }, (_, i) => ({ w: ratios[i % ratios.length]! * 100, h: 100, weight: 0.6 + rnd() * 1.2 }));
};
type R = { x: number; y: number; w: number; h: number };
const overlap = (a: R, b: R, gap = 0) =>
  a.x < b.x + b.w + gap - 1e-6 && b.x < a.x + a.w + gap - 1e-6 && a.y < b.y + b.h + gap - 1e-6 && b.y < a.y + a.h + gap - 1e-6;

function check(its: SalonItem[], W: number, gap: number) {
  const { rects, height } = salonLayout(its, W, gap);
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
  return { rects, height };
}

describe('salonLayout', () => {
  it('hangs the wall without overlaps, inside the container, with the aspect kept and an even gap', () => {
    for (const W of [1400, 1000, 768]) check(items(95), W, 28);
  });
  it('is deterministic', () => {
    const a = salonLayout(items(60), 1200, 28);
    expect(salonLayout(items(60), 1200, 28)).toEqual(a);
  });
  it('varies sizes and leaves no big holes', () => {
    const its = items(95);
    const { rects, height } = check(its, 1400, 28);
    const hs = new Set(rects.map((r) => Math.round(r.h / 10)));
    expect(hs.size).toBeGreaterThan(12);
    const area = rects.reduce((s, r) => s + (r.w + 28) * (r.h + 28), 0);
    expect(area / (1400 * (height + 28))).toBeGreaterThan(0.86);
  });
  it('handles empty input and a single piece', () => {
    expect(salonLayout([], 800, 24)).toEqual({ rects: [], height: 0 });
    check([{ w: 10, h: 100, weight: 1.8 }], 800, 24);
  });
  it('uses two equal columns below 768 px, shortest column first', () => {
    const its = items(20);
    const { rects } = salonLayout(its, 700, 12);
    const colW = (700 - 12) / 2;
    for (const r of rects) {
      expect(r.w).toBeCloseTo(colW, 3);
      expect([0, colW + 12].some((x) => Math.abs(x - r.x) < 1e-6)).toBe(true);
    }
    for (let i = 0; i < rects.length; i++) for (let j = 0; j < i; j++) expect(overlap(rects[i]!, rects[j]!, 11.99)).toBe(false);
    expect(rects[0]!.x).toBe(0);
    expect(rects[1]!.x).toBeCloseTo(colW + 12, 3);
    const shorter = rects[0]!.h <= rects[1]!.h ? rects[0]! : rects[1]!;
    expect(rects[2]!.x).toBe(shorter.x);
    expect(rects[2]!.y).toBeCloseTo(shorter.h + 12, 3);
  });
  it('uses one column below 380 px', () => {
    const its = items(5);
    const { rects, height } = salonLayout(its, 340, 12);
    let y = 0;
    for (const r of rects) {
      expect(r.x).toBe(0);
      expect(r.w).toBe(340);
      expect(r.y).toBeCloseTo(y, 3);
      y += r.h + 12;
    }
    expect(height).toBeCloseTo(y - 12, 3);
  });
  it('picks the mode from the viewport when given', () => {
    const { rects } = salonLayout(items(4), 358, 12, { viewport: 390 });
    expect(rects[0]!.w).toBeCloseTo((358 - 12) / 2, 3);
  });
});

describe('salonLayout tablet', () => {
  it('keeps tiles reasonably large at 800 px', () => {
    const { rects } = salonLayout(items(60), 800, 28);
    const sizes = rects.map((r) => Math.sqrt(r.w * r.h)).sort((a, b) => a - b);
    expect(sizes[Math.floor(sizes.length / 2)]!).toBeGreaterThanOrEqual(120);
    expect(Math.min(...rects.map((r) => Math.min(r.w, r.h)))).toBeGreaterThanOrEqual(56);
  });
});
