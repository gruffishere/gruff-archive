import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collections } from '../../src/lib/data';
import { techniqueNotes } from '../../src/lib/technique-notes';

const notes = () => techniqueNotes(collections());

describe('technique notes', () => {
  it('has eight notes in the spec order', () => {
    expect(notes().map((n) => n.key)).toEqual(['vector', 'photoshop', 'touchdesigner', 'mathematics', 'pixel', 'three', 'onchain', 'ai']);
  });
  it('keeps the ai note bare', () => {
    const ai = notes().find((n) => n.key === 'ai')!;
    expect(ai.images).toEqual([]);
    expect(ai.links).toEqual([]);
    expect(ai.excerpt).toBeUndefined();
  });
  it('starts the vector links with gruffters and lists four', () => {
    const v = notes().find((n) => n.key === 'vector')!;
    expect(v.links[0]!.href).toBe('/c/gruffters/');
    expect(v.links).toHaveLength(4);
  });
  it('writes no em dash', () => {
    for (const n of notes()) {
      expect(JSON.stringify(n)).not.toContain('—');
    }
  });
  it('points every local image at a real file', () => {
    for (const n of notes()) for (const i of n.images) {
      expect(i.alt.length).toBeGreaterThan(0);
      expect(existsSync(`public${i.src}`), i.src).toBe(true);
    }
  });
  it('sets each method behind the lane it fed (the artist, 2026-11-06), with ai standing apart', () => {
    const lane = Object.fromEntries(notes().map((n) => [n.key, n.lane]));
    expect(lane).toEqual({
      vector: 'vector illustration',
      photoshop: 'vector illustration',
      touchdesigner: 'glitch art',
      mathematics: 'generative art',
      pixel: 'code art',
      three: 'code art',
      onchain: 'code art',
      ai: null,
    });
  });
  it('keeps the xcopy message whole: it is a screenshot of words, so it is fitted, not cropped', () => {
    const td = notes().find((n) => n.key === 'touchdesigner')!;
    expect(td.images.find((i) => i.src.endsWith('td-xcopy.webp'))!.fit).toBe('contain');
    expect(notes().flatMap((n) => n.images).filter((i) => i.fit === 'contain')).toHaveLength(1);
  });
  it('dates each method by the years its works span, so the tools are told under the chart, not in it', () => {
    const y = Object.fromEntries(notes().map((n) => [n.key, n.years]));
    expect(y.vector).toBe('2023–2026');
    expect(y.photoshop).toBe('2023–2026');
    expect(y.touchdesigner).toBe('2025–2026');
    expect(y.pixel).toBe('2026');
    expect(y.three).toBe('2026');
    expect(y.ai).toBeUndefined();
  });
});
