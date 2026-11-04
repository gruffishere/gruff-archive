import { describe, expect, it } from 'vitest';
import { findPlaceholderImages, stripPlaceholders } from '../../indexer/placeholder';
import type { TokenMeta } from '../../indexer/types';

const metas = (images: (string | null)[], animations: (string | null)[] = []): Map<string, TokenMeta> =>
  new Map(images.map((image, i) => [String(i + 1), { tokenId: String(i + 1), name: null, description: null, image, animation: animations[i] ?? null }]));

describe('placeholder guard', () => {
  it('flags an image shared by at least half of >=10 tokens', () => {
    const m = metas([...Array(5).fill('shared'), 'a', 'b', 'c', 'd', 'e']);
    expect([...findPlaceholderImages(m)]).toEqual(['shared']);
  });

  it('ignores small collections and minority duplicates', () => {
    expect(findPlaceholderImages(metas(['s', 's', 's', 'x'])).size).toBe(0);
    expect(findPlaceholderImages(metas([...Array(4).fill('s'), ...'abcdefg'.split('')])).size).toBe(0);
  });

  it('nulls the image of the affected tokens and reports the count', () => {
    const m = metas([...Array(6).fill('shared'), 'a', 'b', 'c', 'd']);
    const r = stripPlaceholders(m);
    expect(r.count).toBe(6);
    expect(m.get('1')!.image).toBeNull();
    expect(m.get('7')!.image).toBe('a');
  });

  it('reports the affected token ids', () => {
    const m = metas([...Array(6).fill('shared'), 'a', 'b', 'c', 'd']);
    expect([...stripPlaceholders(m).ids].sort()).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('applies the same shared-source check to animation', () => {
    const imgs = 'abcdefghij'.split('');
    const m = metas(imgs, [...Array(6).fill('shared.html'), null, null, null, 'u.html']);
    const r = stripPlaceholders(m);
    expect(r.count).toBe(6);
    expect(m.get('1')!.animation).toBeNull();
    expect(m.get('10')!.animation).toBe('u.html');
    expect(m.get('1')!.image).toBe('a');
    expect([...r.ids].sort()).toEqual(['1', '2', '3', '4', '5', '6']);
  });
});

describe('placeholder sources (I2)', () => {
  it('reports the stripped image and animation sources', () => {
    const imgs = [...Array(6).fill('shared'), 'a', 'b', 'c', 'd'];
    const m = metas(imgs, [...Array(6).fill('shared.html'), null, null, null, null]);
    const r = stripPlaceholders(m);
    expect([...r.sources].sort()).toEqual(['shared', 'shared.html']);
  });
});
