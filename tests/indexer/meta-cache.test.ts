import { describe, expect, it } from 'vitest';
import { packFields, packTokenMeta, unpackFields, unpackTokenMeta } from '../../indexer/meta-cache';
import type { TokenMeta } from '../../indexer/types';

const big = 'data:image/svg+xml;base64,' + Buffer.from('<svg>' + '<rect width="1" height="1"/>'.repeat(400) + '</svg>').toString('base64');

describe('meta cache packing (I4)', () => {
  it('stores animation as =image when it equals the image, and restores it', () => {
    const p = packFields('https://a/x.png', 'https://a/x.png');
    expect(p).toEqual({ image: 'https://a/x.png', animation: '=image' });
    expect(unpackFields(p)).toEqual({ image: 'https://a/x.png', animation: 'https://a/x.png' });
  });

  it('keeps a differing animation and nulls', () => {
    expect(packFields('i', 'a')).toEqual({ image: 'i', animation: 'a' });
    expect(packFields(null, null)).toEqual({ image: null, animation: null });
    expect(unpackFields({ image: null, animation: null })).toEqual({ image: null, animation: null });
  });

  it('gzips large data URIs and decompresses transparently', () => {
    const p = packFields(big, 'https://a/anim.html');
    expect(p.image!.startsWith('gz:')).toBe(true);
    expect(p.image!.length).toBeLessThan(big.length / 3);
    expect(unpackFields(p)).toEqual({ image: big, animation: 'https://a/anim.html' });
  });

  it('shares one compressed payload when image and animation are the same data URI', () => {
    const p = packFields(big, big);
    expect(p.animation).toBe('=image');
    expect(unpackFields(p).animation).toBe(big);
  });

  it('leaves small data URIs and plain urls uncompressed', () => {
    expect(packFields('data:image/svg+xml;base64,AAA', null).image).toBe('data:image/svg+xml;base64,AAA');
  });

  it('round-trips a whole TokenMeta and can drop data-URI payloads', () => {
    const m: TokenMeta = { tokenId: '5', name: 'n', description: 'd', image: big, animation: big };
    expect(unpackTokenMeta(packTokenMeta(m))).toEqual(m);
    expect(packTokenMeta(m, { dropDataUris: true })).toEqual({ tokenId: '5', name: 'n', description: 'd', image: null, animation: null });
    const http: TokenMeta = { tokenId: '6', name: null, description: null, image: 'https://h/6.png', animation: null };
    expect(packTokenMeta(http, { dropDataUris: true }).image).toBe('https://h/6.png');
  });
});
