/** OpenSea's CDN serves a 500 px preview by default; `w=4000` returns the cached original at full size. */
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

/** The full-size source to download: a seadn.io url gets `?w=4000` (replacing any query); every other url is unchanged. */
export const seadnFull = (url: string): string => withQuery(url, '?w=4000');

/** The full-size PNG a visitor opens as the original (about 2.3 MB for a 4000 px piece). */
export const seadnOriginal = (url: string): string => withQuery(url, '?format=png&w=4000');
