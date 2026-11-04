import { describe, expect, it } from 'vitest';
import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';
import { parseAcceptDrop, validateSnapshot } from '../../indexer/validate';

const col = (slug: string, works: number) => ({ slug, works }) as unknown as CollectionOut;
const tok = (id: string, withImage: boolean) =>
  ({ id, image: withImage ? { kind: 'image', thumb: '/media/x-t.webp', large: '/media/x-l.webp', file: null } : null, animation: null }) as unknown as TokenOut;

describe('validateSnapshot', () => {
  it('accepts a first run and lists tokens without media as missing', () => {
    const r = validateSnapshot(null, [col('a', 2)], {}, { a: [tok('1', true), tok('2', false)] });
    expect(r.errors).toEqual([]);
    expect(r.missingMedia).toEqual(['a #2']);
  });

  it('rejects a drop of more than 10% of works', () => {
    expect(validateSnapshot([col('a', 100)], [col('a', 89)], {}, { a: [] }).errors[0]).toMatch(/a: works dropped from 100 to 89/);
  });

  it('rejects a disappeared collection and lost media', () => {
    const r = validateSnapshot([col('a', 1), col('b', 1)], [col('a', 1)], { a: [tok('1', true)] }, { a: [tok('1', false)] });
    expect(r.errors).toEqual(['b: collection disappeared', 'a #1: lost its media']);
  });

  it('rejects duplicate slugs', () => {
    expect(validateSnapshot(null, [col('a', 1), col('a', 1)], {}, {}).errors).toContain('a: duplicate slug');
  });

  it('rejects a previously media-bearing token that vanished', () => {
    const r = validateSnapshot(null, [col('a', 1)], { a: [tok('1', true), tok('2', true), tok('3', false)] }, { a: [tok('1', true)] });
    expect(r.errors).toEqual(['a #2: disappeared']);
  });

  it('does not check token loss for slugs absent from the next snapshot', () => {
    expect(validateSnapshot(null, [], { a: [tok('1', true)] }, {}).errors).toEqual([]);
  });

  it('does not flag tokens whose media was dropped by the placeholder guard', () => {
    const skip = { a: new Set(['1']) };
    const r = validateSnapshot(null, [col('a', 1)], { a: [tok('1', true)] }, { a: [tok('1', false)] }, skip);
    expect(r.errors).toEqual([]);
    expect(r.missingMedia).toEqual(['a #1']);
    const gone = validateSnapshot(null, [col('a', 1)], { a: [tok('1', true), tok('2', true)] }, { a: [tok('2', true)] }, skip);
    expect(gone.errors).toEqual([]);
  });
});

describe('validateSnapshot with placeholder files (I2)', () => {
  const withFile = (id: string, file: string) =>
    ({ id, image: { kind: 'image', thumb: `/media/${file}-t.webp`, large: `/media/${file}-l.webp`, file: null }, animation: null }) as unknown as TokenOut;
  const skip = { a: new Set(['1']) };
  const files = { a: new Set(['ph-t.webp', 'ph-l.webp']) };

  it('exempts a token only when its previous media was the placeholder', () => {
    const r = validateSnapshot(null, [col('a', 1)], { a: [withFile('1', 'ph')] }, { a: [tok('1', false)] }, skip, files);
    expect(r.errors).toEqual([]);
    expect(r.missingMedia).toEqual(['a #1']);
  });

  it('still flags loss of a real (non-placeholder) image on a placeholder id', () => {
    const r = validateSnapshot(null, [col('a', 1)], { a: [withFile('1', 'real')] }, { a: [tok('1', false)] }, skip, files);
    expect(r.errors).toEqual(['a #1: lost its media']);
    const gone = validateSnapshot(null, [col('a', 1)], { a: [withFile('1', 'real'), tok('2', true)] }, { a: [tok('2', true)] }, skip, files);
    expect(gone.errors).toEqual(['a #1: disappeared']);
  });
});

describe('validateSnapshot accept-drop (I5)', () => {
  it('downgrades works-drop, disappeared collection, disappeared and lost-media errors for accepted slugs', () => {
    const r = validateSnapshot(
      [col('a', 100), col('b', 1), col('c', 1)],
      [col('a', 50), col('c', 1)],
      { a: [tok('1', true), tok('2', true)], c: [tok('1', true)] },
      { a: [tok('2', false)], c: [tok('1', false)] },
      {},
      {},
      new Set(['a', 'b']),
    );
    expect(r.errors).toEqual(['c #1: lost its media']);
    expect(r.warnings.sort()).toEqual(['a #1: disappeared', 'a #2: lost its media', 'a: works dropped from 100 to 50', 'b: collection disappeared'].sort());
    expect([...r.accepted].sort()).toEqual(['a', 'b']);
  });

  it('reports nothing accepted when no error was downgraded', () => {
    const r = validateSnapshot(null, [col('a', 1)], {}, { a: [] }, {}, {}, new Set(['a']));
    expect(r.warnings).toEqual([]);
    expect(r.accepted).toEqual([]);
  });

  it('parses the accept list from flag/env values', () => {
    expect([...parseAcceptDrop(' a, b ,,')].sort()).toEqual(['a', 'b']);
    expect(parseAcceptDrop(null).size).toBe(0);
    expect(parseAcceptDrop(undefined).size).toBe(0);
  });
});
