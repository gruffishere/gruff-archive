import type { TokenOut } from '../../indexer/aggregate/tokens';

export type MediaKind = 'img' | 'iframe' | 'video' | 'none';
export interface MediaChoice { kind: MediaKind; src: string | null; pixelated: boolean }
const NONE: MediaChoice = { kind: 'none', src: null, pixelated: false };

export function chooseMedia(t: TokenOut, size: 'thumb' | 'large'): MediaChoice {
  const img = t.image;
  if (size === 'large' && t.animation?.kind === 'html' && t.animation.file) return { kind: 'iframe', src: t.animation.file, pixelated: false };
  if (!img) return NONE;
  if (img.kind === 'video') return size === 'large' && img.file ? { kind: 'video', src: img.file, pixelated: false } : img.thumb ? { kind: 'img', src: img.thumb, pixelated: false } : NONE;
  if (img.kind === 'svg') {
    const src = (size === 'thumb' ? img.thumb : img.large) ?? img.file;
    return src ? { kind: 'img', src, pixelated: true } : NONE;
  }
  if (img.kind === 'html') return size === 'large' && img.file ? { kind: 'iframe', src: img.file, pixelated: false } : NONE;
  const src = size === 'thumb' ? img.thumb : (img.large ?? img.remote ?? img.thumb);
  return src ? { kind: 'img', src, pixelated: false } : NONE;
}

/** A still for a poster: the large rendition when it is a plain image, otherwise the thumb; never an animated file. */
export function stillSrc(t: TokenOut | undefined): string | null {
  if (!t) return null;
  const large = chooseMedia(t, 'large');
  if (large.kind === 'img' && !t.image?.animated && large.src && !/\.gif$/i.test(large.src)) return large.src;
  const thumb = chooseMedia(t, 'thumb');
  return thumb.kind === 'img' ? thumb.src : null;
}
