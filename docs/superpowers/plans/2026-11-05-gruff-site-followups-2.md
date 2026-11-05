# gruff archive — Site follow-ups 2 (plan 2.2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. TDD for every pure function.

**Goal:** The artist's second review (2026-11-05 evening):
- sharp Gruffters images and a correct "original" for them;
- the edition reads `1/1/673` for numbered 1/1 collections;
- animated works move on hover on the catalog wall;
- FACETS counts as an experiment;
- FACETS and OVVN show their own sites and X links;
- new experiment rooms (Task B, after the artist's choices).

## Global Constraints

Everything in `docs/superpowers/plans/2026-11-05-gruff-site-followups.md` → "Global Constraints" still applies.

---

### Task A: Gruffters hi-res, numbered 1/1 edition, catalog hover motion, FACETS as experiment, collection links

**Files:**
- `indexer/pipeline/collection.ts` (OpenSea fallback), `indexer/opensea.ts`, `indexer/originals.ts` or a new `indexer/seadn.ts`;
- `indexer/types.ts`, `indexer/config.ts`, `config/collections.yaml`;
- `indexer/aggregate/collections.ts`;
- `src/components/WallLabel.astro`, `src/lib/label.ts`, `src/lib/links.ts`, `src/pages/c/[slug].astro`, `src/scripts/catalog.ts`, `src/pages/catalog.astro`, `src/lib/techniques.ts`;
- tests.

Requirements:

1. **Hi-res OpenSea fallback images.**
   - OpenSea's CDN (`*.seadn.io`) serves a 500×500 preview by default. `?w=4000` returns the cached original at 4000×4000 (AVIF, about 130 KB). `?format=png&w=4000` returns a PNG of about 2.3 MB. Both were measured for Gruffter #1.
   - Pure helper `seadnFull(url): string`: for hosts ending in `seadn.io`, set or replace the query to `w=4000`. Every other URL is returned unchanged.
   - Use it for the media download of OpenSea fallback images. The thumb and large renditions are regenerated from the 4000 px source.
   - Confirm in a unit test that sharp decodes an AVIF fixture. Generate the fixture with sharp itself in a temp dir; never write it to `public/media`.
   - `originals.image` for a token whose image came from the OpenSea fallback becomes `seadn url + ?format=png&w=4000`, so the visitor's "original ↗" opens the full-size PNG.
   - The storage word for `*.seadn.io` is `opensea`. Update `originalLink` / `storageWord` in `src/lib/links.ts` with a test.
   - The cached `data/raw/os-images/*.json` entries stay as they are; the transform happens at use time.
2. **Numbered 1/1 edition.**
   - For an erc721 collection with `works > 1`, the edition reads `1/1/<works>`, e.g. `1/1/673 · erc-721`. This applies on the wall label and on the print label.
   - A single-work erc721 collection keeps `1/1 · erc-721`. erc1155 rows are unchanged. Supply-0 tokens keep `none in circulation · …`.
   - Unit-test it.
3. **Catalog hover motion.**
   - On the catalog wall, hovering or keyboard-focusing an animated piece plays it:
     - Animated GIF originals: `image.animated` with a stored `image.file`, or with `image.remote` when there is no local copy. Swap the tile's `src` to the original GIF on `pointerenter`/`focus`, and back to the static rendition on `pointerleave`/`blur`.
     - Video media: `play()` / `pause()`.
   - GIFs are never loaded before the first hover.
   - Keep the tile's box fixed (no reflow) and keep `object-fit`.
   - Touch devices: unchanged; a tap opens the work page.
   - Runtime styles use `:global`.
   - Add an e2e: hovering a known animated piece changes its `src` to a `.gif`.
4. **FACETS is an experiment.**
   - Set FACETS (`code: FCT`) to `section: experiments` in `config/collections.yaml`. The index shows it with the `exp.` marker, and /experiments lists it.
   - `src/lib/techniques.ts`: include both `index` and `experiments` sections, so no work silently drops out of the techniques page. Update its tests. The page gets redesigned with the artist later.
   - Update index e2e counts that change, to the new truth: `15 collections · 2 experiments`. Derive counts in the test where possible.
5. **Collection links.**
   - Optional per-collection config `links: [{ label: string, url: https-URL }]` (zod strict). Add it to `CollectionOut` as `links`, defaulting to `[]`.
   - FACETS: `site` https://thefacets.art, `x` https://x.com/facetsart, `thread` https://x.com/facetsart/status/2097902091637256575.
   - OVVN: `site` https://ovvn.art.
   - Render them as one quiet line of links, `site ↗ · x ↗ · thread ↗` (`target="_blank" rel="noopener"`, `.hit` targets), on the collection page under the meta line and in the work page's wall-label links line.
   - Unit-test the config parse.
6. Do not run the real inventory. The controller re-runs it, which re-downloads the 673 Gruffters images at full size.

### Task B: experiment rooms

The artist's choices (2026-11-05), all the recommended options:
- STRUNG DECK as a "deal a hand" game;
- I LOVE PURE CHAOS hosted on our own site;
- maybe's dive bar live inside its room.

The Sigils is live and is linked and embedded.

**Files:**
- `src/lib/rooms.ts` (room data and pure helpers)
- `src/pages/experiments.astro`
- `src/pages/experiments/[slug].astro`
- `src/pages/index.astro` and `src/scripts/index.ts` (rooms as `exp.` rows)
- `src/lib/collections.ts` (`countLabel` counts rooms as experiments)
- `public/exp/<slug>/…` (site-owned assets, never `public/media/`)
- tests

Requirements:

1. **Room data** (`src/lib/rooms.ts`). A typed list. Each room has:
   - `slug`, `title`, `year`, `since: 'YYYY-MM'` (for the scrubber);
   - `status`: one of `in voting`, `work in progress`, `live`;
   - `medium`: the index platform column, e.g. `6529 memes`, `verse`, `web`;
   - `text`: 1–3 short English sentences, factual, with no promises of future features;
   - `links: { label, url }[]`;
   - `cover`: an image under `public/exp/<slug>/`;
   - `kind`: `embed` (iframe URL), `app` (a page hosted on this site) or `deal`.

   The rooms and copy below may be lightly tightened, but must not gain new claims.

   - `dive-bar`
     - title `maybe's dive bar`; year 2026; since `2026-10`; status `in voting`; medium `6529 memes`.
     - text: "A living 3D bar for maybe's wave in 6529 Brain, made as a Meme card. The TV channels, the patrons and the drinks come from live 6529 data. Submitted to The Memes; in voting."
     - kind `embed` → `https://arweave.net/74ONRA98QkYQHCq7OyDjoDvTRYP7exdASAMFWjhZd5U` (the submitted single-file entry on Arweave). The friend-test mirror is `https://dive-bar.gruffdesign.workers.dev`; use it only if the Arweave entry does not load in Playwright, and say so.
     - links: `arweave ↗`.
   - `strung-deck`
     - title `STRUNG DECK`; year 2026; since `2026-10`; status `work in progress`; medium `verse`.
     - text: "Playing cards in string art: nails around the pips, thread woven inside them, bands strung between. Every card moves in one slow dance."
     - kind `deal` (see 4).
     - Public copy must not mention games, supply numbers or future changes (artist's rule).
   - `i-love-pure-chaos`
     - title `I LOVE PURE CHAOS`; year 2026; since `2026-05`; status `live`; medium `web`.
     - text: "A glitch art machine. Feed it an image; it mills the bits through eighteen operators and returns an animated GIF. Same seed, same image, same GIF."
     - kind `app` → the copy hosted on this site (see 5).
   - `the-sigils`
     - title `The Sigils`; year 2026; since `2026-04`; status `live`; medium `web`.
     - text: "Turns a 6529 identity into a living orbital sigil: TDH, boosts, memes and more each add their own ring, bead or moon."
     - kind `embed` → `https://gruffishere.github.io/the-sigils/`; links `open ↗`.
     - Cover: copy `C:\Users\gruff\soul-archive\cover.png` into `public/exp/the-sigils/cover.png`, converted to webp if large.
2. **/experiments.** Lists the experiment collections (OVVN, FACETS) as now, plus the rooms. Each item is a quiet card: cover, title, status line, and a link to its page.
3. **Room pages `/experiments/<slug>/`.**
   - Content, in order:
     - crumb `← experiments`;
     - title;
     - meta line `<span class="lower">gruff</span>, <year> · <medium> · <status>`;
     - the text, links as one quiet line;
     - then the live piece.
   - Embeds are **click-to-load**: a poster (the cover) with one `enter ↗` button replaces itself with the iframe, so 3D and apps never load on page visit. On phones the iframe fills the width at a sensible aspect, and there is no horizontal scroll.
   - Third-party iframes (arweave.net, github.io) get `sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"` and `allow="autoplay; fullscreen"`. Those origins are not ours, so `allow-same-origin` is safe here. Note this explicitly in code.
   - Never put `allow-same-origin` on an iframe whose src is this site's own origin, except the app in 5, which is the artist's own code; see there.
4. **STRUNG DECK "deal".**
   - Port the browser renderer and player from `C:\Users\gruff\OneDrive\Masaüstü\FULL BODY CLONEX\EVOLVED GRIFTERS\Ordinals\UPC\exp\deck\`:
     - `lab/string26.cjs` (or the version the decks page `page/decks/template.html` / `build.cjs` actually ships);
     - `page/player.js`.
   - Turn them into site-owned files: `public/exp/strung-deck/*.js`, or `src/scripts/` if they can be bundled. Read `_STATE.md` (START HERE block) for which generator is current.
   - A `deal` button places 5 face-up cards on a dark table:
     - random distinct cards from the 20 built decks;
     - each card rendered live with the caustic dance, the artist's favourite motion;
     - a small caption per card in the ledger style, e.g. `7 ♥ · MARKED CARDS`, with deck names from the project.
   - `deal again` re-deals. The default deal is seeded (the same first hand on every load), so the page is stable for screenshots. Later deals are random.
   - Phones: cards wrap, 2–3 per row.
   - Performance: at most 5 cards animate at once, and animation pauses when the tab is hidden or the cards are off-screen.
   - If porting the renderer is not feasible within this task, stop and report NEEDS_CONTEXT with what is missing. Don't fake the art with static images.
5. **I LOVE PURE CHAOS hosted.**
   - Copy the static app from `C:\Users\gruff\glitch-machine\` into `public/exp/i-love-pure-chaos/app/`: `index.html`, `studio.html`, the CSS, `src/`. Skip `server.js` and `notes/`.
   - Fix relative paths if needed. It loads `gif.js` from jsDelivr, which is allowed.
   - The room page's `enter ↗` opens the app in the same tab as a full page (`/exp/i-love-pure-chaos/app/`), with a small `← back to the archive` link injected at the top of the app's own page (minimal, no restyle).
   - The app is not iframed.
6. **Index rows.**
   - Rooms appear in the index ledger as `exp.` rows, ordered by `since` with the rest.
   - Columns: platform shows `medium`; works shows `—`; the link goes to the room page.
   - `data-filters` include `experiments`. The scrubber hides a room before its `since` month.
   - The counts line counts rooms as experiments: today `15 collections · 6 experiments` (after Task A moves FACETS: OVVN, FACETS and 4 rooms). Use `countLabel`.
   - The hover preview shows the room cover.
7. **Tests.**
   - Unit: room data validity (https links, `since` format, cover file exists), index ordering with rooms, `countLabel`, the deal picks (5 distinct, seeded first hand).
   - e2e:
     - /experiments lists 6 items;
     - each room page loads and shows `enter ↗`;
     - clicking `enter ↗` on the-sigils inserts a sandboxed iframe with the right src;
     - the strung-deck deal shows 5 canvases;
     - `/exp/i-love-pure-chaos/app/` loads without console errors;
     - the index `experiments` chip shows 6 rows.

### Task D: Pulverulents trailer

The artist made a trailer for Pulverulents. The video exists only as an X post: https://x.com/gruffwashere/status/1960617797278687687. The mp4 is not on the artist's computer, so we embed X's own player. Its embed page `https://platform.twitter.com/embed/Tweet.html?id=1960617797278687687&theme=dark&dnt=true` returns 200 and sends no frame-blocking headers.

1. **Config.** Pulverulents (`code: PUL`) gains `links: [{ label: trailer, url: "https://x.com/gruffwashere/status/1960617797278687687" }]`. This shows as `trailer ↗` on the collection page and on every work label, through the existing links line. The catalog picks it up on the controller's next inventory run.
2. **Trailer block on the collection page.**
   - When a collection has a `trailer` link that is an x.com/twitter.com status URL, the collection page shows a click-to-load trailer block above the grid.
   - The block reuses the room embed: a poster with `play ↗`. Clicking it inserts the X embed iframe, with the same third-party sandbox and allow rules as the room embeds.
   - Poster: the collection's cover rendition (thumb or large of the cover token), never a GIF. If no cover exists, use a quiet empty poster.
   - Add a pure, unit-tested helper `xEmbedUrl(statusUrl): string | null` for x.com and twitter.com status URLs. Any other URL returns null.
3. **Experiments room `pulverulents-trailer`:**
   - title `Pulverulents — trailer`, year 2025, since `2025-08`, status `live`, medium `video`
   - text: "The trailer for Pulverulents."
   - links: `collection ↗` → `/c/pulverulents/` and `x ↗` → the post
   - kind `embed` → `xEmbedUrl(post)`
   - cover: a still of a Pulverulents work, copied into `public/exp/pulverulents-trailer/cover.webp`. Copy it from the committed media, read-only.
   - It appears on /experiments and as an `exp.` row on the index, like the other rooms.
4. **Tests.**
   - Unit: `xEmbedUrl`, and room data validity.
   - e2e:
     - /experiments lists 7 items.
     - The room page shows `enter ↗` (or `play ↗`), and clicking it inserts an iframe whose src starts with `https://platform.twitter.com/embed/Tweet.html?id=1960617797278687687` and has the third-party sandbox.
     - /c/pulverulents/ shows the trailer block once the catalog has the trailer link. Skip only while the committed catalog lacks it (the stale-catalog pattern).
