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

### Task B: experiment rooms (after the artist answers)

Dive bar, STRUNG DECK, I LOVE PURE CHAOS and The Sigils as rooms on /experiments and as `exp.` rows on the index. Details follow the artist's choices.
