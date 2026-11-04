import { describe, expect, it } from 'vitest';
import { paginate, toRawTransfer, toTokenMeta, transfersUrl, type BsInstance, type BsTransfer } from '../../indexer/blockscout';
import type { FetchJson } from '../../indexer/http';

describe('paginate', () => {
  it('follows next_page_params until null', async () => {
    const pages: Record<string, unknown> = {
      'https://eth.blockscout.com/api/v2/tokens/0xabc/transfers': { items: [1, 2], next_page_params: { block_number: 10, index: 5 } },
      'https://eth.blockscout.com/api/v2/tokens/0xabc/transfers?block_number=10&index=5': { items: [3], next_page_params: null },
    };
    const fetchJson = (async (url: string) => pages[url]) as unknown as FetchJson;
    const out: number[] = [];
    for await (const x of paginate<number>(fetchJson, transfersUrl('0xabc'))) out.push(x);
    expect(out).toEqual([1, 2, 3]);
  });
});

describe('paginate guard (M11)', () => {
  it('stops with an error when next_page_params repeats', async () => {
    const fetchJson = (async () => ({ items: [1], next_page_params: { block_number: 10 } })) as unknown as FetchJson;
    const out: number[] = [];
    await expect(async () => {
      for await (const x of paginate<number>(fetchJson, transfersUrl('0xabc'))) out.push(x);
    }).rejects.toThrow(/repeated/);
    expect(out.length).toBeLessThan(5);
  });
});

describe('toRawTransfer', () => {
  const sample: BsTransfer = {
    block_number: 18471925,
    from: { hash: '0xB893AE8A1824604F6df4Dfde52E2754921ba1A73', ens_domain_name: 'bitmancrypto.eth' },
    to: { hash: '0xcDA72070E455bb31C7690a170224Ce43623d0B6f', ens_domain_name: null },
    log_index: 58,
    timestamp: '2023-10-31T18:33:47.000000Z',
    total: { token_id: '2' },
    transaction_hash: '0x09470E56A8CB9C79646194B3C989916C1AEEE4442B3DA7865A7823B195E27A25',
    type: 'token_transfer',
  };

  it('maps and lowercases an ERC-721 transfer', () => {
    expect(toRawTransfer('0x3be88adf4d68c32bad5707588c7d25e1af8644e0', sample)).toEqual({
      contract: '0x3be88adf4d68c32bad5707588c7d25e1af8644e0',
      tokenId: '2',
      from: '0xb893ae8a1824604f6df4dfde52e2754921ba1a73',
      to: '0xcda72070e455bb31c7690a170224ce43623d0b6f',
      fromEns: 'bitmancrypto.eth',
      toEns: null,
      value: '1',
      txHash: '0x09470e56a8cb9c79646194b3c989916c1aeee4442b3da7865a7823b195e27a25',
      logIndex: 58,
      blockNumber: 18471925,
      timestamp: '2023-10-31T18:33:47.000Z',
    });
  });

  it('keeps the ERC-1155 value', () => {
    expect(toRawTransfer('0xc', { ...sample, total: { token_id: '3', value: '5' } })?.value).toBe('5');
  });

  it('returns null when there is no token id', () => {
    expect(toRawTransfer('0xc', { ...sample, total: null })).toBeNull();
  });
});

describe('toTokenMeta', () => {
  it('prefers the original metadata image', () => {
    expect(
      toTokenMeta({
        id: '2',
        image_url: 'https://blockscout-cache.test/2.png',
        animation_url: null,
        metadata: { name: "'Spacewalker'", description: 'It has all begun.', image: 'https://arweave.net/Z1_K' },
      }),
    ).toEqual({ tokenId: '2', name: "'Spacewalker'", description: 'It has all begun.', image: 'https://arweave.net/Z1_K', animation: null });
  });

  it('falls back to blockscout urls when metadata is missing', () => {
    expect(toTokenMeta({ id: '9', image_url: 'https://b/9.png', animation_url: 'https://b/9.html', metadata: null })).toEqual({
      tokenId: '9',
      name: null,
      description: null,
      image: 'https://b/9.png',
      animation: 'https://b/9.html',
    });
  });

  it('returns null image and animation when the API omits both urls', () => {
    const meta = toTokenMeta({ id: '5', metadata: null } as unknown as BsInstance);
    expect(meta.image).toBeNull();
    expect(meta.animation).toBeNull();
  });
});
