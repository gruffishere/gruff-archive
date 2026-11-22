import { describe, expect, it, vi } from 'vitest';
import { decodeAbiString, fetchLiveHtml, liveHtml, LIVE_RPCS, tokenUriBody } from '../../src/lib/live-work';
import { fillWorkLinks } from '../../src/lib/work-links';
import { gardenTarget, gardenUrl } from '../../src/lib/garden';

const C = '0x3cc3e703da2c4b529c17efd1f1afd61dec0216af';
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
// an eth_call result: offset 0x20, length, then the bytes padded to 32
const abiString = (s: string) => {
  const hex = Buffer.from(s, 'utf8').toString('hex');
  const word = (n: number) => n.toString(16).padStart(64, '0');
  return `0x${word(32)}${word(hex.length / 2)}${hex.padEnd(Math.ceil(hex.length / 64) * 64, '0')}`;
};
const html = '<!doctype html><title>Glyphora #1</title><p>ünïcode ✿</p>';
const tokenUri = `data:application/json;base64,${b64(JSON.stringify({ name: 'Glyphora #1', image: 'data:image/svg+xml;base64,PHN2Zy8+', animation_url: `data:text/html;base64,${b64(html)}` }))}`;

describe('live work from the chain', () => {
  it('asks tokenURI(id) of the contract at the latest block', () => {
    const body = JSON.parse(tokenUriBody(C, '867'));
    expect(body).toMatchObject({ jsonrpc: '2.0', method: 'eth_call' });
    expect(body.params).toEqual([{ to: C, data: `0xc87b56dd${(867).toString(16).padStart(64, '0')}` }, 'latest']);
  });

  it('decodes an ABI string, unicode included', () => {
    expect(decodeAbiString(abiString(tokenUri))).toBe(tokenUri);
    expect(decodeAbiString(abiString('ünïcode ✿'))).toBe('ünïcode ✿');
  });

  it('finds the live html in the token json, and nothing when there is none', () => {
    expect(liveHtml(tokenUri)).toBe(html);
    expect(liveHtml(`data:application/json,${encodeURIComponent(JSON.stringify({ animation_url: `data:text/html,${encodeURIComponent(html)}` }))}`)).toBe(html);
    expect(liveHtml(`data:application/json;base64,${b64(JSON.stringify({ image: 'x' }))}`)).toBeNull();
    expect(liveHtml(`data:application/json;base64,${b64(JSON.stringify({ animation_url: 'https://elsewhere/x.html' }))}`)).toBeNull();
    expect(liveHtml('https://not-a-data-uri')).toBeNull();
    expect(liveHtml('data:application/json;base64,@@@')).toBeNull();
  });

  it('falls through to the next RPC, and gives up with null when none answers', async () => {
    const ok = { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: abiString(tokenUri) }) };
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(ok);
    expect(await fetchLiveHtml(C, '1', fetchImpl as unknown as typeof fetch)).toBe(html);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(LIVE_RPCS.slice(0, 2));
    const bad = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: { code: -32603 } }) });
    expect(await fetchLiveHtml(C, '1', bad as unknown as typeof fetch)).toBeNull();
    expect(bad).toHaveBeenCalledTimes(LIVE_RPCS.length);
  });
});

describe('work links', () => {
  const links = [
    { label: 'its garden', url: 'https://glyphoras.art/garden/{owner}' },
    { label: 'record', url: 'https://glyphoras.art/record/{id}' },
  ];
  it('fills the id and the owner', () => {
    expect(fillWorkLinks(links, { id: '867', owner: '0xabc' })).toEqual([
      { label: 'its garden', url: 'https://glyphoras.art/garden/0xabc' },
      { label: 'record', url: 'https://glyphoras.art/record/867' },
    ]);
  });
  it('skips an owner link when the work has no single owner', () => {
    expect(fillWorkLinks(links, { id: '1', owner: null })).toEqual([{ label: 'record', url: 'https://glyphoras.art/record/1' }]);
  });
});

describe('garden window input', () => {
  it('takes an address or an ENS name, lowercased and trimmed', () => {
    expect(gardenTarget('  0xAbC0000000000000000000000000000000000001 ')).toBe('0xabc0000000000000000000000000000000000001');
    expect(gardenTarget('GruffDzn.eth')).toBe('gruffdzn.eth');
    expect(gardenTarget('sub.name.eth')).toBe('sub.name.eth');
  });
  it('refuses anything else', () => {
    for (const bad of ['', 'gruff', '0x123', 'name.com', 'a b.eth', '../x.eth', 'javascript:alert(1)']) expect(gardenTarget(bad)).toBeNull();
  });
  it('builds the garden url', () => {
    expect(gardenUrl('https://glyphoras.art/garden/', 'gruffdzn.eth')).toBe('https://glyphoras.art/garden/gruffdzn.eth');
  });
});
