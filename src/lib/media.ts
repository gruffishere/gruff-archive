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
