// A live work read straight from its contract in the visitor's browser: tokenURI(id) over a public RPC, then the
// HTML inside the token's json (animation_url). Nothing of it is stored by the archive. Pure helpers plus one fetch.

/** Public endpoints that answer browsers (CORS) and return large results; tried in order. */
export const LIVE_RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'];
const TIMEOUT_MS = 15_000;
const TOKEN_URI = '0xc87b56dd'; // tokenURI(uint256)

export function tokenUriBody(contract: string, id: string): string {
  const data = TOKEN_URI + BigInt(id).toString(16).padStart(64, '0');
  return JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data }, 'latest'] });
}

const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8').decode(bytes);

/** The string an eth_call returned (ABI: offset, length, bytes). */
export function decodeAbiString(hex: string): string {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const offset = Number.parseInt(h.slice(0, 64), 16) * 2;
  const length = Number.parseInt(h.slice(offset, offset + 64), 16);
  const body = h.slice(offset + 64, offset + 64 + length * 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return utf8(bytes);
}

/** The text of a data: URI (base64 or percent-encoded), or null when it is not one. */
function dataUriText(uri: string): string | null {
  const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(uri);
  if (!m) return null;
  if (!m[1]) return decodeURIComponent(m[2]);
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return utf8(bytes);
}

/** The work's live HTML from its tokenURI, or null when the token carries none on chain. */
export function liveHtml(tokenUri: string): string | null {
  try {
    if (!tokenUri.startsWith('data:application/json')) return null;
    const json = JSON.parse(dataUriText(tokenUri) ?? '') as { animation_url?: unknown };
    const anim = typeof json.animation_url === 'string' ? json.animation_url : '';
    return anim.startsWith('data:text/html') ? dataUriText(anim) : null;
  } catch {
    return null;
  }
}

/** Reads the live HTML from the first RPC that answers; null when none does. */
export async function fetchLiveHtml(contract: string, id: string, fetchImpl: typeof fetch = fetch, rpcs: string[] = LIVE_RPCS): Promise<string | null> {
  const body = tokenUriBody(contract, id);
  for (const rpc of rpcs) {
    try {
      const res = await fetchImpl(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) continue;
      const { result } = (await res.json()) as { result?: string };
      if (!result || result === '0x') continue;
      const html = liveHtml(decodeAbiString(result));
      if (html) return html;
    } catch {
      // the next endpoint
    }
  }
  return null;
}
