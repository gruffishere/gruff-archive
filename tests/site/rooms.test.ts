import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CollectionOut } from '../../src/lib/data';
import { EMBED_ALLOW, ROOMS, ROOM_STATUSES, embedSandbox, roomFilterTags, roomPath } from '../../src/lib/rooms';
import { countLabel, ledgerCounts, ledgerEntries } from '../../src/lib/collections';
import { roomVisibleAt } from '../../src/lib/timeline';

const c = (p: Partial<CollectionOut>) => ({ code: 'X', slug: 'x', title: 'X', section: 'index', techniques: [], firstMint: '2023-01-01T00:00:00.000Z', works: 3, ...p }) as CollectionOut;

describe('rooms data', () => {
  it('has the four rooms', () => {
    expect(ROOMS.map((r) => r.slug)).toEqual(['dive-bar', 'strung-deck', 'i-love-pure-chaos', 'the-sigils']);
  });
  it('is valid for every room', () => {
    for (const r of ROOMS) {
      expect(r.slug).toMatch(/^[a-z0-9-]+$/);
      expect(r.since).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(r.since.slice(0, 4)).toBe(String(r.year));
      expect(ROOM_STATUSES).toContain(r.status);
      expect(['embed', 'app', 'deal']).toContain(r.kind);
      expect(r.text.length).toBeGreaterThan(20);
      expect(r.text.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(3);
      expect(r.cover).toMatch(new RegExp(`^/exp/${r.slug}/`));
      expect(existsSync(join('public', r.cover))).toBe(true);
      for (const l of r.links) {
        expect(l.label.length).toBeGreaterThan(0);
        expect(l.url).toMatch(/^https:\/\//);
      }
      if (r.kind === 'embed') expect(r.src).toMatch(/^https:\/\//);
      if (r.kind === 'app') {
        expect(r.src).toMatch(/^\/exp\/[a-z0-9-]+\/app\/$/);
        expect(existsSync(join('public', r.src!, 'index.html'))).toBe(true);
      }
    }
  });
  it('keeps the public copy free of games, supply and future changes', () => {
    const strung = ROOMS.find((r) => r.slug === 'strung-deck')!;
    expect(strung.text).not.toMatch(/\b(game|play|supply|mint|will|soon|later|coming)\b/i);
    for (const r of ROOMS) expect(r.text).not.toMatch(/\b(soon|coming|will be|roadmap)\b/i);
  });
  it('points the iframes at the artist\'s entries', () => {
    expect(ROOMS.find((r) => r.slug === 'dive-bar')!.src).toBe('https://arweave.net/74ONRA98QkYQHCq7OyDjoDvTRYP7exdASAMFWjhZd5U');
    expect(ROOMS.find((r) => r.slug === 'the-sigils')!.src).toBe('https://gruffishere.github.io/the-sigils/');
  });
  it('builds paths and filter tags', () => {
    expect(roomPath('dive-bar')).toBe('/experiments/dive-bar/');
    expect(roomFilterTags()).toEqual(['all', 'experiments']);
  });
});

describe('iframe sandbox', () => {
  it('gives third-party origins scripts and same-origin inside their own origin', () => {
    expect(embedSandbox('https://arweave.net/x', 'https://gruff.example')).toBe('allow-scripts allow-same-origin allow-popups allow-downloads');
    expect(EMBED_ALLOW).toBe('autoplay; fullscreen');
  });
  it('never gives allow-same-origin to a frame on our own origin', () => {
    expect(embedSandbox('/exp/x/', 'https://gruff.example')).not.toContain('allow-same-origin');
    expect(embedSandbox('https://gruff.example/a/', 'https://gruff.example')).not.toContain('allow-same-origin');
  });
  it('uses third-party sandboxing for every embed room', () => {
    for (const r of ROOMS.filter((x) => x.kind === 'embed')) expect(embedSandbox(r.src!, 'https://gruff.example')).toContain('allow-same-origin');
  });
});

describe('the ledger with rooms', () => {
  const room = (slug: string, since: string) => ({ ...ROOMS[0], slug, since });
  it('orders collections and rooms together, newest first', () => {
    const all = [c({ code: 'A', firstMint: '2023-01-01T00:00:00.000Z' }), c({ code: 'B', firstMint: '2026-09-15T00:00:00.000Z' }), c({ code: 'E', section: 'experiments', firstMint: '2025-06-01T00:00:00.000Z' }), c({ code: 'H', section: 'hidden' as never })];
    const rooms = [room('r-old', '2023-06'), room('r-new', '2026-10'), room('r-mid', '2025-06')];
    const keys = ledgerEntries(all, rooms).map((e) => (e.kind === 'room' ? e.room.slug : e.c.code));
    expect(keys).toEqual(['r-new', 'B', 'E', 'r-mid', 'r-old', 'A']);
  });
  it('counts rooms as experiments', () => {
    const all = [c({ code: 'A' }), c({ code: 'B' }), c({ code: 'E', section: 'experiments' })];
    const n = ledgerCounts(ledgerEntries(all, ROOMS));
    expect(n).toEqual({ collections: 2, experiments: 1 + ROOMS.length });
    expect(`${countLabel(n.collections, 'collection')} · ${countLabel(n.experiments, 'experiment')}`).toBe('2 collections · 5 experiments');
  });
});

describe('the scrubber and rooms', () => {
  it('hides a room before its since month and shows it from then on', () => {
    expect(roomVisibleAt('2026-04', '2026-03')).toBe(false);
    expect(roomVisibleAt('2026-04', '2026-04')).toBe(true);
    expect(roomVisibleAt('2026-04', '2026-11')).toBe(true);
  });
});
