import type { IndexFilter } from './collections';

export const ROOM_STATUSES = ['in voting', 'work in progress', 'live'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];
/** embed: a third-party page in a click-to-load iframe; app: a page hosted on this site, opened full page; deal: drawn live here. */
export type RoomKind = 'embed' | 'app' | 'deal';

export interface Room {
  slug: string;
  title: string;
  year: number;
  /** YYYY-MM-DD. When set, the meta line shows it as DD.MM.YYYY and `since` and `year` come from it. */
  date?: string;
  /** YYYY-MM, when the room first existed; the index scrubber hides it before this month. */
  since: string;
  status: RoomStatus;
  /** The index platform column; a room without one shows a dash there and skips it on its meta line. */
  medium?: string;
  text: string;
  links: { label: string; url: string }[];
  /** An image under public/exp/<slug>/. */
  cover: string;
  kind: RoomKind;
  /** embed: the iframe URL; app: the site path of the hosted page. */
  src?: string;
  /** Stills shown under the live piece, images under public/exp/<slug>/. */
  stills?: { src: string; caption: string }[];
  /** A file in src/content/ shown under the live piece as the artist's own text. */
  commentary?: string;
  /** deal rooms: a gallery of sample cards (src/lib/sample-cards.json) under the table. */
  gallery?: boolean;
}

type RoomInput = Omit<Room, 'since' | 'year'> & { since?: string; year?: number };
/** Fills `year` and `since` from `date` when the room has one. */
export function defineRoom(r: RoomInput): Room {
  const date = r.date;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`room ${r.slug}: bad date ${date}`);
    return { ...r, year: Number(date.slice(0, 4)), since: date.slice(0, 7) };
  }
  if (!r.since || !r.year) throw new Error(`room ${r.slug}: needs a date, or a year and since`);
  return { ...r, year: r.year, since: r.since };
}

/** YYYY-MM-DD as DD.MM.YYYY. */
export const formatRoomDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
/** The meta line segments after "gruff, ": the date (or the bare year), the medium when there is one, the status. */
export const roomMeta = (r: Pick<Room, 'date' | 'year' | 'medium' | 'status'>): string[] => [r.date ? formatRoomDate(r.date) : String(r.year), ...(r.medium ? [r.medium] : []), r.status];

const PULVERULENTS_POST = 'https://x.com/gruffwashere/status/1960617797278687687';

export const ROOMS: Room[] = [
  defineRoom({
    slug: 'dive-bar',
    title: '6529 Dive Bar',
    year: 2026,
    since: '2026-10',
    status: 'in voting',
    medium: '6529',
    text: 'Real regulars on the stools saying what they really wrote, maybe behind the bar, live 6529 on the TV and a recipe for every Meme card in the book. Darts, beer pong and a napkin for your requests, in a bar that stays open as long as the Brain keeps talking.',
    links: [{ label: 'arweave', url: 'https://arweave.net/74ONRA98QkYQHCq7OyDjoDvTRYP7exdASAMFWjhZd5U' }],
    cover: '/exp/dive-bar/cover.webp',
    kind: 'embed',
    src: 'https://arweave.net/74ONRA98QkYQHCq7OyDjoDvTRYP7exdASAMFWjhZd5U',
    stills: [
      { src: '/exp/dive-bar/stills/wide.webp', caption: 'the bar, wide' },
      { src: '/exp/dive-bar/stills/tv.webp', caption: 'main stage' },
      { src: '/exp/dive-bar/stills/mint-tv.webp', caption: 'mint tv' },
      { src: '/exp/dive-bar/stills/tdh-terminal.webp', caption: 'tdh terminal' },
      { src: '/exp/dive-bar/stills/art-hour.webp', caption: 'the art hour' },
    ],
    commentary: 'dive-bar-commentary.md',
  }),
  defineRoom({
    slug: 'playing-cards',
    title: 'Playing Cards',
    year: 2026,
    since: '2026-10',
    status: 'work in progress',
    text: 'Playing cards in string art: nails around the pips, thread woven inside them, bands strung between. Every card moves in one slow dance.',
    links: [],
    cover: '/exp/playing-cards/cover.webp',
    kind: 'deal',
    gallery: true,
  }),
  defineRoom({
    slug: 'i-love-pure-chaos',
    title: 'I LOVE PURE CHAOS',
    date: '2026-05-18',
    status: 'live',
    medium: 'web',
    text: 'A glitch art machine. Feed it an image; it mills the bits through eighteen operators and returns an animated GIF. Same seed, same image, same GIF.',
    links: [{ label: 'x', url: 'https://x.com/gruffwashere/status/2056167344854995181' }],
    cover: '/exp/i-love-pure-chaos/cover.webp',
    kind: 'app',
    src: '/exp/i-love-pure-chaos/app/',
  }),
  defineRoom({
    slug: 'the-sigils',
    title: 'The Sigils',
    date: '2026-04-23',
    status: 'live',
    medium: 'web/6529',
    text: 'Turns a 6529 identity into a living orbital sigil: TDH, boosts, memes and more each add their own ring, bead or moon.',
    links: [
      { label: 'open', url: 'https://gruffishere.github.io/the-sigils/' },
      { label: 'x', url: 'https://x.com/gruffwashere/status/2047328362209698117' },
    ],
    cover: '/exp/the-sigils/cover.webp',
    kind: 'embed',
    src: 'https://gruffishere.github.io/the-sigils/',
  }),
  defineRoom({
    slug: 'pulverulents-trailer',
    title: 'Pulverulents — trailer',
    year: 2025,
    since: '2025-08',
    status: 'live',
    medium: 'video',
    text: 'The trailer for Pulverulents.',
    links: [
      { label: 'collection', url: '/c/pulverulents/' },
      { label: 'x', url: PULVERULENTS_POST },
    ],
    cover: '/exp/pulverulents-trailer/cover.webp',
    kind: 'embed',
    src: xEmbedUrl(PULVERULENTS_POST)!,
  }),
];

/** X's own embed player for a post, for an x.com or twitter.com status URL; anything else is null. */
export function xEmbedUrl(statusUrl: string): string | null {
  let u: URL;
  try { u = new URL(statusUrl); } catch { return null; }
  if (u.protocol !== 'https:' || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(u.hostname)) return null;
  const m = u.pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status\/(\d{5,25})\/?$/);
  return m ? `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&theme=dark&dnt=true` : null;
}
/** The embeddable trailer of a collection: its `trailer` link, when that is an X post. */
export const trailerEmbed = (links: { label: string; url: string }[] | undefined): string | null => {
  const l = (links ?? []).find((x) => x.label === 'trailer');
  return l ? xEmbedUrl(l.url) : null;
};

export const roomPath = (slug: string) => `/experiments/${slug}/`;
/** Rooms are experiments and nothing else: not editions, not one-of-one, not generative, not on-chain. */
export const roomFilterTags = (): IndexFilter[] => ['all', 'experiments'];

export const EMBED_ALLOW = 'autoplay; fullscreen';
/** allow-same-origin is safe on these iframes only because their origin (arweave.net, github.io) is not ours: the
 *  framed page gets its own origin and can never read this site. Never give it to a frame on our own origin. */
export const THIRD_PARTY_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-downloads';
export function embedSandbox(src: string, pageOrigin: string): string {
  const own = new URL(src, pageOrigin).origin === pageOrigin;
  return own ? THIRD_PARTY_SANDBOX.replace(' allow-same-origin', '') : THIRD_PARTY_SANDBOX;
}
