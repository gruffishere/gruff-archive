import { describe, expect, it } from 'vitest';
import { IPFS_GATEWAYS } from '../../indexer/media';
import { toPublicUrl } from '../../indexer/originals';

const gw = IPFS_GATEWAYS[0];

describe('toPublicUrl', () => {
  it('keeps http(s) urls unchanged', () => {
    expect(toPublicUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(toPublicUrl('http://example.com/a.png')).toBe('http://example.com/a.png');
  });
  it('maps ipfs:// with a path onto the indexer gateway', () => {
    expect(toPublicUrl('ipfs://bafyCID/1.png')).toBe(`${gw}bafyCID/1.png`);
  });
  it('maps ipfs://ipfs/<cid> onto the indexer gateway', () => {
    expect(toPublicUrl('ipfs://ipfs/bafyCID')).toBe(`${gw}bafyCID`);
  });
  it('maps ar:// to arweave.net', () => {
    expect(toPublicUrl('ar://abc123')).toBe('https://arweave.net/abc123');
  });
  it('returns null for data uris, empty, null and unknown schemes', () => {
    expect(toPublicUrl('data:image/svg+xml;base64,AAAA')).toBeNull();
    expect(toPublicUrl('')).toBeNull();
    expect(toPublicUrl(null)).toBeNull();
    expect(toPublicUrl('ftp://x/y')).toBeNull();
  });
  it('normalises case and whitespace of schemes', () => {
    expect(toPublicUrl('  HTTPS://Example.com/a.png ')).toBe('https://Example.com/a.png');
    expect(toPublicUrl('IPFS://bafyCID/1.png')).toBe(`${gw}bafyCID/1.png`);
    expect(toPublicUrl('AR://abc')).toBe('https://arweave.net/abc');
  });
  it('keeps paths and query strings', () => {
    expect(toPublicUrl('ar://id/path')).toBe('https://arweave.net/id/path');
    expect(toPublicUrl('ipfs://ipfs/cid/path')).toBe(`${gw}cid/path`);
    expect(toPublicUrl('https://x.test/a.png?w=1&h=2')).toBe('https://x.test/a.png?w=1&h=2');
    expect(toPublicUrl('ipfs://cid/a.png?x=1')).toBe(`${gw}cid/a.png?x=1`);
  });
});
