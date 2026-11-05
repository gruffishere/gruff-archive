import { describe, expect, it } from 'vitest';
import type { TokenOut } from '../../src/lib/data';
import { chooseMedia, stillSrc } from '../../src/lib/media';

const t = (p: Partial<TokenOut>) => ({ image: null, animation: null, ...p }) as TokenOut;

describe('chooseMedia', () => {
  it('uses webp sizes for static images', () => {
    const tok = t({ image: { kind: 'image', thumb: '/media/a-t.webp', large: '/media/a-l.webp', file: null } });
    expect(chooseMedia(tok, 'thumb')).toEqual({ kind: 'img', src: '/media/a-t.webp', pixelated: false });
    expect(chooseMedia(tok, 'large')).toEqual({ kind: 'img', src: '/media/a-l.webp', pixelated: false });
  });
  it('shows the original animated file large and the static frame as thumb', () => {
    const tok = t({ image: { kind: 'image', thumb: '/media/b-t.webp', large: '/media/b.gif', file: '/media/b.gif', animated: true } });
    expect(chooseMedia(tok, 'large').src).toBe('/media/b.gif');
    expect(chooseMedia(tok, 'thumb').src).toBe('/media/b-t.webp');
    const big = t({ image: { kind: 'image', thumb: '/media/c-t.webp', large: null, file: null, animated: true, remote: 'https://arweave.net/x' } });
    expect(chooseMedia(big, 'large').src).toBe('https://arweave.net/x');
  });
  it('renders svg pixel art crisp and html animations in an iframe', () => {
    const tok = t({ image: { kind: 'svg', thumb: '/media/f.svg', large: '/media/f.svg', file: '/media/f.svg' }, animation: { kind: 'html', thumb: null, large: null, file: '/media/f.html' } });
    expect(chooseMedia(tok, 'thumb')).toEqual({ kind: 'img', src: '/media/f.svg', pixelated: true });
    expect(chooseMedia(tok, 'large')).toEqual({ kind: 'iframe', src: '/media/f.html', pixelated: false });
  });
  it('handles video and missing media', () => {
    expect(chooseMedia(t({ image: { kind: 'video', thumb: null, large: null, file: '/media/v.mp4' } }), 'large')).toEqual({ kind: 'video', src: '/media/v.mp4', pixelated: false });
    expect(chooseMedia(t({}), 'large')).toEqual({ kind: 'none', src: null, pixelated: false });
    expect(chooseMedia(t({ animation: { kind: 'html', thumb: null, large: null, file: '/media/p.html' } }), 'thumb').kind).toBe('none');
  });
  it('never returns an img without a src', () => {
    expect(chooseMedia(t({ image: { kind: 'svg', thumb: null, large: null, file: null } }), 'thumb')).toEqual({ kind: 'none', src: null, pixelated: false });
    expect(chooseMedia(t({ image: { kind: 'image', thumb: null, large: null, file: null } }), 'large')).toEqual({ kind: 'none', src: null, pixelated: false });
  });
});

describe('stillSrc', () => {
  it('uses the large rendition of a plain image', () => {
    expect(stillSrc(t({ image: { kind: 'image', thumb: '/media/a-t.webp', large: '/media/a-l.webp', file: null } }))).toBe('/media/a-l.webp');
  });
  it('never returns an animated file: the thumb instead', () => {
    expect(stillSrc(t({ image: { kind: 'image', thumb: '/media/b-t.webp', large: '/media/b.gif', file: '/media/b.gif', animated: true } }))).toBe('/media/b-t.webp');
  });
  it('is null without a cover', () => {
    expect(stillSrc(undefined)).toBeNull();
    expect(stillSrc(t({}))).toBeNull();
  });
});
