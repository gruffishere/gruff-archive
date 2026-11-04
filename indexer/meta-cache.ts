import { gunzipSync, gzipSync } from 'node:zlib';
import type { TokenMeta } from './types';

/**
 * Compact on-disk form of a token's image/animation so the raw caches stay small:
 * - `animation: '=image'` when it equals the image;
 * - data URIs over GZIP_MIN chars are stored as `gz:<base64 of gzip(utf8)>`.
 * Reading (`unpack*`) restores the full values transparently.
 */
const SAME_AS_IMAGE = '=image';
const GZ = 'gz:';
const GZIP_MIN = 512;

export interface PackedFields {
  image: string | null;
  animation: string | null;
}

/** Gzip with the header OS byte pinned (3 = Unix), so Windows and Linux produce identical bytes. */
const gzipStable = (v: string): Buffer => {
  const out = gzipSync(Buffer.from(v, 'utf8'), { level: 9 });
  out[9] = 3;
  return out;
};

const squeeze = (v: string | null): string | null => (v !== null && v.startsWith('data:') && v.length >= GZIP_MIN ? GZ + gzipStable(v).toString('base64') : v);

const expand = (v: string | null): string | null => (v !== null && v.startsWith(GZ) ? gunzipSync(Buffer.from(v.slice(GZ.length), 'base64')).toString('utf8') : v);

export function packFields(image: string | null, animation: string | null): PackedFields {
  return {
    image: squeeze(image),
    animation: animation !== null && animation === image ? SAME_AS_IMAGE : squeeze(animation),
  };
}

export function unpackFields(p: PackedFields): PackedFields {
  const image = expand(p.image);
  return { image, animation: p.animation === SAME_AS_IMAGE ? image : expand(p.animation) };
}

/** Cached form of a TokenMeta; `dropDataUris` nulls inline data-URI payloads (a fallback source that is never needed). */
export function packTokenMeta(m: TokenMeta, opts: { dropDataUris?: boolean } = {}): TokenMeta {
  const keep = (v: string | null) => (opts.dropDataUris && v?.startsWith('data:') ? null : v);
  return { ...m, ...packFields(keep(m.image), keep(m.animation)) };
}

export const unpackTokenMeta = (m: TokenMeta): TokenMeta => ({ ...m, ...unpackFields(m) });
