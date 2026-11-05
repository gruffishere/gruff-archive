import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCommentary } from '../../src/lib/commentary';
import samples from '../../src/lib/sample-cards.json';
import { DEALT_DECKS, cardSeed } from '../../src/lib/deal';
import type { CollectionOut } from '../../src/lib/data';
import { EMBED_ALLOW, ROOMS, ROOM_STATUSES, defineRoom, embedSandbox, formatRoomDate, roomDateLabel, roomMeta, roomFilterTags, roomPath, trailerEmbed, xEmbedUrl } from '../../src/lib/rooms';
import { countLabel, ledgerCounts, ledgerEntries } from '../../src/lib/collections';
import { roomVisibleAt } from '../../src/lib/timeline';

const c = (p: Partial<CollectionOut>) => ({ code: 'X', slug: 'x', title: 'X', section: 'index', techniques: [], firstMint: '2023-01-01T00:00:00.000Z', works: 3, ...p }) as CollectionOut;

describe('rooms data', () => {
  it('has the four rooms', () => {
    expect(ROOMS.map((r) => r.slug)).toEqual(['dive-bar', 'playing-cards', 'i-love-pure-chaos', 'the-sigils']);
  });
  it('is valid for every room', () => {
    for (const r of ROOMS) {
      expect(r.slug).toMatch(/^[a-z0-9-]+$/);
      expect(r.since).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(r.since.slice(0, 4)).toBe(String(r.year));
      if (r.date) expect(r.since).toBe(r.date.slice(0, 7));
      expect(ROOM_STATUSES).toContain(r.status);
      expect(['embed', 'app', 'deal']).toContain(r.kind);
      expect(r.text.length).toBeGreaterThan(20);
      expect(r.text.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(3);
      expect(r.cover).toMatch(new RegExp(`^/exp/${r.slug}/`));
      expect(existsSync(join('public', r.cover))).toBe(true);
      for (const l of r.links) {
        expect(l.label.length).toBeGreaterThan(0);
        expect(l.url).toMatch(/^(https:\/\/|\/c\/[a-z0-9-]+\/$)/);
      }
      if (r.kind === 'embed') expect(r.src).toMatch(/^https:\/\//);
      if (r.kind === 'app') {
        expect(r.src).toMatch(/^\/exp\/[a-z0-9-]+\/app\/$/);
        expect(existsSync(join('public', r.src!, 'index.html'))).toBe(true);
      }
    }
  });
  it('keeps the public copy free of games, supply and future changes', () => {
    const strung = ROOMS.find((r) => r.slug === 'playing-cards')!;
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

describe('room date labels', () => {
  it('gives DD.MM.YYYY for a full date, MM.YYYY for a month, a dash for neither', () => {
    expect(roomDateLabel({ date: '2026-04-23', since: '2026-04' })).toBe('23.04.2026');
    expect(roomDateLabel({ since: '2026-10' })).toBe('10.2026');
    expect(roomDateLabel({})).toBe('—');
    expect(roomDateLabel({ since: 'soon' })).toBe('—');
  });
  it('labels the real rooms', () => {
    const l = (slug: string) => roomDateLabel(ROOMS.find((r) => r.slug === slug)!);
    expect(l('dive-bar')).toBe('30.10.2026');
    expect(l('the-sigils')).toBe('23.04.2026');
    expect(l('i-love-pure-chaos')).toBe('18.05.2026');
    expect(l('playing-cards')).toBe('11.10.2026');
  });
  it('has no trailer room: the trailer lives inside Pulverulents', () => {
    expect(ROOMS.find((r) => r.slug.includes('trailer'))).toBeUndefined();
  });
});

describe('room dates and the optional medium', () => {
  const base = { slug: 'x', title: 'X', status: 'live' as const, text: 'x', links: [], cover: '/exp/x/c.webp', kind: 'embed' as const };
  it('formats a date as DD.MM.YYYY', () => {
    expect(formatRoomDate('2026-04-23')).toBe('23.04.2026');
    expect(formatRoomDate('2026-05-08')).toBe('08.05.2026');
  });
  it('derives since and year from the date', () => {
    expect(defineRoom({ ...base, date: '2026-05-18' })).toMatchObject({ since: '2026-05', year: 2026 });
    expect(defineRoom({ ...base, year: 2025, since: '2025-08' })).toMatchObject({ since: '2025-08', year: 2025 });
    expect(() => defineRoom({ ...base, date: '2026-5-18' })).toThrow();
    expect(() => defineRoom({ ...base })).toThrow();
  });
  it('builds the meta line: the date or the year, the medium when there is one, the status', () => {
    expect(roomMeta({ date: '2026-04-23', year: 2026, medium: 'web/6529', status: 'live' })).toEqual(['23.04.2026', 'web/6529', 'live']);
    expect(roomMeta({ year: 2026, status: 'work in progress' })).toEqual(['2026', 'work in progress']);
  });
  it("has the artist's dates, mediums and links", () => {
    const by = (s: string) => ROOMS.find((r) => r.slug === s)!;
    expect(by('the-sigils')).toMatchObject({ date: '2026-04-23', since: '2026-04', medium: 'web/6529' });
    expect(by('the-sigils').links.map((l) => l.label)).toEqual(['open', 'x']);
    expect(by('the-sigils').links[1].url).toBe('https://x.com/gruffwashere/status/2047328362209698117');
    expect(by('i-love-pure-chaos')).toMatchObject({ date: '2026-05-18', medium: 'web' });
    expect(by('i-love-pure-chaos').links).toEqual([{ label: 'x', url: 'https://x.com/gruffwashere/status/2056167344854995181' }]);
    expect(by('playing-cards')).toMatchObject({ title: 'Playing Cards', kind: 'deal' });
    expect(by('playing-cards').medium).toBeUndefined();
    expect(by('dive-bar')).toMatchObject({ title: '6529 Dive Bar', medium: '6529', status: 'in voting' });
    expect(by('dive-bar').text).toBe('Real regulars on the stools saying what they really wrote, maybe behind the bar, live 6529 on the TV and a recipe for every Meme card in the book. Darts, beer pong and a napkin for your requests, in a bar that stays open as long as the Brain keeps talking.');
  });
  it('has stills that exist under the room folder, and the commentary file', () => {
    const bar = ROOMS.find((r) => r.slug === 'dive-bar')!;
    expect(bar.stills!.length).toBeGreaterThanOrEqual(3);
    for (const s of bar.stills!) {
      expect(s.src).toMatch(/^\/exp\/dive-bar\/stills\//);
      expect(existsSync(join('public', s.src))).toBe(true);
    }
    expect(existsSync(join('src/content', bar.commentary!))).toBe(true);
  });
});

describe('the dive bar commentary', () => {
  const md = readFileSync('src/content/dive-bar-commentary.md', 'utf8');
  const blocks = parseCommentary(md);
  it('keeps the two labels, the list and the signature', () => {
    expect(blocks.filter((b) => b.type === 'label').map((b) => (b as { text: string }).text)).toEqual(['What you can do:', 'How it works:']);
    expect(blocks.find((b) => b.type === 'list')).toMatchObject({ items: expect.any(Array) });
    expect((blocks.find((b) => b.type === 'list') as { items: string[] }).items).toHaveLength(6);
    expect(blocks.at(-1)).toEqual({ type: 'sign', text: 'gruff' });
  });
  it('never rewrites a word: the blocks put back together hold every word of the file', () => {
    const words = (t: string) => t.replace(/^- /gm, '').split(/\s+/).filter(Boolean).join(' ');
    const joined = blocks.map((b) => (b.type === 'list' ? b.items.join(' ') : b.text)).join(' ');
    expect(words(joined)).toBe(words(md));
    expect(md).toContain("Maybe's dive bar is the 6529 Brain wave");
  });
});

describe('the Playing Cards sample gallery', () => {
  it('has 12 distinct cards from distinct decks, with the generator seed, and a file each', () => {
    expect(samples).toHaveLength(12);
    expect(new Set(samples.map((c) => `${c.deck}|${c.suit}|${c.rank}`)).size).toBe(12);
    expect(new Set(samples.map((c) => c.deck)).size).toBe(12);
    expect(new Set(samples.map((c) => c.suit)).size).toBe(4);
    for (const c of samples) {
      expect(DEALT_DECKS.some((d) => d.key === c.deck)).toBe(true);
      expect(c.rank).toBeGreaterThanOrEqual(1);
      expect(c.rank).toBeLessThanOrEqual(10);
      expect(c.seed).toBe(cardSeed(c.deck, c.suit, c.rank));
      expect(existsSync(join('public/exp/playing-cards/cards', `${c.deck}-${c.suit}-${c.rank}.webp`))).toBe(true);
    }
  });
});

describe('xEmbedUrl', () => {
  const embed = 'https://platform.twitter.com/embed/Tweet.html?id=1960617797278687687&theme=dark&dnt=true';
  it('turns x.com and twitter.com status URLs into the embed player', () => {
    expect(xEmbedUrl('https://x.com/gruffwashere/status/1960617797278687687')).toBe(embed);
    expect(xEmbedUrl('https://twitter.com/gruffwashere/status/1960617797278687687?s=20')).toBe(embed);
    expect(xEmbedUrl('https://www.x.com/gruffwashere/status/1960617797278687687/')).toBe(embed);
  });
  it('returns null for anything else', () => {
    expect(xEmbedUrl('https://x.com/gruffwashere')).toBeNull();
    expect(xEmbedUrl('https://example.com/a/status/1960617797278687687')).toBeNull();
    expect(xEmbedUrl('https://x.com.evil.com/a/status/1960617797278687687')).toBeNull();
    expect(xEmbedUrl('http://x.com/a/status/1960617797278687687')).toBeNull();
    expect(xEmbedUrl('https://x.com/a/status/abc')).toBeNull();
    expect(xEmbedUrl('not a url')).toBeNull();
  });
  it('finds the trailer among collection links', () => {
    expect(trailerEmbed([{ label: 'site', url: 'https://x.com/a/status/1960617797278687687' }])).toBeNull();
    expect(trailerEmbed([{ label: 'trailer', url: 'https://x.com/gruffwashere/status/1960617797278687687' }])).toBe(embed);
    expect(trailerEmbed([{ label: 'trailer', url: 'https://youtube.com/watch?v=1' }])).toBeNull();
    expect(trailerEmbed(undefined)).toBeNull();
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
    expect(`${countLabel(n.collections, 'collection')} · ${countLabel(n.experiments, 'experiment')}`).toBe(`2 collections · ${1 + ROOMS.length} experiments`);
  });
});

describe('the scrubber and rooms', () => {
  it('hides a room before its since month and shows it from then on', () => {
    expect(roomVisibleAt('2026-04', '2026-03')).toBe(false);
    expect(roomVisibleAt('2026-04', '2026-04')).toBe(true);
    expect(roomVisibleAt('2026-04', '2026-11')).toBe(true);
  });
});
