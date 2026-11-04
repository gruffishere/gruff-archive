import { describe, expect, it, vi } from 'vitest';
import { createRpc, decodeAbiString, encodeTokenUriCall, parseTokenUriJson, readTokenUri } from '../../indexer/tokenuri';

const abiString = (s: string) => {
  const data = Buffer.from(s, 'utf8');
  const padded = Buffer.concat([data, Buffer.alloc((32 - (data.length % 32)) % 32)]);
  const head = Buffer.alloc(64);
  head.writeUInt8(0x20, 31);
  head.writeUInt32BE(data.length, 60);
  return '0x' + Buffer.concat([head, padded]).toString('hex');
};

const json = { name: '1 #1', description: 'd', image: 'data:image/svg+xml;base64,PHN2Zy8+', animation_url: 'data:text/html;base64,PGh0bWw+' };

describe('tokenURI helpers', () => {
  it('encodes the eth_call data', () => {
    expect(encodeTokenUriCall('1500')).toBe('0xc87b56dd' + (1500).toString(16).padStart(64, '0'));
  });

  it('decodes an ABI-encoded string, including multi-byte text', () => {
    expect(decodeAbiString(abiString('data:application/json,{"name":"é"}'))).toBe('data:application/json,{"name":"é"}');
    expect(decodeAbiString('0x')).toBeNull();
  });

  it('readTokenUri calls eth_call and decodes', async () => {
    const rpc = vi.fn().mockResolvedValue(abiString('ipfs://abc'));
    expect(await readTokenUri(rpc, '0xabc', '7')).toBe('ipfs://abc');
    expect(rpc).toHaveBeenCalledWith('eth_call', [{ to: '0xabc', data: encodeTokenUriCall('7') }, 'latest']);
  });

  it('parses base64 json data URIs', () => {
    const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(json)).toString('base64');
    expect(parseTokenUriJson(uri)).toEqual({ name: '1 #1', description: 'd', image: json.image, animation: json.animation_url });
  });

  it('parses percent-encoded utf8 json data URIs', () => {
    const uri = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({ name: 'i love the outliers #5', image: json.image }));
    expect(parseTokenUriJson(uri)).toEqual({ name: 'i love the outliers #5', description: null, image: json.image, animation: null });
    expect(parseTokenUriJson('data:application/json;utf8,' + encodeURIComponent(JSON.stringify(json)))?.name).toBe('1 #1');
  });

  it('returns null for remote uris and malformed json', () => {
    expect(parseTokenUriJson('https://gruffters.gg/1')).toBeNull();
    expect(parseTokenUriJson('ipfs://abc')).toBeNull();
    expect(parseTokenUriJson('data:application/json;base64,' + Buffer.from('{nope').toString('base64'))).toBeNull();
    expect(parseTokenUriJson('data:application/json,[1]')).toBeNull();
  });
});

describe('createRpc', () => {
  const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });

  it('posts json-rpc and returns result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok('0x01'));
    const rpc = createRpc('https://rpc.test', { fetchImpl, sleepImpl: async () => {} });
    expect(await rpc('eth_call', [1])).toBe('0x01');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://rpc.test');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ jsonrpc: '2.0', method: 'eth_call', params: [1] });
  });

  it('retries on 429 and throws on rpc errors without retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(ok('0x02'));
    const rpc = createRpc('https://rpc.test', { fetchImpl, sleepImpl: async () => {} });
    expect(await rpc('m', [])).toBe('0x02');
    const bad = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'execution reverted' } }), { status: 200 }));
    await expect(createRpc('https://rpc.test', { fetchImpl: bad, sleepImpl: async () => {} })('m', [])).rejects.toThrow(/reverted/);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it('spaces calls by the minimum interval', async () => {
    const sleeps: number[] = [];
    const rpc = createRpc('https://rpc.test', {
      fetchImpl: async () => ok('0x'),
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });
    await rpc('m', []);
    await rpc('m', []);
    expect(sleeps.some((ms) => ms > 0 && ms <= 100)).toBe(true);
  });
});
