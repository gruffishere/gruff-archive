import { describe, expect, it } from 'vitest';
import { SOCIALS, STATEMENT } from '../../src/lib/site';

describe('site constants', () => {
  it('has the statement and https socials', () => {
    expect(STATEMENT).toBe('trying to be an experimental artist');
    expect(SOCIALS.map((s) => s.label)).toEqual(['x', '6529', 'opensea', 'transient', 'networked.art']);
    expect(SOCIALS.find((s) => s.label === 'networked.art')?.url).toBe('https://networked.art/gruffwashere');
    for (const s of SOCIALS) expect(s.url).toMatch(/^https:\/\//);
  });
});
