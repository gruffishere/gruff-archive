import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type SharpOptions } from 'sharp';

export interface StoredMedia {
  kind: 'image' | 'svg' | 'html' | 'video';
  thumb: string | null;
  large: string | null;
  file: string | null;
  /** Animated source: `large`/`file` are the untouched original (or null when too big), `thumb` is a static first frame. */
  animated?: true;
  /** Source URL to load the original from when it was too large to store. */
  remote?: string;
}
export type ManifestEntry = StoredMedia | { failedAt: string };
export interface MediaDeps {
  /** `'skipped'` means the host was not contacted because it is in give-up state. */
  download: (url: string) => Promise<{ bytes: Buffer; mime: string } | null | 'skipped'>;
  outDir: string;
  publicPrefix: string;
}

export const IPFS_GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.filebase.io/ipfs/'];
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_ORIGINAL_BYTES = 24 * 1024 * 1024;
const RETRY_FAILED_AFTER_MS = 7 * 24 * 3600 * 1000;
const MAX_INPUT_PIXELS = 1_000_000_000;
const MAX_HOST_FAILURES = 3;
const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1']);

/** Key of a source url in the media manifest. */
export const manifestKey = (src: string): string => createHash('sha256').update(src).digest('hex').slice(0, 24);

export function extractIpfsPath(src: string): string | null {
  if (src.startsWith('ipfs://')) return src.slice(7).replace(/^ipfs\//, '');
  const m = src.match(/\/ipfs\/(.+)$/);
  return m ? m[1] : null;
}

export function candidateUrls(src: string): string[] {
  if (src.startsWith('data:')) return [src];
  const ipfs = extractIpfsPath(src);
  if (ipfs) return IPFS_GATEWAYS.map((g) => g + ipfs);
  if (src.startsWith('ar://')) return [`https://arweave.net/${src.slice(5)}`];
  return [src];
}

export function decodeDataUri(src: string): { bytes: Buffer; mime: string } | null {
  const m = src.match(/^data:([^,;]+)((?:;[^,;]*)*),(.*)$/s);
  if (!m) return null;
  if (m[2].includes(';base64')) return { bytes: Buffer.from(m[3], 'base64'), mime: m[1] };
  let text = m[3];
  try {
    text = decodeURIComponent(m[3]);
  } catch {
    // already plain text
  }
  return { bytes: Buffer.from(text, 'utf8'), mime: m[1] };
}

export function sniffMime(b: Buffer, hint: string): string {
  const ascii = (start: number, end: number) => b.subarray(start, end).toString('latin1');
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (AVIF_BRANDS.has(brand)) return 'image/avif';
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
    return 'video/mp4';
  }
  const head = b.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'text/html';
  return hint || 'application/octet-stream';
}

export const isStored = (e: ManifestEntry | undefined): e is StoredMedia => !!e && 'kind' in e;

export async function storeMedia(
  src: string,
  deps: MediaDeps,
  manifest: Record<string, ManifestEntry>,
  now = new Date(),
): Promise<StoredMedia | null> {
  const key = manifestKey(src);
  const prev = manifest[key];
  if (isStored(prev)) return prev;
  if (prev && now.getTime() - Date.parse(prev.failedAt) < RETRY_FAILED_AFTER_MS) return null;

  const fail = (): null => {
    manifest[key] = { failedAt: now.toISOString() };
    return null;
  };

  let got: { bytes: Buffer; mime: string } | null = null;
  let gotUrl = src;
  let tried = false; // true once at least one candidate was actually attempted
  if (src.startsWith('data:')) {
    tried = true;
    got = decodeDataUri(src);
  } else
    for (const url of candidateUrls(src)) {
      const res = await deps.download(url);
      if (res === 'skipped') continue;
      tried = true;
      if (res) {
        got = res;
        gotUrl = url;
        break;
      }
    }
  if (!got) {
    // Every candidate host was in give-up state: say nothing, so the source is retried next run.
    if (!tried) return null;
    return fail();
  }

  const mime = sniffMime(got.bytes, got.mime);
  const hash = createHash('sha256').update(got.bytes).digest('hex').slice(0, 16);
  const pub = (f: string) => `${deps.publicPrefix}/${f}`;
  const created: string[] = []; // files this attempt created, removed again if the attempt fails
  const write = (name: string, bytes: Buffer) => {
    const path = join(deps.outDir, name);
    if (!existsSync(path)) created.push(path);
    writeFileSync(path, bytes);
  };

  let stored: StoredMedia;
  try {
    mkdirSync(deps.outDir, { recursive: true });
    if (mime === 'image/svg+xml') {
      write(`${hash}.svg`, got.bytes);
      stored = { kind: 'svg', thumb: pub(`${hash}.svg`), large: pub(`${hash}.svg`), file: pub(`${hash}.svg`) };
    } else if (mime === 'text/html') {
      write(`${hash}.html`, got.bytes);
      stored = { kind: 'html', thumb: null, large: null, file: pub(`${hash}.html`) };
    } else if (mime.startsWith('video/')) {
      if (got.bytes.length > MAX_VIDEO_BYTES) return fail();
      write(`${hash}.mp4`, got.bytes);
      stored = { kind: 'video', thumb: null, large: null, file: pub(`${hash}.mp4`) };
    } else if (mime.startsWith('image/')) {
      const writeThumb = async (opts: SharpOptions, name: string, size: number) => {
        const path = join(deps.outDir, name);
        if (!existsSync(path)) created.push(path);
        await sharp(got.bytes, { ...opts, limitInputPixels: MAX_INPUT_PIXELS })
          .rotate()
          .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(path);
      };
      const pages = (await sharp(got.bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).pages ?? 1;
      if (pages > 1) {
        await writeThumb({ animated: false, pages: 1 }, `${hash}-t.webp`, 480);
        const thumb = pub(`${hash}-t.webp`);
        if (got.bytes.length <= MAX_ORIGINAL_BYTES) {
          const ext = mime === 'image/gif' ? 'gif' : mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'bin';
          write(`${hash}.${ext}`, got.bytes);
          stored = { kind: 'image', thumb, large: pub(`${hash}.${ext}`), file: pub(`${hash}.${ext}`), animated: true };
        } else {
          stored = { kind: 'image', thumb, large: null, file: null, animated: true, remote: gotUrl };
        }
      } else {
        await writeThumb({}, `${hash}-t.webp`, 480);
        await writeThumb({}, `${hash}-l.webp`, 1600);
        stored = { kind: 'image', thumb: pub(`${hash}-t.webp`), large: pub(`${hash}-l.webp`), file: null };
      }
    } else {
      return fail();
    }
  } catch {
    for (const path of created) rmSync(path, { force: true });
    return fail();
  }
  manifest[key] = stored;
  return stored;
}

export function createDownloader(
  opts: { maxBytes?: number; timeoutMs?: number; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> } = {},
): MediaDeps['download'] {
  const maxBytes = opts.maxBytes ?? 80 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const doFetch = opts.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const failuresByHost = new Map<string, number>();
  const countFailure = (host: string) => failuresByHost.set(host, (failuresByHost.get(host) ?? 0) + 1);
  return async (url) => {
    let host = '';
    try {
      host = new URL(url).host;
      if ((failuresByHost.get(host) ?? 0) >= MAX_HOST_FAILURES) return 'skipped';
      const res = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      if (!res.ok) {
        // Only overload-style statuses say anything about the host; a 404 is just a missing file.
        if (res.status === 429 || res.status >= 500) countFailure(host);
        return null;
      }
      if (Number(res.headers.get('content-length') ?? 0) > maxBytes) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > maxBytes) return null;
      failuresByHost.set(host, 0);
      return { bytes, mime: (res.headers.get('content-type') ?? '').split(';')[0].trim() };
    } catch {
      // Network errors (including timeouts) count against the host; an invalid url never got that far.
      if (host) countFailure(host);
      return null;
    }
  };
}

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function gcMedia(dir: string, referenced: Set<string>, manifest: Record<string, ManifestEntry>): number {
  let removed = 0;
  if (existsSync(dir))
    for (const f of readdirSync(dir))
      if (!referenced.has(f)) {
        rmSync(join(dir, f));
        removed++;
      }
  for (const [k, v] of Object.entries(manifest)) {
    if (!isStored(v)) continue;
    const files = [v.thumb, v.large, v.file].filter((x): x is string => !!x).map(basename);
    if (files.some((f) => !referenced.has(f))) delete manifest[k];
  }
  return removed;
}
