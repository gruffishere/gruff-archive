/** OpenSea's CDN serves a 500 px preview by default; `w=N` returns the cached original scaled to N (4000 px for Gruffters). */
const isSeadn = (u: URL) => u.hostname === 'seadn.io' || u.hostname.endsWith('.seadn.io');

function withQuery(url: string, query: string): string {
  try {
    const u = new URL(url);
    if (!isSeadn(u)) return url;
    u.search = query;
    return u.toString();
  } catch {
    return url;
  }
}

/** The source to download: a seadn.io url gets `?w=2000` (replacing any query), above the 1600 px large rendition;
 * `w=4000` made the CDN take 15-20 s per image against ~5 s here. Every other url is unchanged. */
export const seadnFull = (url: string): string => withQuery(url, '?w=2000');

/** The full-size PNG a visitor opens as the original (about 2.3 MB for a 4000 px piece). */
export const seadnOriginal = (url: string): string => withQuery(url, '?format=png&w=4000');
