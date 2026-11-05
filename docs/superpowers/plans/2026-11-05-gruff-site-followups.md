# gruff archive — Site follow-ups (plan 2.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Each task is a self-contained brief; follow TDD (failing test first) for every pure function.

**Goal:** The artist's first review of the finished site (2026-11-05): show originals at full size, name collaborators, fix the missing Antique "BURNCALL" art, label Gruffters as an OpenSea collection, show experiments on the index, make the /activity filters show real history, and fix the networked.art URL. Prices, last sales and Gruffters images arrive with the OpenSea key (Task 4).

**Architecture:** Indexer changes (plan 1 code) add fields to the catalog output; site changes read them. Pure logic stays in `indexer/*` and `src/lib/*` with Vitest tests; templates stay thin.

## Global Constraints

Everything in `docs/superpowers/plans/2026-11-05-gruff-site.md` → "Global Constraints" still applies, plus the design rules settled during plan 2:
- The artist's name is always lowercase `gruff`, also inside uppercased ledger lines (wrap the word in `.lower`). Collection titles are untouched. Addresses render lowercase.
- The big 44 px `.price` appears only when a real listing exists; otherwise one small muted `not listed`.
- Relative times only via `[data-ago]` (client), never computed at build.
- Astro scoped `<style>` does not reach runtime-created DOM: use `:global(...)` or global classes.
- Untrusted on-chain HTML/SVG only in `<iframe sandbox="allow-scripts">`, never `allow-same-origin`.
- Touch targets ≥ 44 px (the global `.hit` class), no horizontal scroll from 360 px.
- `public/media/` and `data/` are written only by the indexer; site code never writes there.
- Never commit secrets. `OPENSEA_API_KEY` lives only in the git-ignored `.env`, GitHub Secrets and Cloudflare env.

---

### Task 1: Indexer — originals, collaborators, OpenSea platform, media retry

**Files:** `indexer/types.ts`, `indexer/config.ts`, `config/collections.yaml`, `indexer/media.ts`, `indexer/aggregate/tokens.ts` (+ wherever `TokenOut` is assembled), new `indexer/collaborators.ts`, `indexer/originals.ts`, tests in `tests/indexer/`.

Requirements:
1. **Platform `opensea`.** Add `'opensea'` to `Platform` (`indexer/types.ts`) and to the zod enum (`indexer/config.ts`). Set Gruffters (`code: GRT`) to `platform: opensea` in `config/collections.yaml`.
2. **Originals.** `TokenOut` gains `originals: { image: string | null; animation: string | null }` — the public `https://` URL of each source **as minted** (the token metadata's `image` / `animation_url`), so a visitor can open the artist's original file at full size.
   - Pure `toPublicUrl(src: string | null): string | null` in `indexer/originals.ts`:
     - `https://…` and `http://…` → unchanged;
     - `ipfs://<cid>/<path>` and `ipfs://ipfs/<cid>…` → `https://<first working gateway the indexer already uses for media>/ipfs/<cid>/<path>` (reuse the indexer's gateway constant; do not invent a new one);
     - `ar://<id>` → `https://arweave.net/<id>`;
     - `data:` URIs, empty, or anything else → `null` (on-chain works: the site links the locally stored file instead).
   - Unit-test every branch.
   - The value is taken from the same metadata the media step already reads (Blockscout or chain `tokenURI`, per collection `metadata`). It is independent of whether the media download succeeded.
3. **Collaborators.** `TokenOut` gains `collaborators: string[]`.
   - Pure `parseCollaborators(description: string | null): string[]` in `indexer/collaborators.ts`: finds `collab w/ <names>` or `collab with <names>` (case-insensitive, also `collaboration with`), takes the text up to the end of that line or the first `.`/`;`, splits on `,`, ` & `, ` and `, ` x `, trims, drops empties and duplicates.
   - Real cases that must parse: `"FUTURE DREAMS collab w/ SuperVillian\n…"` → `['SuperVillian']`; `"THEY MEME collab w/ DeltaSauce\n…"` → `['DeltaSauce']`; `"Mass Adoption collab w/ BrutalEth\n…"` → `['BrutalEth']`; a description without "collab" → `[]`.
   - Optional per-collection config override `collaborators: { "<tokenId>": ["Name", …] }` (zod: record of string → string[]), which replaces the parsed list for that token.
4. **Media retry.** In `indexer/media.ts`: `RETRY_FAILED_AFTER_MS` 7 days → 6 hours (the next scheduled inventory retries), and the download default `timeoutMs` 120 s → 300 s (the Antique "BURNCALL" original is a 50.4 MB Arweave PNG that timed out). Update tests that assert the old values.
5. Keep every existing test green; add tests for 1–4. Output schema change: update any output type tests/fixtures (site fixtures in `tests/site/fixtures/catalog/tokens/*.json` gain `originals` and `collaborators`).

Do **not** run the real inventory (network, long). The controller runs it in Task 4.

---

### Task 2: Site — originals link, collaborator names, platform, about URL

**Files:** `src/components/WallLabel.astro`, `src/pages/w/[slug]/[id].astro`, `src/pages/c/[slug].astro`, `src/lib/label.ts`, `src/lib/links.ts`, `src/lib/site.ts`, related tests.

Requirements:
1. **Open the original.** On the work page:
   - For image/video artworks, the artwork itself is a link (`target="_blank" rel="noopener"`) to the original. For html artworks (iframes) the artwork stays interactive and is **not** wrapped.
   - Under the artwork, one quiet line: `original ↗` followed by a muted storage word — `arweave`, `ipfs`, `on-chain` or the hostname. It uses the `.hit` class.
   - Link target: `originals.image` (or `originals.animation` for html/video works) when not null; otherwise the locally stored file (`image.file ?? image.large`, or `animation.large`) with the word `on-chain`.
   - Pure helper `originalLink(t: TokenOut): { url: string; where: string } | null` in `src/lib/links.ts`, unit-tested for the arweave, ipfs-gateway, https, on-chain-local and no-media cases.
2. **Collaborators.** When `t.collaborators.length > 0`:
   - wall label meta line reads `gruff × SuperVillian, 2023` (`gruff` lowercase via `.lower`, names as written);
   - collection page captions show `w/ SuperVillian` in normal (not muted) text so collabs stand out;
   - print label meta line reads `gruff × SuperVillian, 2023 · <collection>`.
   - Multiple names join with ` · `. Unit-test the label line.
3. **Platform.** `platform: 'opensea'` renders as `opensea` in the index platform column. `platformLink` returns `null` for `opensea`, because the work page already has its own OpenSea link.
4. **About.** The networked.art social URL becomes `https://networked.art/gruffwashere`. Update `tests/site/site.test.ts`.
5. e2e:
   - `/w/collabs/1/` shows `×` and `SuperVillian` in `.label`;
   - `/w/antique/2/` has an `original ↗` link whose href starts with `https://arweave.net/`.

   Data-dependent: if the catalog has not been regenerated yet, the controller regenerates it before the e2e run.

---

### Task 3: Site — experiments on the index, real history in /activity filters

**Files:** `src/lib/collections.ts`, `src/pages/index.astro`, `src/scripts/index.ts`, `src/pages/activity/index.astro`, `src/lib/activity.ts`, `src/components/KindChips.astro`, `src/scripts/activity.ts`, tests.

Requirements:
1. **Experiments on the index.**
   - Collections with `section: 'experiments'` appear in the index ledger, ordered by `firstMint` with the rest.
   - Each is marked as an experiment: a small muted `exp.` tag before the title and `data-filters` including `experiments`.
   - A new filter chip `experiments` sits after `on-chain`.
   - The counts line reads `2023—2026 · 16 collections · 1 experiment · 1944 keepers`: experiments are counted separately; use singular/plural correctly.
   - The time scrubber already includes OVVN in `timeline.json`; make sure its row hides and shows with the scrubber like any other.
   - /experiments stays as is.
2. **Activity filters show history.** /activity currently renders the latest 200 rows, which today are all transfers, so `sales` / `mints` / `listings` show nothing.
   - At build, for each kind in `KIND_FILTERS` except `all`, also collect the latest 100 rows **of that kind** across all monthly files, newest first, with mints collapsed via `collapseMints`.
   - Render one list per kind and show the list for the active chip. `all` keeps the latest 200.
   - The empty-state line appears only when a kind has no rows in the whole history.
   - Pure helper `latestByKind(months: ActivityRow[][], kind, n): ActivityRow[]`, unit-tested.
   - Watch page weight: report the new `/activity/index.html` size.
3. e2e:
   - on `/`, the `experiments` chip shows exactly the OVVN row;
   - on `/activity/`, clicking `mints` shows at least one visible row.

---

### Task 4 (controller): keyed inventory, rebuild, visual check

1. The artist saves their OpenSea key in `C:\Users\gruff\gruff-archive\.env` as `OPENSEA_API_KEY=…`. The file is git-ignored and is never read or printed by an agent.
2. The controller runs the inventory with the env file. Use Node's `--env-file` through tsx: `npx tsx --env-file=.env indexer/run.ts …`. Use the same arguments as the workflow; check `.github/workflows/inventory.yml`.
3. Then: `npm test`, `npm run build`, `npm run e2e`, and a visual pass over the listed-price paths, last sales, Gruffters images, BURNCALL, collab names, originals links, index experiments and /activity filters.
4. Commit the regenerated catalog and media as one data commit.

### Later (with the artist): techniques page redesign.
