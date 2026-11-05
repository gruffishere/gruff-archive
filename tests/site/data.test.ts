import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.CATALOG_DIR = 'tests/site/fixtures/catalog';
});

describe('catalog readers', () => {
  it('reads collections, tokens, keepers, timeline, meta', async () => {
    const d = await import('../../src/lib/data');
    expect(d.collections().map((c) => c.code)).toEqual(['SLV', 'FCT', 'OVN']);
    expect(d.collection('facets')?.works).toBe(2222);
    expect(d.tokensOf('silver-surfer')).toHaveLength(2);
    expect(d.keepers()[0].ens).toBe('keeper.eth');
    expect(d.timeline().at(-1)?.holders).toBe(400);
    expect(d.meta().ethUsd).toBe(2260.91);
  });

  it('lists activity months newest first and reads one', async () => {
    const d = await import('../../src/lib/data');
    expect(d.activityMonths()).toEqual(['2025-01', '2023-03']);
    expect(d.activityMonth('2025-01')[0].kind).toBe('sale');
    expect(d.latestActivity()).toHaveLength(1);
  });

  it('indexes token names and thumbs by slug/id', async () => {
    const d = await import('../../src/lib/data');
    expect(d.tokenIndex().get('silver-surfer/2')).toEqual({ name: "'Spacewalker'", thumb: '/media/b-t.webp', accession: 'GRF.23.SLV.002' });
  });
});
