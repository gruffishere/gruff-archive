# gruff archive — Site Implementation Plan (plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public website: a static Astro site that renders the indexer's catalog (`data/catalog/*`, `public/media/*`) as the "inventory ledger" archive — index, collection, work, activity, keepers, techniques, about, experiments, 404 — plus a Cloudflare Pages Function for the live listed price, ready to deploy on Cloudflare Pages.

**Architecture:** All formatting, linking, sorting and aggregation logic lives in small pure TypeScript modules under `src/lib/` (unit-tested with Vitest). `.astro` pages and components are thin templates over those modules and read the catalog at build time through `src/lib/data.ts`. Client behaviour (hover preview, filters, time scrubber, idle fade, keepers sort/search, live price, print label) is plain TypeScript in `src/scripts/`, bundled by Astro. Every page is generated statically; a build check guards Cloudflare's file limits. Playwright smoke tests run every page type at phone and desktop widths.

**Tech Stack:** Astro (static output), TypeScript, @fontsource/castoro + @fontsource/dm-mono (self-hosted fonts), Vitest, Playwright (chromium), Cloudflare Pages Functions.

**Spec:** `docs/superpowers/specs/2026-11-04-gruff-portfolio-design.md` (sections 5, 6, 7, 8). **Depends on:** plan 1 (indexer) — its output types are imported from `indexer/aggregate/*` as type-only imports.

## Global Constraints

- Entire site in English. Visual language: pure `#000` background, no grain/texture, no accent colour — colour comes only from artworks; previews always in colour.
- Wordmark: Castoro, all lowercase `gruff`, with the SVG ink filter (feTurbulence baseFrequency 0.85, 2 octaves, seed 7 → feDisplacementMap scale 2.6 → feGaussianBlur 0.45 → alpha table `0 0 0.6 1 1`).
- Tagline: `— archive emotions before they fade`, DM Mono Light (300), lowercase, under the wordmark, colour fading left→right (`#bbb` → `#0d0d0d`).
- Everything else DM Mono; ledger elements (accession numbers, titles, labels) uppercase; dotted leaders between label and value; the listed price is the big element (500 weight).
- NEVER: red/blue accent, RGB split, grain overlay, technique labels on work pages.
- Nav (this plan): index · activity · keepers · techniques · experiments · about (visitors' book arrives with plan 3).
- Mobile: every page works from 360 px wide; no horizontal scroll anywhere; touch targets ≥ 44 px; nav collapses to a single `MENU` word.
- Idle fade: after 60 s without input the page slowly fades; any input restores it; disabled under `prefers-reduced-motion`.
- Cloudflare Pages limits: ≤ 20,000 files per deployment (build fails above 19,000), ≤ 25 MiB per file.
- Zero recurring cost. The live price function uses env `OPENSEA_API_KEY` (set by the user in Cloudflare; never committed) and must degrade to the snapshot price when the key or OpenSea is unavailable.
- Artist wallet `0x4730497622bdfd6eafe1f09fa22b3a0aca94a646`; addresses display as ENS or `0x7a3…e91`.
- Commit messages end with a `Co-Authored-By:` trailer naming the model that wrote the commit.
- `public/media/` belongs to the indexer (its gc deletes any unreferenced file there) — the site never writes into it; site assets live in `src/` or `public/` outside `media/`.
- Stored on-chain HTML/SVG artworks run untrusted scripts: embed them only via `<iframe sandbox="allow-scripts">` (never `allow-same-origin`) and serve `/media/*` with `Content-Security-Policy: sandbox allow-scripts` so opening a file directly also runs in an opaque origin.
- Data quirks the pages must handle: `coverTokenId` may be null (Gruffters, Phigures until OpenSea images exist); an ActivityRow `priceWei` is the total for `quantity` units (listing prices are per unit); a keeper can have `firstFromArtist` set while `fromArtist.pieces` is 0 (an unpriced sale from the artist).

## Catalog shapes this plan reads (from plan 1, already committed)

- `data/catalog/collections.json`: `CollectionOut[]` — `code, slug, title, contract, standard ('erc721'|'erc1155'), platform, platformUrl, section ('index'|'experiments'), techniques, wallText, accession, firstMint, lastMint, works, pieces, holders, floorWei, coverTokenId, staleSince`.
- `data/catalog/tokens/<slug>.json`: `TokenOut[]` — `id, accession, name, description, image: StoredMedia|null, animation: StoredMedia|null, mint: {at, txHash, priceWei|null, primary}|null, lastSale: {at, priceWei}|null, listing: {tokenId, priceWei, maker, at}|null, supply, holderCount, owners: {address, ens, quantity, escrow?: true}[], recent: ArchiveEvent[]`.
- `StoredMedia`: `kind ('image'|'svg'|'html'|'video'), thumb, large, file, animated?: true, remote?: string`.
- `data/catalog/keepers.json`: `KeeperOut[]` sorted by pieces — `address, ens, pieces, works, collections, mask, firstAcquired, lastAcquired, fromArtist {pieces, paidWei}, firstFromArtist {slug, tokenId, at, priceWei|null}|null, longestHeld {slug, tokenId, since}|null, holdings {slug, tokenId, quantity}[]`.
- `data/catalog/timeline.json`: `{ month: 'YYYY-MM', collections: {code, works}[], holders }[]`.
- `data/catalog/activity/latest.json` and `activity/YYYY-MM.json`: `ActivityRow[]` newest first — `ArchiveEvent` (`id, kind, contract, tokenId, quantity, from, to, priceWei, txHash, timestamp`) + `slug, code, tokenName, accession, thumb, fromEns, toEns`.
- `data/catalog/meta.json`: `{ lastInventory, ethUsd, sources: {blockscout, opensea}, missingMedia, partial }`.

## File Structure

```
astro.config.mjs, playwright.config.ts, scripts/check-dist.mjs
public/_headers                       cache rules
src/styles/global.css                 tokens + shared ledger classes
src/layouts/Base.astro                html shell, fonts, ink filter, idle fade
src/components/Header.astro           wordmark, tagline, nav
src/components/MediaView.astro        renders a token's media (img/iframe/video/none)
src/components/ActivityTable.astro    ledger of events (work page, /activity, months)
src/components/WallLabel.astro        work-page label column
src/lib/data.ts                       build-time catalog readers
src/lib/format.ts                     eth/usd/date/address/time-ago/labels
src/lib/links.ts                      etherscan/opensea/platform/site paths
src/lib/collections.ts                index ordering, filter tags, layout choice
src/lib/timeline.ts                   time scrubber state
src/lib/media.ts                      choose what to render for a token
src/lib/activity.ts                   collapse mints, group by day, summary
src/lib/keepers.ts                    sort, mask, search
src/lib/techniques.ts                 technique × year, balance, bars
src/lib/label.ts                      print-label text lines
src/scripts/idle.ts, nav.ts, index.ts, work.ts, print-label.ts, keepers.ts, activity.ts
src/pages/index.astro, 404.astro, about.astro, experiments.astro, techniques.astro, keepers.astro
src/pages/c/[slug].astro, w/[slug]/[id].astro, activity/index.astro, activity/[month].astro
functions/lib/listing.ts, functions/api/listing.ts
tests/site/*.test.ts                  Vitest unit tests (+ fixtures/catalog/)
tests/e2e/smoke.spec.ts               Playwright smoke tests
docs/deploy.md                        user-facing deploy steps (Turkish)
```

---

### Task 1: Astro scaffold, design tokens, layout, header, 404, e2e harness

**Files:**
- Create: `astro.config.mjs`, `playwright.config.ts`, `src/styles/global.css`, `src/layouts/Base.astro`, `src/components/Header.astro`, `src/scripts/idle.ts`, `src/scripts/nav.ts`, `src/pages/404.astro`, `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (scripts, deps), `tsconfig.json` (include site code, DOM libs), `.gitignore` (`dist/`, `.astro/`, `test-results/`, `playwright-report/`)

**Interfaces:**
- Produces: `Base.astro` props `{ title: string; description?: string; current?: NavName }`; `Header.astro` props `{ current?: NavName }` where `NavName = 'index'|'activity'|'keepers'|'techniques'|'experiments'|'about'`; CSS classes `.page .k .f .m .lower .lr .lr>.l .lr>.v .lead .price .chip hr`; npm scripts `dev`, `build` (`astro build && node scripts/check-dist.mjs` — check-dist arrives in Task 6, until then `build` is `astro build`), `preview`, `e2e`.

- [ ] **Step 1: Install**

```bash
npm install astro @fontsource/castoro @fontsource/dm-mono
npm install -D @playwright/test
npx playwright install chromium
npm pkg set scripts.dev="astro dev" scripts.build="astro build" scripts.preview="astro preview --port 4321" scripts.e2e="playwright test"
```

- [ ] **Step 2: Config files**

`astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
```

`tsconfig.json` (replace whole file):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["indexer", "tests", "src/lib", "src/scripts", "functions"]
}
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4321' },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4321', reuseExistingServer: true, timeout: 600_000 },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
```

Append to `.gitignore`:

```
dist/
.astro/
test-results/
playwright-report/
```

- [ ] **Step 3: Write the failing e2e test** — `tests/e2e/smoke.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test';

export async function checkPage(page: Page, path: string, status = 200) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const res = await page.goto(path);
  expect(res?.status()).toBe(status);
  await expect(page.locator('header .wm')).toHaveText('gruff');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors.filter((e) => !e.includes('/api/listing'))).toEqual([]);
}

test('404 is a closed room', async ({ page }) => {
  await checkPage(page, '/no-such-room/', 404);
  await expect(page.getByText('this room is closed')).toBeVisible();
});
```

Run: `npm run e2e -- --project=desktop`
Expected: FAIL (build has no pages / no header).

- [ ] **Step 4: `src/styles/global.css`**

```css
:root {
  --bg: #000; --fg: #fff; --muted: #8a8a8a; --dim: #777; --faint: #555; --line: #1e1e1e; --dot: #333;
  --mono: 'DM Mono', ui-monospace, monospace; --serif: 'Castoro', Georgia, serif;
  --gutter: clamp(16px, 4vw, 56px);
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--fg); -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 400 12px/1.5 var(--mono); text-transform: uppercase; letter-spacing: .01em; min-height: 100vh; overflow-x: hidden; transition: opacity 20s linear; }
body.fading { opacity: .06; }
@media (prefers-reduced-motion: reduce) { body { transition: none; } body.fading { opacity: 1; } }
a { color: inherit; text-decoration: none; }
a:hover, a:focus-visible { text-decoration: underline; text-underline-offset: 3px; }
img, video, iframe { max-width: 100%; display: block; }
.k { color: var(--dim); } .f { color: var(--faint); } .m { color: var(--muted); }
.lower { text-transform: none; }
.page { padding: 40px var(--gutter) 64px; max-width: 1600px; margin: 0 auto; }
.lead { display: flex; gap: 8px; min-width: 0; }
.lead::after { content: ''; flex: 1; border-bottom: 1px dotted var(--dot); transform: translateY(-4px); }
.lr { display: flex; gap: 8px; padding: 4px 0; }
.lr > .l { display: flex; flex: 1; gap: 8px; color: var(--dim); }
.lr > .l::after { content: ''; flex: 1; border-bottom: 1px dotted var(--dot); transform: translateY(-4px); }
.lr > .v { text-transform: none; text-align: right; }
.price { font-size: 44px; font-weight: 500; letter-spacing: -.02em; line-height: 1; text-transform: none; margin: 6px 0 10px; }
hr { border: 0; border-top: 1px solid var(--line); margin: 14px 0; }
.chip { color: var(--faint); background: none; border: 0; font: inherit; text-transform: inherit; cursor: pointer; padding: 6px 6px; min-height: 44px; }
.chip[aria-pressed='true'] { color: #000; background: var(--fg); }
.chips { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
@media (max-width: 767px) { body { font-size: 11px; } .price { font-size: 34px; } }
```

- [ ] **Step 5: `src/scripts/idle.ts` and `src/scripts/nav.ts`**

```ts
// idle.ts — after 60 s without input the page fades (CSS handles the slow transition).
const IDLE_MS = 60_000;
let timer: number | undefined;
const wake = () => {
  document.body.classList.remove('fading');
  window.clearTimeout(timer);
  timer = window.setTimeout(() => document.body.classList.add('fading'), IDLE_MS);
};
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel']) window.addEventListener(ev, wake, { passive: true });
  wake();
}
```

```ts
// nav.ts — the MENU toggle on narrow screens.
const button = document.querySelector<HTMLButtonElement>('header .menu');
const list = document.getElementById('nav-list');
button?.addEventListener('click', () => {
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(open));
  list?.classList.toggle('open', open);
});
```

- [ ] **Step 6: `src/components/Header.astro`**

```astro
---
export type NavName = 'index' | 'activity' | 'keepers' | 'techniques' | 'experiments' | 'about';
interface Props { current?: NavName }
const { current } = Astro.props;
const items: [NavName, string][] = [['index', '/'], ['activity', '/activity/'], ['keepers', '/keepers/'], ['techniques', '/techniques/'], ['experiments', '/experiments/'], ['about', '/about/']];
---
<header class="hd page">
  <div class="brand">
    <a href="/" class="wm-link" aria-label="gruff — index"><span class="wm">gruff</span></a>
    <p class="tag">archive emotions before they fade</p>
  </div>
  <nav aria-label="main">
    <button class="menu" type="button" aria-expanded="false" aria-controls="nav-list">menu</button>
    <ul id="nav-list">
      {items.map(([name, href]) => (
        <li><a href={href} aria-current={current === name ? 'page' : undefined}>{name}</a></li>
      ))}
    </ul>
  </nav>
</header>
<style>
  .hd { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 0; }
  .wm { font-family: var(--serif); text-transform: none; font-size: 72px; line-height: .78; filter: url(#ink); display: inline-block; }
  .wm-link:hover { text-decoration: none; }
  .tag { margin: 14px 0 0; font-weight: 300; text-transform: none; font-size: 13px; background: linear-gradient(90deg, #bbb 0%, #999 35%, #444 70%, #0d0d0d 100%); -webkit-background-clip: text; background-clip: text; color: transparent; display: inline-block; }
  .tag::before { content: '— '; }
  nav ul { list-style: none; margin: 0; padding: 0 0 6px; display: flex; flex-wrap: wrap; gap: 4px 0; color: var(--dim); font-size: 11px; }
  nav li + li::before { content: '·'; margin: 0 10px; color: var(--faint); }
  nav a[aria-current='page'] { color: var(--fg); border-bottom: 1px solid var(--fg); }
  .menu { display: none; }
  @media (max-width: 767px) {
    .hd { align-items: flex-start; }
    .wm { font-size: 44px; }
    .tag { font-size: 11px; }
    .menu { display: block; background: none; border: 0; color: var(--fg); font: inherit; text-transform: uppercase; border-bottom: 1px solid var(--dim); min-height: 44px; cursor: pointer; }
    nav ul { display: none; position: absolute; right: var(--gutter); background: var(--bg); flex-direction: column; padding: 12px 0; z-index: 10; }
    nav ul.open { display: flex; }
    nav li + li::before { content: none; }
    nav li a { display: block; padding: 10px 0; }
  }
</style>
<script src="../scripts/nav.ts"></script>
```

- [ ] **Step 7: `src/layouts/Base.astro`**

```astro
---
import '@fontsource/castoro/400.css';
import '@fontsource/dm-mono/300.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '../styles/global.css';
import Header, { type NavName } from '../components/Header.astro';
interface Props { title: string; description?: string; current?: NavName }
const { title, description = 'gruff — archive emotions before they fade.', current } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta name="theme-color" content="#000000" />
  </head>
  <body>
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="d" />
        <feGaussianBlur in="d" stdDeviation="0.45" result="b" />
        <feComponentTransfer in="b"><feFuncA type="table" tableValues="0 0 0.6 1 1" /></feComponentTransfer>
      </filter>
    </svg>
    <Header current={current} />
    <main><slot /></main>
    <slot name="footer" />
    <script src="../scripts/idle.ts"></script>
  </body>
</html>
```

- [ ] **Step 8: `src/pages/404.astro`**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="this room is closed — gruff">
  <section class="page closed">
    <p class="k">404</p>
    <p class="lower big">this room is closed</p>
    <p><a href="/">← back to the index</a></p>
  </section>
</Base>
<style>
  .closed { min-height: 50vh; display: flex; flex-direction: column; justify-content: center; }
  .big { font-size: 28px; margin: 8px 0 24px; }
</style>
```

- [ ] **Step 9: Run the e2e test**

Run: `npm run e2e`
Expected: PASS for both `phone` and `desktop` projects (2 tests).

Also: `npm test` (all indexer tests still pass) and `npm run typecheck` (exit 0).

- [ ] **Step 10: Commit**

```bash
git add astro.config.mjs playwright.config.ts tsconfig.json .gitignore package.json package-lock.json src tests/e2e
git commit -m "feat(site): astro scaffold, ledger design tokens, header, 404

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 2: Catalog readers, formatting and links

**Files:**
- Create: `src/lib/data.ts`, `src/lib/format.ts`, `src/lib/links.ts`, `tests/site/fixtures/catalog/**` (below), `tests/site/data.test.ts`, `tests/site/format.test.ts`, `tests/site/links.test.ts`

**Interfaces:**
- Consumes: types from `indexer/aggregate/{collections,tokens,keepers,timeline,activity}.ts`.
- Produces:
  - `data.ts`: `catalogDir(): string` (env `CATALOG_DIR` or `data/catalog`), `collections(): CollectionOut[]`, `collection(slug): CollectionOut | undefined`, `tokensOf(slug): TokenOut[]`, `keepers(): KeeperOut[]`, `timeline(): TimelineMonth[]`, `meta(): Meta`, `latestActivity(): ActivityRow[]`, `activityMonths(): string[]` (newest first), `activityMonth(month): ActivityRow[]`, `tokenIndex(): Map<string /* slug/id */, { name: string; thumb: string | null; accession: string }>`; re-exported types `CollectionOut, TokenOut, KeeperOut, TimelineMonth, ActivityRow, Meta`.
  - `format.ts`: `formatEth(wei): string | null`, `formatUsd(wei, ethUsd): string | null`, `shortAddress(a)`, `displayName(address, ens)`, `formatDate(iso)` (`DD.MM.YYYY`), `formatMonth(iso)` (`MM.YYYY`), `formatTime(iso)` (`HH:MM` UTC), `timeAgo(iso, now)`, `heldFor(sinceIso, now)` (`3y 8m`), `eventLabel(kind, quantity)`.
  - `links.ts`: `workPath(slug, id)`, `collectionPath(slug)`, `etherscanToken(contract, id)`, `etherscanAddress(address)`, `openseaItem(contract, id)`, `platformLink(collection, id): { label: string; url: string } | null`.

- [ ] **Step 1: Fixtures** — create these small JSON files (used by unit tests only):

`tests/site/fixtures/catalog/collections.json`:

```json
[
  {"code":"SLV","slug":"silver-surfer","title":"SILVER SURFER","contract":"0x3be88adf4d68c32bad5707588c7d25e1af8644e0","standard":"erc721","platform":"manifold","platformUrl":null,"section":"index","techniques":["illustration"],"wallText":null,"accession":"GRF.23.SLV","firstMint":"2023-03-27T10:00:00.000Z","lastMint":"2023-03-29T10:00:00.000Z","works":3,"pieces":3,"holders":3,"floorWei":null,"coverTokenId":"1","staleSince":null},
  {"code":"FCT","slug":"facets","title":"FACETS","contract":"0xa219558e037063879315d6c0dc37aa29e1ed9f07","standard":"erc721","platform":"onchain","platformUrl":null,"section":"index","techniques":["generative","on-chain","pixel"],"wallText":"Unbothered.","accession":"GRF.26.FCT","firstMint":"2026-09-08T10:00:00.000Z","lastMint":"2026-10-01T10:00:00.000Z","works":2222,"pieces":2222,"holders":766,"floorWei":"30000000000000000","coverTokenId":"1","staleSince":null},
  {"code":"OVN","slug":"ovvn","title":"OVVN","contract":"0x11dd77cfda1ffa289522f028977fbfc0fc0fce67","standard":"erc721","platform":"onchain","platformUrl":null,"section":"experiments","techniques":["generative","on-chain"],"wallText":null,"accession":"GRF.26.OVN","firstMint":"2026-09-27T10:00:00.000Z","lastMint":"2026-09-28T10:00:00.000Z","works":401,"pieces":401,"holders":116,"floorWei":null,"coverTokenId":"1","staleSince":null}
]
```

`tests/site/fixtures/catalog/tokens/silver-surfer.json`:

```json
[
  {"id":"1","accession":"GRF.23.SLV.001","name":"'Cosmic Power'","description":"Cosmic Power runs through the body.","image":{"kind":"image","thumb":"/media/a-t.webp","large":"/media/a-l.webp","file":null},"animation":null,"mint":{"at":"2023-03-27T10:00:00.000Z","txHash":"0xm1","priceWei":"100000000000000000","primary":false},"lastSale":{"at":"2025-01-01T00:00:00.000Z","priceWei":"320000000000000000"},"listing":{"tokenId":"1","priceWei":"450000000000000000","maker":"0x00000000000000000000000000000000000000b2","at":"2026-11-01T00:00:00.000Z"},"supply":1,"holderCount":1,"owners":[{"address":"0x00000000000000000000000000000000000000b2","ens":"keeper.eth","quantity":1}],"recent":[{"id":"s1","kind":"sale","contract":"0x3be88adf4d68c32bad5707588c7d25e1af8644e0","tokenId":"1","quantity":1,"from":"0x4730497622bdfd6eafe1f09fa22b3a0aca94a646","to":"0x00000000000000000000000000000000000000b2","priceWei":"320000000000000000","txHash":"0xs1","timestamp":"2025-01-01T00:00:00.000Z"}]},
  {"id":"2","accession":"GRF.23.SLV.002","name":"'Spacewalker'","description":null,"image":{"kind":"image","thumb":"/media/b-t.webp","large":"/media/b.gif","file":"/media/b.gif","animated":true},"animation":null,"mint":{"at":"2023-03-28T10:00:00.000Z","txHash":"0xm2","priceWei":null,"primary":false},"lastSale":null,"listing":null,"supply":1,"holderCount":0,"owners":[{"address":"0x4730497622bdfd6eafe1f09fa22b3a0aca94a646","ens":"gruffdzn.eth","quantity":1}],"recent":[]}
]
```

`tests/site/fixtures/catalog/keepers.json`:

```json
[
  {"address":"0x00000000000000000000000000000000000000b2","ens":"keeper.eth","pieces":3,"works":2,"collections":["SLV","FCT"],"mask":"11","firstAcquired":"2023-04-01T00:00:00.000Z","lastAcquired":"2026-10-01T00:00:00.000Z","fromArtist":{"pieces":2,"paidWei":"350000000000000000"},"firstFromArtist":{"slug":"silver-surfer","tokenId":"1","at":"2025-01-01T00:00:00.000Z","priceWei":"320000000000000000"},"longestHeld":{"slug":"silver-surfer","tokenId":"1","since":"2025-01-01T00:00:00.000Z"},"holdings":[{"slug":"silver-surfer","tokenId":"1","quantity":1}]},
  {"address":"0x00000000000000000000000000000000000000c3","ens":null,"pieces":1,"works":1,"collections":["FCT"],"mask":"01","firstAcquired":"2026-09-20T00:00:00.000Z","lastAcquired":"2026-09-20T00:00:00.000Z","fromArtist":{"pieces":0,"paidWei":"0"},"firstFromArtist":null,"longestHeld":null,"holdings":[]}
]
```

`tests/site/fixtures/catalog/timeline.json`:

```json
[{"month":"2023-03","collections":[{"code":"SLV","works":3}],"holders":1},{"month":"2026-09","collections":[{"code":"SLV","works":3},{"code":"FCT","works":569}],"holders":400}]
```

`tests/site/fixtures/catalog/meta.json`:

```json
{"lastInventory":"2026-11-05T03:00:00.000Z","ethUsd":2260.91,"sources":{"blockscout":"ok","opensea":"skipped"},"missingMedia":[],"partial":false}
```

`tests/site/fixtures/catalog/activity/latest.json` and `tests/site/fixtures/catalog/activity/2025-01.json` (same content):

```json
[{"id":"s1","kind":"sale","contract":"0x3be88adf4d68c32bad5707588c7d25e1af8644e0","tokenId":"1","quantity":1,"from":"0x4730497622bdfd6eafe1f09fa22b3a0aca94a646","to":"0x00000000000000000000000000000000000000b2","priceWei":"320000000000000000","txHash":"0xs1","timestamp":"2025-01-01T00:00:00.000Z","slug":"silver-surfer","code":"SLV","tokenName":"'Cosmic Power'","accession":"GRF.23.SLV.001","thumb":"/media/a-t.webp","fromEns":"gruffdzn.eth","toEns":"keeper.eth"}]
```

Also create `tests/site/fixtures/catalog/activity/2023-03.json` with `[]`.

- [ ] **Step 2: Write the failing tests**

`tests/site/data.test.ts`:

```ts
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
```

`tests/site/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { displayName, eventLabel, formatDate, formatEth, formatMonth, formatTime, formatUsd, heldFor, shortAddress, timeAgo } from '../../src/lib/format';

describe('format', () => {
  it('formats eth with up to 4 decimals', () => {
    expect(formatEth('450000000000000000')).toBe('0.45 Ξ');
    expect(formatEth('65290000000000000')).toBe('0.0652 Ξ');
    expect(formatEth('1000000000000000000')).toBe('1 Ξ');
    expect(formatEth('10000000000000')).toBe('<0.0001 Ξ');
    expect(formatEth('0')).toBe('0 Ξ');
    expect(formatEth(null)).toBeNull();
  });
  it('formats usd from eth price', () => {
    expect(formatUsd('450000000000000000', 2260.91)).toBe('$1,017');
    expect(formatUsd('450000000000000000', null)).toBeNull();
  });
  it('formats addresses and names', () => {
    expect(shortAddress('0x7a3b000000000000000000000000000000000e91')).toBe('0x7a3…e91');
    expect(displayName('0x7a3b000000000000000000000000000000000e91', 'keeper.eth')).toBe('keeper.eth');
    expect(displayName('0x7a3b000000000000000000000000000000000e91', null)).toBe('0x7a3…e91');
  });
  it('formats dates in UTC', () => {
    expect(formatDate('2025-05-26T09:21:11.000Z')).toBe('26.05.2025');
    expect(formatMonth('2023-02-12T00:00:00.000Z')).toBe('02.2023');
    expect(formatTime('2025-05-26T09:21:11.000Z')).toBe('09:21');
  });
  it('formats relative times and durations', () => {
    const now = new Date('2026-11-05T12:00:00.000Z');
    expect(timeAgo('2026-11-05T11:58:00.000Z', now)).toBe('2m ago');
    expect(timeAgo('2026-11-05T09:00:00.000Z', now)).toBe('3h ago');
    expect(timeAgo('2026-11-01T12:00:00.000Z', now)).toBe('4d ago');
    expect(heldFor('2023-03-01T00:00:00.000Z', now)).toBe('3y 8m');
    expect(heldFor('2026-10-20T00:00:00.000Z', now)).toBe('0m');
  });
  it('labels events', () => {
    expect(eventLabel('mint', 3)).toBe('mint ×3');
    expect(eventLabel('sale', 1)).toBe('sale');
  });
});
```

`tests/site/links.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { collectionPath, etherscanAddress, etherscanToken, openseaItem, platformLink, workPath } from '../../src/lib/links';

const C = '0x3be88adf4d68c32bad5707588c7d25e1af8644e0';

describe('links', () => {
  it('builds site paths', () => {
    expect(workPath('silver-surfer', '2')).toBe('/w/silver-surfer/2/');
    expect(collectionPath('facets')).toBe('/c/facets/');
  });
  it('builds explorer and market links', () => {
    expect(etherscanToken(C, '2')).toBe(`https://etherscan.io/nft/${C}/2`);
    expect(etherscanAddress(C)).toBe(`https://etherscan.io/address/${C}`);
    expect(openseaItem(C, '2')).toBe(`https://opensea.io/item/ethereum/${C}/2`);
  });
  it('builds platform links', () => {
    expect(platformLink({ platform: 'foundation', platformUrl: null, contract: C }, '3')).toEqual({ label: 'foundation', url: `https://foundation.app/mint/eth/${C}/3` });
    expect(platformLink({ platform: 'transient', platformUrl: null, contract: C }, '1')).toEqual({ label: 'transient', url: `https://www.transient.xyz/nfts/ethereum/${C}/1` });
    expect(platformLink({ platform: '6529', platformUrl: null, contract: C }, '366')).toEqual({ label: '6529', url: 'https://6529.io/the-memes/366' });
    expect(platformLink({ platform: 'manifold', platformUrl: null, contract: C }, '1')).toBeNull();
    expect(platformLink({ platform: 'manifold', platformUrl: 'https://example.com/x', contract: C }, '1')).toEqual({ label: 'manifold', url: 'https://example.com/x' });
  });
});
```

Run: `npm test -- tests/site`
Expected: FAIL — modules not found.

- [ ] **Step 3: `src/lib/data.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActivityRow } from '../../indexer/aggregate/activity';
import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { KeeperOut } from '../../indexer/aggregate/keepers';
import type { TimelineMonth } from '../../indexer/aggregate/timeline';
import type { TokenOut } from '../../indexer/aggregate/tokens';

export type { ActivityRow, CollectionOut, KeeperOut, TimelineMonth, TokenOut };
export interface Meta {
  lastInventory: string;
  ethUsd: number | null;
  sources: { blockscout: string; opensea: string };
  missingMedia: string[];
  partial: boolean;
}

export const catalogDir = () => process.env.CATALOG_DIR ?? 'data/catalog';
const cache = new Map<string, unknown>();
function cached<T>(key: string, load: () => T): T {
  const k = `${catalogDir()}::${key}`;
  if (!cache.has(k)) cache.set(k, load());
  return cache.get(k) as T;
}
const read = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(catalogDir(), ...parts), 'utf8')) as T;

export const collections = () => cached('collections', () => read<CollectionOut[]>('collections.json'));
export const collection = (slug: string) => collections().find((c) => c.slug === slug);
export const tokensOf = (slug: string) => cached(`tokens:${slug}`, () => read<TokenOut[]>('tokens', `${slug}.json`));
export const keepers = () => cached('keepers', () => read<KeeperOut[]>('keepers.json'));
export const timeline = () => cached('timeline', () => read<TimelineMonth[]>('timeline.json'));
export const meta = () => cached('meta', () => read<Meta>('meta.json'));
export const latestActivity = () => cached('activity:latest', () => read<ActivityRow[]>('activity', 'latest.json'));
export const activityMonths = () =>
  cached('activity:months', () =>
    readdirSync(join(catalogDir(), 'activity'))
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 7))
      .sort()
      .reverse(),
  );
export const activityMonth = (month: string) => read<ActivityRow[]>('activity', `${month}.json`);

export const tokenIndex = () =>
  cached('tokenIndex', () => {
    const m = new Map<string, { name: string; thumb: string | null; accession: string }>();
    for (const c of collections())
      for (const t of tokensOf(c.slug)) m.set(`${c.slug}/${t.id}`, { name: t.name, thumb: t.image?.thumb ?? null, accession: t.accession });
    return m;
  });
```

- [ ] **Step 4: `src/lib/format.ts`**

```ts
import type { EventKind } from '../../indexer/types';

const WEI = 10n ** 18n;
const pad = (n: number) => String(n).padStart(2, '0');

export function formatEth(wei: string | null | undefined): string | null {
  if (wei == null) return null;
  const v = BigInt(wei);
  if (v === 0n) return '0 Ξ';
  const units = (v * 10_000n) / WEI;
  if (units === 0n) return '<0.0001 Ξ';
  const whole = units / 10_000n;
  const frac = (units % 10_000n).toString().padStart(4, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''} Ξ`;
}

export function formatUsd(wei: string | null | undefined, ethUsd: number | null | undefined): string | null {
  if (wei == null || ethUsd == null) return null;
  const eth = Number((BigInt(wei) * 1_000_000n) / WEI) / 1_000_000;
  return `$${Math.round(eth * ethUsd).toLocaleString('en-US')}`;
}

export const shortAddress = (a: string) => `${a.slice(0, 5)}…${a.slice(-3)}`;
export const displayName = (address: string, ens: string | null | undefined) => ens || shortAddress(address);

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}
export function formatMonth(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function timeAgo(iso: string, now: Date): string {
  const s = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function heldFor(sinceIso: string, now: Date): string {
  const a = new Date(sinceIso);
  let months = (now.getUTCFullYear() - a.getUTCFullYear()) * 12 + (now.getUTCMonth() - a.getUTCMonth());
  if (now.getUTCDate() < a.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}

export const eventLabel = (kind: EventKind, quantity: number) => (quantity > 1 ? `${kind} ×${quantity}` : kind);
```

- [ ] **Step 5: `src/lib/links.ts`**

```ts
import type { CollectionOut } from '../../indexer/aggregate/collections';

export const workPath = (slug: string, id: string) => `/w/${slug}/${id}/`;
export const collectionPath = (slug: string) => `/c/${slug}/`;
export const etherscanToken = (contract: string, id: string) => `https://etherscan.io/nft/${contract}/${id}`;
export const etherscanAddress = (address: string) => `https://etherscan.io/address/${address}`;
export const openseaItem = (contract: string, id: string) => `https://opensea.io/item/ethereum/${contract}/${id}`;

export function platformLink(c: Pick<CollectionOut, 'platform' | 'platformUrl' | 'contract'>, id: string): { label: string; url: string } | null {
  switch (c.platform) {
    case 'foundation':
      return { label: 'foundation', url: `https://foundation.app/mint/eth/${c.contract}/${id}` };
    case 'transient':
      return { label: 'transient', url: `https://www.transient.xyz/nfts/ethereum/${c.contract}/${id}` };
    case '6529':
      return { label: '6529', url: `https://6529.io/the-memes/${id}` };
    default:
      return c.platformUrl ? { label: c.platform, url: c.platformUrl } : null;
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/site`
Expected: PASS (11 tests). Then `npm test` and `npm run typecheck` exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib tests/site
git commit -m "feat(site): catalog readers, formatting and links

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 3: Index page — ledger rows, filters, hover preview, pulse

**Files:**
- Create: `src/lib/collections.ts`, `src/lib/media.ts`, `src/components/MediaView.astro`, `src/pages/index.astro`, `src/scripts/index.ts`, `tests/site/collections.test.ts`, `tests/site/media.test.ts`
- Modify: `tests/e2e/smoke.spec.ts` (add index test)

**Interfaces:**
- Consumes: `data.ts`, `format.ts`, `links.ts`.
- Produces:
  - `collections.ts`: `type IndexFilter = 'all'|'one-of-one'|'editions'|'generative'|'on-chain'`; `INDEX_FILTERS: { key: IndexFilter; label: string }[]`; `filterTags(c): IndexFilter[]`; `indexCollections(all): CollectionOut[]` (section index, newest first by firstMint); `experimentCollections(all)`; `archiveSpan(all): string` (`2023—2026`); `firstYear(c): string`; `layoutOf(c): 'column'|'grid'` (≤ 12 works → column).
  - `media.ts`: `type MediaKind = 'img'|'iframe'|'video'|'none'`; `interface MediaChoice { kind: MediaKind; src: string | null; pixelated: boolean }`; `chooseMedia(t: TokenOut, size: 'thumb'|'large'): MediaChoice`.
  - `MediaView.astro` props `{ token: TokenOut; size: 'thumb'|'large'; alt: string; eager?: boolean }`.
  - Row markup contract used by `scripts/index.ts` and Task 4: each row `<a class="row" data-code data-filters="all generative …" data-preview data-title data-meta data-price>`; counters `#count-collections`, `#count-keepers`; rows container `#ledger`.

- [ ] **Step 1: Failing tests**

`tests/site/collections.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CollectionOut } from '../../src/lib/data';
import { archiveSpan, experimentCollections, filterTags, firstYear, indexCollections, layoutOf } from '../../src/lib/collections';

const c = (p: Partial<CollectionOut>) => ({ code: 'X', slug: 'x', title: 'X', contract: '0x', standard: 'erc721', platform: 'manifold', platformUrl: null, section: 'index', techniques: ['illustration'], wallText: null, accession: 'GRF.23.X', firstMint: '2023-01-01T00:00:00.000Z', lastMint: null, works: 3, pieces: 3, holders: 1, floorWei: null, coverTokenId: '1', staleSince: null, ...p }) as CollectionOut;

describe('collections', () => {
  it('tags collections for the index filters', () => {
    expect(filterTags(c({}))).toEqual(['all', 'one-of-one']);
    expect(filterTags(c({ standard: 'erc1155' }))).toEqual(['all', 'editions']);
    expect(filterTags(c({ techniques: ['generative', 'on-chain'] }))).toEqual(['all', 'generative', 'on-chain']);
  });
  it('orders the index newest first and keeps experiments apart', () => {
    const all = [c({ code: 'A', firstMint: '2023-01-01T00:00:00.000Z' }), c({ code: 'B', firstMint: '2026-09-01T00:00:00.000Z' }), c({ code: 'E', section: 'experiments' })];
    expect(indexCollections(all).map((x) => x.code)).toEqual(['B', 'A']);
    expect(experimentCollections(all).map((x) => x.code)).toEqual(['E']);
    expect(archiveSpan(all)).toBe('2023—2026');
  });
  it('picks a layout and a year', () => {
    expect(layoutOf(c({ works: 12 }))).toBe('column');
    expect(layoutOf(c({ works: 13 }))).toBe('grid');
    expect(firstYear(c({ firstMint: null }))).toBe('—');
    expect(firstYear(c({}))).toBe('2023');
  });
});
```

`tests/site/media.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TokenOut } from '../../src/lib/data';
import { chooseMedia } from '../../src/lib/media';

const t = (p: Partial<TokenOut>) => ({ image: null, animation: null, ...p }) as TokenOut;

describe('chooseMedia', () => {
  it('uses webp sizes for static images', () => {
    const tok = t({ image: { kind: 'image', thumb: '/media/a-t.webp', large: '/media/a-l.webp', file: null } });
    expect(chooseMedia(tok, 'thumb')).toEqual({ kind: 'img', src: '/media/a-t.webp', pixelated: false });
    expect(chooseMedia(tok, 'large')).toEqual({ kind: 'img', src: '/media/a-l.webp', pixelated: false });
  });
  it('shows the original animated file large and the static frame as thumb', () => {
    const tok = t({ image: { kind: 'image', thumb: '/media/b-t.webp', large: '/media/b.gif', file: '/media/b.gif', animated: true } });
    expect(chooseMedia(tok, 'large').src).toBe('/media/b.gif');
    expect(chooseMedia(tok, 'thumb').src).toBe('/media/b-t.webp');
    const big = t({ image: { kind: 'image', thumb: '/media/c-t.webp', large: null, file: null, animated: true, remote: 'https://arweave.net/x' } });
    expect(chooseMedia(big, 'large').src).toBe('https://arweave.net/x');
  });
  it('renders svg pixel art crisp and html animations in an iframe', () => {
    const tok = t({ image: { kind: 'svg', thumb: '/media/f.svg', large: '/media/f.svg', file: '/media/f.svg' }, animation: { kind: 'html', thumb: null, large: null, file: '/media/f.html' } });
    expect(chooseMedia(tok, 'thumb')).toEqual({ kind: 'img', src: '/media/f.svg', pixelated: true });
    expect(chooseMedia(tok, 'large')).toEqual({ kind: 'iframe', src: '/media/f.html', pixelated: false });
  });
  it('handles video and missing media', () => {
    expect(chooseMedia(t({ image: { kind: 'video', thumb: null, large: null, file: '/media/v.mp4' } }), 'large')).toEqual({ kind: 'video', src: '/media/v.mp4', pixelated: false });
    expect(chooseMedia(t({}), 'large')).toEqual({ kind: 'none', src: null, pixelated: false });
    expect(chooseMedia(t({ animation: { kind: 'html', thumb: null, large: null, file: '/media/p.html' } }), 'thumb').kind).toBe('none');
  });
});
```

Run: `npm test -- tests/site/collections.test.ts tests/site/media.test.ts` → FAIL (modules not found).

- [ ] **Step 2: `src/lib/collections.ts`**

```ts
import type { CollectionOut } from '../../indexer/aggregate/collections';

export type IndexFilter = 'all' | 'one-of-one' | 'editions' | 'generative' | 'on-chain';
export const INDEX_FILTERS: { key: IndexFilter; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'one-of-one', label: '1/1' },
  { key: 'editions', label: 'editions' },
  { key: 'generative', label: 'generative' },
  { key: 'on-chain', label: 'on-chain' },
];

export function filterTags(c: CollectionOut): IndexFilter[] {
  const tags: IndexFilter[] = ['all'];
  const generative = c.techniques.includes('generative');
  if (c.standard === 'erc1155') tags.push('editions');
  else if (!generative) tags.push('one-of-one');
  if (generative) tags.push('generative');
  if (c.techniques.includes('on-chain')) tags.push('on-chain');
  return tags;
}

const byFirstMintDesc = (a: CollectionOut, b: CollectionOut) => (b.firstMint ?? '').localeCompare(a.firstMint ?? '');
export const indexCollections = (all: CollectionOut[]) => all.filter((c) => c.section === 'index').sort(byFirstMintDesc);
export const experimentCollections = (all: CollectionOut[]) => all.filter((c) => c.section === 'experiments').sort(byFirstMintDesc);
export const firstYear = (c: CollectionOut) => c.firstMint?.slice(0, 4) ?? '—';
export function archiveSpan(all: CollectionOut[]): string {
  const years = all.flatMap((c) => [c.firstMint, c.lastMint]).filter((x): x is string => !!x).map((x) => x.slice(0, 4)).sort();
  return years.length ? `${years[0]}—${years.at(-1)}` : '—';
}
export const layoutOf = (c: CollectionOut): 'column' | 'grid' => (c.works <= 12 ? 'column' : 'grid');
```

(`filterTags` order: `all`, then `editions` or `one-of-one`, then `generative`, `on-chain` — matches the test.)

- [ ] **Step 3: `src/lib/media.ts`**

```ts
import type { TokenOut } from '../../indexer/aggregate/tokens';

export type MediaKind = 'img' | 'iframe' | 'video' | 'none';
export interface MediaChoice { kind: MediaKind; src: string | null; pixelated: boolean }
const NONE: MediaChoice = { kind: 'none', src: null, pixelated: false };

export function chooseMedia(t: TokenOut, size: 'thumb' | 'large'): MediaChoice {
  const img = t.image;
  if (size === 'large' && t.animation?.kind === 'html' && t.animation.file) return { kind: 'iframe', src: t.animation.file, pixelated: false };
  if (!img) return NONE;
  if (img.kind === 'video') return size === 'large' && img.file ? { kind: 'video', src: img.file, pixelated: false } : img.thumb ? { kind: 'img', src: img.thumb, pixelated: false } : NONE;
  if (img.kind === 'svg') return { kind: 'img', src: (size === 'thumb' ? img.thumb : img.large) ?? img.file, pixelated: true };
  if (img.kind === 'html') return size === 'large' && img.file ? { kind: 'iframe', src: img.file, pixelated: false } : NONE;
  const src = size === 'thumb' ? img.thumb : (img.large ?? img.remote ?? img.thumb);
  return src ? { kind: 'img', src, pixelated: false } : NONE;
}
```

- [ ] **Step 4: Run unit tests** — `npm test -- tests/site` → PASS.

- [ ] **Step 5: `src/components/MediaView.astro`**

```astro
---
import type { TokenOut } from '../lib/data';
import { chooseMedia } from '../lib/media';
interface Props { token: TokenOut; size: 'thumb' | 'large'; alt: string; eager?: boolean }
const { token, size, alt, eager = false } = Astro.props;
const m = chooseMedia(token, size);
---
{m.kind === 'img' && <img class:list={['mv', size, { px: m.pixelated }]} src={m.src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />}
{m.kind === 'iframe' && <iframe class:list={['mv', size]} src={m.src} title={alt} sandbox="allow-scripts" loading={eager ? 'eager' : 'lazy'} />}
{m.kind === 'video' && <video class:list={['mv', size]} src={m.src} autoplay muted loop playsinline preload="metadata" aria-label={alt} />}
{m.kind === 'none' && <div class:list={['mv', size, 'empty']} role="img" aria-label={alt}><span class="f">{token.accession}</span></div>}
<style>
  .mv { width: 100%; background: #050505; }
  .mv.large { aspect-ratio: auto; height: auto; max-height: 82vh; object-fit: contain; }
  iframe.mv, .mv.empty { aspect-ratio: 1 / 1; border: 0; height: auto; }
  .mv.thumb { aspect-ratio: 1 / 1; object-fit: cover; }
  .px { image-rendering: pixelated; }
  .empty { display: flex; align-items: center; justify-content: center; font-size: 10px; }
</style>
```

- [ ] **Step 6: `src/pages/index.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import { collections, latestActivity, meta, timeline, tokensOf } from '../lib/data';
import { archiveSpan, filterTags, firstYear, indexCollections, INDEX_FILTERS } from '../lib/collections';
import { chooseMedia } from '../lib/media';
import { eventLabel, formatEth, timeAgo } from '../lib/format';
import { collectionPath, workPath } from '../lib/links';

const all = collections();
const rows = indexCollections(all).map((c) => {
  const cover = tokensOf(c.slug).find((t) => t.id === c.coverTokenId) ?? tokensOf(c.slug)[0];
  const preview = cover ? (chooseMedia(cover, 'large').kind === 'img' && !cover.image?.animated ? chooseMedia(cover, 'large').src : chooseMedia(cover, 'thumb').src) : null;
  const price = cover?.listing ? formatEth(cover.listing.priceWei) : null;
  return { c, cover, preview, price };
});
const m = meta();
const now = new Date(m.lastInventory);
const latest = latestActivity()[0];
const keepersTotal = timeline().at(-1)?.holders ?? 0;
const months = timeline().map((t) => t.month);
---
<Base title="gruff — archive" current="index">
  <section class="page index">
    <div class="meta-line">
      <span><span id="count-span">{archiveSpan(all)}</span> · <span id="count-collections">{rows.length}</span> collections · <span id="count-keepers">{keepersTotal}</span> keepers</span>
      <span class="k" id="scrub-label">archive as of: now</span>
    </div>
    <div id="scrubber" data-timeline={JSON.stringify(timeline())} data-months={JSON.stringify(months)}></div>
    <div class="chips" role="group" aria-label="filter">
      {INDEX_FILTERS.map((f) => <button class="chip" type="button" data-filter={f.key} aria-pressed={f.key === 'all' ? 'true' : 'false'}>{f.label}</button>)}
    </div>
    <div class="grid">
      <div>
        <div class="row head f" aria-hidden="true"><span>no.</span><span>title</span><span class="pl">platform</span><span>year</span><span class="n">works</span></div>
        <div id="ledger">
          {rows.map(({ c, cover, preview, price }) => (
            <a class="row" href={collectionPath(c.slug)} data-code={c.code} data-filters={filterTags(c).join(' ')} data-preview={preview ?? ''} data-title={`${c.title} — gruff, ${firstYear(c)}`} data-meta={`${c.accession} · ${c.standard === 'erc1155' ? `${c.pieces} pieces` : `${c.works} works`}`} data-price={price ?? ''}>
              {cover && preview && <img class="th" src={chooseMedia(cover, 'thumb').src ?? preview} alt="" loading="lazy" />}
              <span class="k acc">{c.accession}</span>
              <span class="lead t">{c.title}</span>
              <span class="k pl">{c.platform}</span>
              <span class="k">{firstYear(c)}</span>
              <span class="n m" data-works>{c.works}</span>
            </a>
          ))}
        </div>
      </div>
      <aside class="pv" aria-hidden="true">
        <img id="pv-img" alt="" />
        <div class="lbl">
          <div class="k" id="pv-meta"></div>
          <div id="pv-title"></div>
          <div class="k" id="pv-listed-label">listed</div>
          <div class="price" id="pv-price"></div>
        </div>
      </aside>
    </div>
  </section>
  <footer slot="footer" class="page foot">
    {latest && <a href={workPath(latest.slug, latest.tokenId)}>latest: <span class="m">{latest.tokenName} {eventLabel(latest.kind, latest.quantity)}{latest.priceWei ? ` ${formatEth(latest.priceWei)}` : ''}</span> · {timeAgo(latest.timestamp, now)} →</a>}
    <span class="k">last inventory: <span data-ago={m.lastInventory}>{timeAgo(m.lastInventory, now)}</span></span>
  </footer>
</Base>
<style>
  .meta-line { display: flex; justify-content: space-between; gap: 12px; color: var(--dim); margin: 26px 0 0; flex-wrap: wrap; }
  .chips { margin: 14px 0 6px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 56px; align-items: start; }
  .row { display: grid; grid-template-columns: 118px minmax(0, 1fr) 104px 52px 64px; gap: 12px; align-items: baseline; padding: 5px 0; }
  .row.head { font-size: 10px; padding-bottom: 6px; }
  .row .n { text-align: right; }
  .row .th { display: none; }
  .row[hidden] { display: none; }
  #ledger .row:hover, #ledger .row:focus-visible { background: var(--fg); color: #000; text-decoration: none; margin: 0 -10px; padding: 5px 10px; }
  #ledger .row:hover .k, #ledger .row:hover .m, #ledger .row:focus-visible .k { color: #000; }
  #ledger .row:hover .lead::after { border-color: #000; }
  .pv { position: sticky; top: 24px; opacity: 0; transition: opacity .8s ease; }
  .pv.on { opacity: 1; }
  .pv img { width: 100%; max-height: 62vh; object-fit: contain; }
  .lbl { margin-top: 14px; font-size: 11px; line-height: 1.7; }
  .foot { display: flex; justify-content: space-between; gap: 12px; color: var(--dim); font-size: 11px; padding-top: 0; flex-wrap: wrap; }
  @media (max-width: 1023px) { .grid { grid-template-columns: 1fr; } .pv { display: none; } }
  @media (max-width: 767px) {
    .row { grid-template-columns: 40px minmax(0, 1fr) auto; grid-template-areas: 'th acc y' 'th t t'; row-gap: 0; padding: 8px 0; border-top: 1px solid var(--line); }
    .row.head { display: none; }
    .row .th { display: block; grid-area: th; width: 40px; height: 40px; object-fit: cover; }
    .row .acc { grid-area: acc; font-size: 9px; }
    .row .t { grid-area: t; }
    .row .pl, .row .n { display: none; }
    .row > span:nth-child(5) { grid-area: y; }
    #ledger .row:hover { margin: 0; padding: 8px 0; }
  }
</style>
<script src="../scripts/index.ts"></script>
```

- [ ] **Step 7: `src/scripts/index.ts`** (filters + hover preview; the scrubber hooks in Task 4)

```ts
const ledger = document.getElementById('ledger');
const rows = Array.from(ledger?.querySelectorAll<HTMLAnchorElement>('a.row') ?? []);
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip[data-filter]'));

export const state = { filter: 'all', hiddenByTime: new Set<string>() };

export function applyVisibility() {
  for (const r of rows) {
    const tags = (r.dataset.filters ?? '').split(' ');
    r.hidden = !tags.includes(state.filter) || state.hiddenByTime.has(r.dataset.code ?? '');
  }
}

for (const chip of chips)
  chip.addEventListener('click', () => {
    state.filter = chip.dataset.filter ?? 'all';
    for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
    applyVisibility();
  });

const pv = document.querySelector<HTMLElement>('.pv');
const img = document.getElementById('pv-img') as HTMLImageElement | null;
const set = (id: string, text: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};
for (const r of rows) {
  const show = () => {
    if (!pv || !img || !r.dataset.preview) return;
    img.src = r.dataset.preview;
    set('pv-meta', r.dataset.meta ?? '');
    set('pv-title', r.dataset.title ?? '');
    set('pv-price', r.dataset.price || 'not listed');
    pv.classList.add('on');
  };
  r.addEventListener('mouseenter', show);
  r.addEventListener('focus', show);
  r.addEventListener('mouseleave', () => pv?.classList.remove('on'));
}
```

- [ ] **Step 8: Add the e2e test** (append to `tests/e2e/smoke.spec.ts`)

```ts
test('index lists the collections and filters them', async ({ page }) => {
  await checkPage(page, '/');
  const rows = page.locator('#ledger a.row');
  await expect(rows).toHaveCount(16);
  await page.getByRole('button', { name: 'on-chain' }).click();
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(2);
  await expect(page.getByText(/last inventory:/i)).toBeVisible();
});
```

Run: `npm run e2e` → PASS (4 tests: 404 + index × 2 projects). `npm test`, `npm run typecheck` → exit 0.

- [ ] **Step 9: Commit**

```bash
git add src tests
git commit -m "feat(site): index ledger with filters, hover preview and pulse line

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 4: Time scrubber

**Files:**
- Create: `src/lib/timeline.ts`, `tests/site/timeline.test.ts`
- Modify: `src/scripts/index.ts` (build and wire the scrubber), `src/pages/index.astro` (scrubber styles), `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `#scrubber[data-timeline][data-months]`, rows `[data-code]` with `[data-works]` cell, `#count-collections`, `#count-keepers`, `#scrub-label`, and `state` / `applyVisibility()` from `scripts/index.ts`.
- Produces: `timeline.ts`: `interface ArchiveState { month: string; works: Record<string, number>; holders: number }`; `archiveAt(timeline, month): ArchiveState`; `monthLabel(month): string` (`MM.YYYY`).

- [ ] **Step 1: Failing test** — `tests/site/timeline.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { archiveAt, monthLabel } from '../../src/lib/timeline';

const tl = [
  { month: '2023-01', collections: [{ code: 'VBS', works: 2 }], holders: 10 },
  { month: '2023-02', collections: [{ code: 'VBS', works: 3 }, { code: 'ONE', works: 1 }], holders: 25 },
];

describe('archiveAt', () => {
  it('returns the archive at a month', () => {
    expect(archiveAt(tl, '2023-02')).toEqual({ month: '2023-02', works: { VBS: 3, ONE: 1 }, holders: 25 });
  });
  it('uses the latest month not after the requested one', () => {
    expect(archiveAt(tl, '2023-05').holders).toBe(25);
  });
  it('is empty before the archive began', () => {
    expect(archiveAt(tl, '2022-12')).toEqual({ month: '2022-12', works: {}, holders: 0 });
  });
  it('labels months', () => {
    expect(monthLabel('2023-02')).toBe('02.2023');
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/lib/timeline.ts`**

```ts
import type { TimelineMonth } from '../../indexer/aggregate/timeline';

export interface ArchiveState { month: string; works: Record<string, number>; holders: number }

export function archiveAt(timeline: TimelineMonth[], month: string): ArchiveState {
  let found: TimelineMonth | undefined;
  for (const t of timeline) if (t.month <= month) found = t;
  if (!found) return { month, works: {}, holders: 0 };
  return { month, works: Object.fromEntries(found.collections.map((c) => [c.code, c.works])), holders: found.holders };
}

export const monthLabel = (month: string) => `${month.slice(5, 7)}.${month.slice(0, 4)}`;
```

Run tests → PASS.

- [ ] **Step 3: Wire the scrubber** — append to `src/scripts/index.ts`

```ts
import { archiveAt, monthLabel } from '../lib/timeline';
import type { TimelineMonth } from '../../indexer/aggregate/timeline';

const host = document.getElementById('scrubber');
if (host) {
  const tl = JSON.parse(host.dataset.timeline ?? '[]') as TimelineMonth[];
  const months = JSON.parse(host.dataset.months ?? '[]') as string[];
  if (months.length > 1) {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(months.length - 1);
    input.value = input.max;
    input.step = '1';
    input.setAttribute('aria-label', 'archive through time');
    host.append(input);
    const ticks = document.createElement('div');
    ticks.className = 'ticks';
    for (const [i, m] of months.entries())
      if (m.endsWith('-01')) {
        const s = document.createElement('span');
        s.textContent = m.slice(0, 4);
        s.style.left = `${(i / (months.length - 1)) * 100}%`;
        ticks.append(s);
      }
    host.append(ticks);
    const originalWorks = new Map(rows.map((r) => [r.dataset.code ?? '', r.querySelector('[data-works]')?.textContent ?? '']));
    const update = () => {
      const i = Number(input.value);
      const isNow = i === months.length - 1;
      const a = archiveAt(tl, months[i]);
      state.hiddenByTime = new Set(isNow ? [] : rows.map((r) => r.dataset.code ?? '').filter((code) => !(code in a.works)));
      for (const r of rows) {
        const cell = r.querySelector('[data-works]');
        if (cell) cell.textContent = isNow ? (originalWorks.get(r.dataset.code ?? '') ?? '') : String(a.works[r.dataset.code ?? ''] ?? 0);
      }
      const label = document.getElementById('scrub-label');
      if (label) label.textContent = isNow ? 'archive as of: now' : `archive as of: ${monthLabel(months[i])}`;
      const visible = rows.filter((r) => !state.hiddenByTime.has(r.dataset.code ?? '')).length;
      const cc = document.getElementById('count-collections');
      if (cc) cc.textContent = String(visible);
      const ck = document.getElementById('count-keepers');
      if (ck) ck.textContent = String(a.holders);
      applyVisibility();
    };
    input.addEventListener('input', update);
  }
}
```

Move the two `import` lines to the top of the file.

- [ ] **Step 4: Scrubber styles** — add inside the `<style>` of `src/pages/index.astro`

```css
#scrubber { position: relative; margin: 14px 0 22px; }
#scrubber input { width: 100%; appearance: none; background: none; height: 28px; margin: 0; }
#scrubber input::-webkit-slider-runnable-track { height: 1px; background: var(--dot); }
#scrubber input::-moz-range-track { height: 1px; background: var(--dot); }
#scrubber input::-webkit-slider-thumb { appearance: none; width: 10px; height: 10px; background: var(--fg); margin-top: -5px; border: 0; }
#scrubber input::-moz-range-thumb { width: 10px; height: 10px; background: var(--fg); border: 0; border-radius: 0; }
#scrubber .ticks { position: relative; height: 12px; color: var(--faint); font-size: 9px; }
#scrubber .ticks span { position: absolute; transform: translateX(-50%); }
#scrubber .ticks span:first-child { transform: none; }
```

- [ ] **Step 5: e2e** (append)

```ts
test('time scrubber rewinds the archive', async ({ page }) => {
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'archive through time' });
  await slider.focus();
  await slider.press('Home');
  await expect(page.locator('#scrub-label')).toContainText('01.2023');
  expect(await page.locator('#ledger a.row:visible').count()).toBeLessThan(16);
  await slider.press('End');
  await expect(page.locator('#scrub-label')).toHaveText('archive as of: now');
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(16);
});
```

Run `npm run e2e`, `npm test`, `npm run typecheck` → all pass.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(site): time scrubber on the index

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 5: Collection pages

**Files:**
- Create: `src/pages/c/[slug].astro`
- Modify: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `collections()`, `tokensOf()`, `layoutOf()`, `firstYear()`, `MediaView`, `formatEth`, `workPath`, `displayName`.
- Produces: `/c/<slug>/` for every collection (index and experiments).

- [ ] **Step 1: e2e test first** (append)

```ts
test('collection pages show their works', async ({ page }) => {
  await checkPage(page, '/c/silver-surfer/');
  await expect(page.locator('.works a.work')).toHaveCount(3);
  await checkPage(page, '/c/facets/');
  expect(await page.locator('.works a.work').count()).toBeGreaterThan(500);
});
```

Run `npm run e2e -- -g collection` → FAIL (404).

- [ ] **Step 2: `src/pages/c/[slug].astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import MediaView from '../../components/MediaView.astro';
import { collections, tokensOf, type CollectionOut } from '../../lib/data';
import { firstYear, layoutOf } from '../../lib/collections';
import { displayName, formatEth } from '../../lib/format';
import { workPath } from '../../lib/links';

export function getStaticPaths() {
  return collections().map((c) => ({ params: { slug: c.slug }, props: { c } }));
}
const { c } = Astro.props as { c: CollectionOut };
const tokens = tokensOf(c.slug).filter((t) => t.supply > 0 || t.image);
const layout = layoutOf(c);
const span = c.lastMint && c.lastMint.slice(0, 4) !== firstYear(c) ? `${firstYear(c)}–${c.lastMint.slice(0, 4)}` : firstYear(c);
---
<Base title={`${c.title} — gruff`} description={c.wallText ?? `${c.title} by gruff, ${span}.`} current={c.section === 'experiments' ? 'experiments' : 'index'}>
  <section class="page">
    <p class="k crumbs"><a href={c.section === 'experiments' ? '/experiments/' : '/'}>← {c.section === 'experiments' ? 'experiments' : 'index'}</a> · {c.accession}</p>
    <h1 class="title">{c.title}</h1>
    <p class="k">gruff, {span} · {c.platform} · {c.standard}</p>
    {c.wallText && <p class="lower wall">{c.wallText}</p>}
    <div class="stats">
      <div class="lr"><span class="l">works</span><span class="v">{c.works}</span></div>
      {c.standard === 'erc1155' && <div class="lr"><span class="l">pieces</span><span class="v">{c.pieces}</span></div>}
      <div class="lr"><span class="l">keepers</span><span class="v">{c.holders}</span></div>
      {c.floorWei && <div class="lr"><span class="l">floor</span><span class="v">{formatEth(c.floorWei)}</span></div>}
    </div>
    <div class:list={['works', layout]}>
      {tokens.map((t, i) => (
        <a class="work" href={workPath(c.slug, t.id)}>
          <MediaView token={t} size={layout === 'column' ? 'large' : 'thumb'} alt={t.name} eager={i < 4} />
          {layout === 'column' ? (
            <div class="cap">
              <span class="k">{t.accession}</span>
              <span class="lower">{t.name}</span>
              <span class="k">{t.listing ? `listed ${formatEth(t.listing.priceWei)}` : 'not listed'}{t.owners[0] ? ` · ${displayName(t.owners[0].address, t.owners[0].ens)}` : ''}</span>
            </div>
          ) : (
            <span class="k cap-s">{t.accession.split('.').at(-1)}</span>
          )}
        </a>
      ))}
    </div>
  </section>
</Base>
<style>
  .crumbs { margin: 26px 0 8px; }
  .title { font: 500 20px/1.2 var(--mono); margin: 0 0 4px; }
  .wall { max-width: 640px; color: #aaa; line-height: 1.7; margin: 16px 0; }
  .stats { max-width: 420px; margin: 18px 0 34px; }
  .works.column { display: grid; gap: 64px; max-width: 900px; }
  .works.column .cap { display: flex; flex-direction: column; gap: 2px; margin-top: 12px; }
  .works.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .works.grid .cap-s { display: block; font-size: 9px; margin-top: 4px; }
  .work:hover { text-decoration: none; }
  @media (max-width: 767px) { .works.grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; } }
</style>
```

- [ ] **Step 3: Run** `npm run e2e`, `npm test`, `npm run typecheck` → pass.

- [ ] **Step 4: Commit**

```bash
git add src tests
git commit -m "feat(site): collection pages

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 6: Work pages (wall label, activity, keyboard nav) + dist checks

**Files:**
- Create: `src/components/WallLabel.astro`, `src/components/ActivityTable.astro`, `src/pages/w/[slug]/[id].astro`, `src/scripts/work.ts`, `scripts/check-dist.mjs`, `src/lib/activity.ts` (only `toDisplayRows` here; Task 9 extends it), `tests/site/activity.test.ts`
- Modify: `package.json` (`build` → `astro build && node scripts/check-dist.mjs`), `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `data.ts`, `format.ts`, `links.ts`, `MediaView`.
- Produces:
  - `activity.ts`: `interface DisplayRow { key: string; kind: EventKind; label: string; timestamp: string; slug: string; tokenId: string; ids: string[]; tokenName: string; accession: string; thumb: string | null; from: string | null; fromName: string | null; to: string | null; toName: string | null; priceWei: string | null }`; `toDisplayRows(rows: ActivityRow[]): DisplayRow[]` (one display row per event; Task 9 adds mint collapsing).
  - `ActivityTable.astro` props `{ rows: DisplayRow[]; showWork?: boolean; groupDays?: boolean }`.
  - `WallLabel.astro` props `{ c: CollectionOut; t: TokenOut; ethUsd: number | null; asOf: string }`; elements `#live-price` (`data-contract`, `data-id`, `data-snapshot`), `#price-label`, `#price-note` used by Task 7; button `#print-label` used by Task 8.
  - Work page `/w/<slug>/<id>/` for every token; prev/next links `a[rel=prev]`, `a[rel=next]`.

- [ ] **Step 1: Failing unit test** — `tests/site/activity.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { ActivityRow } from '../../src/lib/data';
import { toDisplayRows } from '../../src/lib/activity';

export const row = (p: Partial<ActivityRow>): ActivityRow => ({
  id: 'e1', kind: 'sale', contract: '0xc', tokenId: '1', quantity: 1, from: '0x00000000000000000000000000000000000000a1', to: '0x00000000000000000000000000000000000000b2',
  priceWei: '1000', txHash: '0xt', timestamp: '2026-11-04T14:02:00.000Z', slug: 'worthless', code: '366', tokenName: 'WORTHLESS', accession: 'GRF.25.366', thumb: '/media/w-t.webp', fromEns: null, toEns: 'keeper.eth', ...p,
});

describe('toDisplayRows', () => {
  it('maps an event to a display row with names', () => {
    expect(toDisplayRows([row({})])[0]).toMatchObject({ key: 'e1', label: 'sale', ids: ['1'], fromName: '0x000…0a1', toName: 'keeper.eth' });
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/lib/activity.ts`**

```ts
import type { ActivityRow } from '../../indexer/aggregate/activity';
import type { EventKind } from '../../indexer/types';
import { displayName, eventLabel } from './format';

export interface DisplayRow {
  key: string;
  kind: EventKind;
  label: string;
  timestamp: string;
  slug: string;
  tokenId: string;
  ids: string[];
  tokenName: string;
  accession: string;
  thumb: string | null;
  from: string | null;
  fromName: string | null;
  to: string | null;
  toName: string | null;
  priceWei: string | null;
}

export function toDisplayRows(rows: ActivityRow[]): DisplayRow[] {
  return rows.map((r) => ({
    key: r.id,
    kind: r.kind,
    label: eventLabel(r.kind, r.quantity),
    timestamp: r.timestamp,
    slug: r.slug,
    tokenId: r.tokenId,
    ids: [r.tokenId],
    tokenName: r.tokenName,
    accession: r.accession,
    thumb: r.thumb,
    from: r.from,
    fromName: r.from ? displayName(r.from, r.fromEns) : null,
    to: r.to,
    toName: r.to ? displayName(r.to, r.toEns) : null,
    priceWei: r.priceWei,
  }));
}
```

Run → PASS.

- [ ] **Step 3: `src/components/ActivityTable.astro`**

```astro
---
import type { DisplayRow } from '../lib/activity';
import { formatDate, formatEth, formatTime } from '../lib/format';
import { workPath } from '../lib/links';
interface Props { rows: DisplayRow[]; showWork?: boolean; groupDays?: boolean }
const { rows, showWork = false, groupDays = false } = Astro.props;
const groups: { day: string; rows: DisplayRow[] }[] = [];
for (const r of rows) {
  const day = formatDate(r.timestamp);
  if (!groupDays || groups.at(-1)?.day !== day) groups.push({ day, rows: [] });
  groups.at(-1)!.rows.push(r);
}
const who = (r: DisplayRow) => (r.kind === 'mint' ? `→ ${r.toName}` : r.kind === 'listed' ? `by ${r.fromName}` : r.kind === 'burn' ? `${r.fromName} → burned` : `${r.fromName} → ${r.toName}`);
---
<div class:list={['act', { work: showWork }]}>
  {groups.map((g) => (
    <>
      {groupDays && <div class="day lead k">{g.day}</div>}
      {g.rows.map((r) => (
        <div class="ev" data-kind={r.kind}>
          <span class="k">{groupDays ? formatTime(r.timestamp) : formatDate(r.timestamp)}</span>
          <span>{r.label}</span>
          {showWork && (
            <a class="w" href={workPath(r.slug, r.tokenId)}>
              {r.thumb ? <img src={r.thumb} alt="" loading="lazy" /> : <i />}
              <span class="lower">{r.tokenName}{r.ids.length > 1 ? ` #${r.ids.at(-1)}–${r.ids[0]}` : ''}<small class="f">{r.accession}</small></span>
            </a>
          )}
          <span class="k lower who">{who(r)}</span>
          <span class="p">{r.priceWei ? formatEth(r.priceWei) : <span class="f">—</span>}</span>
        </div>
      ))}
    </>
  ))}
</div>
<style>
  .ev { display: grid; grid-template-columns: 96px 96px minmax(0, 1fr) 90px; gap: 12px; padding: 7px 0; border-top: 1px solid #121212; align-items: center; }
  .work .ev { grid-template-columns: 56px 90px minmax(0, 1.2fr) minmax(0, 1fr) 80px; }
  .p { text-align: right; text-transform: none; }
  .w { display: flex; gap: 10px; align-items: center; min-width: 0; }
  .w img, .w i { width: 30px; height: 30px; object-fit: cover; flex: none; background: #111; }
  .w small { display: block; font-size: 9px; }
  .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .day { margin: 16px 0 4px; }
  .ev[hidden] { display: none; }
  @media (max-width: 767px) {
    .ev, .work .ev { grid-template-columns: 52px minmax(0, 1fr) auto; }
    .ev > :nth-child(2) { grid-column: 2; }
    .work .ev .w { grid-column: 1 / -1; grid-row: 2; }
    .who { grid-column: 2 / 3; }
  }
</style>
```

- [ ] **Step 4: `src/components/WallLabel.astro`**

```astro
---
import type { CollectionOut, TokenOut } from '../lib/data';
import { displayName, formatDate, formatEth, formatUsd, shortAddress } from '../lib/format';
import { etherscanToken, openseaItem, platformLink } from '../lib/links';
interface Props { c: CollectionOut; t: TokenOut; ethUsd: number | null; asOf: string }
const { c, t, ethUsd, asOf } = Astro.props;
const year = (t.mint?.at ?? c.firstMint ?? '').slice(0, 4);
const platform = platformLink(c, t.id);
const edition = c.standard === 'erc1155' ? `edition of ${t.supply} · erc-1155` : '1/1 · erc-721';
const snapshot = t.listing?.priceWei ?? '';
---
<div class="label">
  <div class="f">{t.accession}</div>
  <h1 class="title lower">{t.name}</h1>
  <div class="k">gruff, {year}</div>
  <hr />
  <div class="k" id="price-label">{t.listing ? 'listed' : 'not listed'}</div>
  <div class="price" id="live-price" data-contract={c.contract} data-id={t.id} data-snapshot={snapshot} title={t.listing ? formatUsd(t.listing.priceWei, ethUsd) ?? undefined : undefined}>
    {t.listing ? formatEth(t.listing.priceWei) : <a class="offer" href={openseaItem(c.contract, t.id)} rel="noopener" target="_blank">make offer ↗</a>}
  </div>
  <div class="f lower" id="price-note">{t.listing ? `as of ${formatDate(asOf)}` : ''}</div>
  {t.mint && <div class="lr"><span class="l">{t.mint.primary ? 'primary' : 'mint'} {formatDate(t.mint.at)}</span><span class="v">{formatEth(t.mint.priceWei) ?? 'free'}</span></div>}
  <div class="lr"><span class="l">last sale</span><span class="v">{t.lastSale ? `${formatEth(t.lastSale.priceWei)} · ${formatDate(t.lastSale.at)}` : 'none'}</span></div>
  {c.standard === 'erc1155' && c.floorWei && <div class="lr"><span class="l">floor</span><span class="v">{formatEth(c.floorWei)}</span></div>}
  {c.standard === 'erc1155' ? (
    <>
      <div class="lr"><span class="l">keepers</span><span class="v">{t.holderCount}</span></div>
      {t.owners.slice(0, 5).map((o) => <div class="lr"><span class="l">holds {o.quantity}</span><span class="v">{displayName(o.address, o.ens)}</span></div>)}
    </>
  ) : (
    t.owners[0] && <div class="lr"><span class="l">owner</span><span class="v">{displayName(t.owners[0].address, t.owners[0].ens)}{t.owners[0].escrow ? ' (on foundation)' : ''}</span></div>
  )}
  <div class="lr"><span class="l">edition</span><span class="v">{edition}</span></div>
  <div class="lr"><span class="l">contract</span><button class="v copy" type="button" data-copy={c.contract}>{shortAddress(c.contract)} #{t.id}</button></div>
  {t.description && (<><hr /><p class="desc lower">{t.description}</p></>)}
  <p class="links">
    <a href={etherscanToken(c.contract, t.id)} rel="noopener" target="_blank">etherscan ↗</a>
    <a href={openseaItem(c.contract, t.id)} rel="noopener" target="_blank">opensea ↗</a>
    {platform && <a href={platform.url} rel="noopener" target="_blank">{platform.label} ↗</a>}
  </p>
  <button class="print" type="button" id="print-label">print label ↓</button>
</div>
<style>
  .title { font: 400 15px/1.3 var(--mono); margin: 6px 0 4px; }
  .desc { color: #aaa; line-height: 1.7; white-space: pre-line; }
  .links { display: flex; gap: 14px; flex-wrap: wrap; margin: 14px 0; }
  .links a { border-bottom: 1px solid #444; }
  .copy { background: none; border: 0; color: inherit; font: inherit; cursor: copy; padding: 0; min-height: 0; text-transform: none; }
  .print { background: none; border: 1px solid #444; color: #ddd; font: inherit; text-transform: uppercase; padding: 8px 12px; cursor: pointer; min-height: 44px; }
  .offer { font-size: 18px; border-bottom: 1px solid #444; }
</style>
```

- [ ] **Step 5: `src/pages/w/[slug]/[id].astro`**

```astro
---
import Base from '../../../layouts/Base.astro';
import MediaView from '../../../components/MediaView.astro';
import WallLabel from '../../../components/WallLabel.astro';
import ActivityTable from '../../../components/ActivityTable.astro';
import { collections, meta, tokensOf, type CollectionOut, type TokenOut } from '../../../lib/data';
import { toDisplayRows } from '../../../lib/activity';
import { collectionPath, etherscanToken, openseaItem, workPath } from '../../../lib/links';

export function getStaticPaths() {
  return collections().flatMap((c) => {
    const tokens = tokensOf(c.slug);
    return tokens.map((t, i) => ({ params: { slug: c.slug, id: t.id }, props: { c, t, prev: tokens[i - 1]?.id ?? null, next: tokens[i + 1]?.id ?? null, n: i + 1, total: tokens.length } }));
  });
}
const { c, t, prev, next, n, total } = Astro.props as { c: CollectionOut; t: TokenOut; prev: string | null; next: string | null; n: number; total: number };
const m = meta();
const recent = toDisplayRows(t.recent.map((e) => ({ ...e, slug: c.slug, code: c.code, tokenName: t.name, accession: t.accession, thumb: t.image?.thumb ?? null, fromEns: null, toEns: null })));
const ens = new Map(t.owners.filter((o) => o.ens).map((o) => [o.address, o.ens as string]));
for (const r of recent) {
  if (r.from && ens.has(r.from)) r.fromName = ens.get(r.from)!;
  if (r.to && ens.has(r.to)) r.toName = ens.get(r.to)!;
}
---
<Base title={`${t.name} — ${c.title} — gruff`} description={t.description ?? `${t.name}, ${c.title} by gruff.`} current={c.section === 'experiments' ? 'experiments' : 'index'}>
  <section class="page">
    <p class="k crumbs"><a href={collectionPath(c.slug)}>← {c.title}</a> · {String(n).padStart(2, '0')} / {total}</p>
    <div class="body">
      <div class="art"><MediaView token={t} size="large" alt={t.name} eager /></div>
      <aside><WallLabel c={c} t={t} ethUsd={m.ethUsd} asOf={m.lastInventory} /></aside>
    </div>
    <nav class="pn" aria-label="works">
      {prev ? <a rel="prev" href={workPath(c.slug, prev)}>← previous</a> : <span />}
      {next ? <a rel="next" href={workPath(c.slug, next)}>next →</a> : <span />}
    </nav>
    <h2 class="k act-h">activity</h2>
    {recent.length ? <ActivityTable rows={recent} /> : <p class="f">no activity recorded yet</p>}
    <p class="k full">full history: <a href={etherscanToken(c.contract, t.id)} rel="noopener" target="_blank">etherscan ↗</a> · <a href={openseaItem(c.contract, t.id)} rel="noopener" target="_blank">opensea ↗</a></p>
  </section>
</Base>
<style>
  .crumbs { margin: 26px 0 18px; }
  .body { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(280px, 1fr); gap: 40px; align-items: start; }
  aside { position: sticky; top: 24px; }
  .pn { display: flex; justify-content: space-between; color: var(--dim); margin: 24px 0; font-size: 11px; }
  .act-h { font: 400 11px var(--mono); letter-spacing: .04em; margin: 36px 0 8px; }
  .full { margin-top: 12px; }
  @media (max-width: 1023px) { .body { grid-template-columns: 1fr; } aside { position: static; } }
</style>
<script src="../../../scripts/work.ts"></script>
```

- [ ] **Step 6: `src/scripts/work.ts`** (keyboard nav + copy; Tasks 7 and 8 import more from this file)

```ts
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  const rel = e.key === 'ArrowLeft' ? 'prev' : e.key === 'ArrowRight' ? 'next' : null;
  const link = rel ? document.querySelector<HTMLAnchorElement>(`a[rel=${rel}]`) : null;
  if (link) window.location.href = link.href;
});

for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-copy]'))
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy ?? '');
      const before = b.textContent;
      b.textContent = 'copied';
      setTimeout(() => (b.textContent = before), 1200);
    } catch {
      // clipboard blocked — nothing to do
    }
  });
```

- [ ] **Step 7: `scripts/check-dist.mjs`**

```js
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_FILES = 19_000;
const MAX_BYTES = 25 * 1024 * 1024;
let files = 0;
const tooBig = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else {
      files++;
      if (s.size > MAX_BYTES) tooBig.push(`${p} (${(s.size / 1048576).toFixed(1)} MiB)`);
    }
  }
};
walk('dist');
console.log(`[check-dist] ${files} files`);
if (files > MAX_FILES) {
  console.error(`[check-dist] ✗ more than ${MAX_FILES} files`);
  process.exit(1);
}
if (tooBig.length) {
  console.error(`[check-dist] ✗ files over 25 MiB:\n${tooBig.join('\n')}`);
  process.exit(1);
}
```

`npm pkg set scripts.build="astro build && node scripts/check-dist.mjs"`

- [ ] **Step 8: e2e** (append)

```ts
test('work page shows the wall label and navigates with arrows', async ({ page }) => {
  await checkPage(page, '/w/silver-surfer/1/');
  await expect(page.locator('.label .price')).toBeVisible();
  await expect(page.getByRole('link', { name: 'etherscan ↗' }).first()).toHaveAttribute('href', /etherscan\.io\/nft\//);
  await expect(page.locator('h2.act-h')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/w\/silver-surfer\/2\/$/);
});

test('large collection work pages exist', async ({ page }) => {
  await checkPage(page, '/w/facets/1/');
});
```

Run `npm run build` (expect `[check-dist] N files` with N < 19000), `npm run e2e`, `npm test`, `npm run typecheck` → pass.

- [ ] **Step 9: Commit**

```bash
git add src scripts tests package.json
git commit -m "feat(site): work pages with wall label, activity and keyboard nav; dist checks

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 7: Live listed price (Pages Function + client)

**Files:**
- Create: `functions/lib/listing.ts`, `functions/api/listing.ts`, `tests/site/listing-fn.test.ts`
- Modify: `src/scripts/work.ts` (append live fetch), `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `normalizeListing`, `OsRawListing` from `indexer/opensea.ts`; elements `#live-price[data-contract][data-id][data-snapshot]`, `#price-label`, `#price-note`.
- Produces: `GET /api/listing?contract=0x…&id=N` → `200 { listing: { tokenId, priceWei, maker, at } | null }` (cache 60 s), `400 { error }`, `503 { error: 'unavailable' }` without key, `502 { error: 'upstream' }`; `parseQuery(url): { contract; id } | null`.

- [ ] **Step 1: Failing tests** — `tests/site/listing-fn.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../functions/api/listing';
import { parseQuery } from '../../functions/lib/listing';

const C = '0x3be88adf4d68c32bad5707588c7d25e1af8644e0';
const req = (qs: string) => new Request(`https://gruff.test/api/listing?${qs}`);
afterEach(() => vi.unstubAllGlobals());

describe('parseQuery', () => {
  it('accepts a contract and numeric id', () => {
    expect(parseQuery(new URL(`https://x/api?contract=${C.toUpperCase().replace('0X', '0x')}&id=12`))).toEqual({ contract: C, id: '12' });
  });
  it('rejects bad input', () => {
    expect(parseQuery(new URL('https://x/api?contract=0x12&id=1'))).toBeNull();
    expect(parseQuery(new URL(`https://x/api?contract=${C}&id=1a`))).toBeNull();
  });
});

describe('GET /api/listing', () => {
  it('returns 400 for bad input and 503 without a key', async () => {
    expect((await onRequestGet({ request: req('contract=0x1&id=1'), env: {} })).status).toBe(400);
    expect((await onRequestGet({ request: req(`contract=${C}&id=1`), env: {} })).status).toBe(503);
  });

  it('returns the normalized best listing', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.includes('/chain/ethereum/contract/')) return new Response(JSON.stringify({ collection: 'silver-surfer' }));
      return new Response(JSON.stringify({ order_hash: '0x1', price: { current: { currency: 'ETH', decimals: 18, value: '450000000000000000' } }, protocol_data: { parameters: { offerer: '0xMAKER', startTime: '1730800000', offer: [{ token: C, identifierOrCriteria: '1', startAmount: '1' }] } } }));
    });
    const res = await onRequestGet({ request: req(`contract=${C}&id=1`), env: { OPENSEA_API_KEY: 'k' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await res.json()).toEqual({ listing: { tokenId: '1', priceWei: '450000000000000000', maker: '0xmaker', at: '2024-11-05T09:46:40.000Z' } });
    expect(calls[1]).toContain('/listings/collection/silver-surfer/nfts/1/best');
  });

  it('returns null when nothing is listed and 502 on upstream errors', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url.includes('/contract/') ? new Response(JSON.stringify({ collection: 's' })) : new Response('{}', { status: 404 })));
    expect(await (await onRequestGet({ request: req(`contract=${C}&id=1`), env: { OPENSEA_API_KEY: 'k' } })).json()).toEqual({ listing: null });
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
    expect((await onRequestGet({ request: req(`contract=${C}&id=1`), env: { OPENSEA_API_KEY: 'k' } })).status).toBe(502);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `functions/lib/listing.ts`**

```ts
export function parseQuery(url: URL): { contract: string; id: string } | null {
  const contract = (url.searchParams.get('contract') ?? '').toLowerCase();
  const id = url.searchParams.get('id') ?? '';
  if (!/^0x[0-9a-f]{40}$/.test(contract) || !/^\d{1,78}$/.test(id)) return null;
  return { contract, id };
}
```

- [ ] **Step 3: `functions/api/listing.ts`**

```ts
import { normalizeListing, type OsRawListing } from '../../indexer/opensea';
import { parseQuery } from '../lib/listing';

interface Env { OPENSEA_API_KEY?: string }
const OS = 'https://api.opensea.io/api/v2';

const json = (body: unknown, status = 200, maxAge = 60) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store' } });

export async function onRequestGet({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const q = parseQuery(new URL(request.url));
  if (!q) return json({ error: 'bad request' }, 400, 0);
  if (!env.OPENSEA_API_KEY) return json({ error: 'unavailable' }, 503, 0);
  const headers = { 'x-api-key': env.OPENSEA_API_KEY, accept: 'application/json' };
  try {
    const c = await fetch(`${OS}/chain/ethereum/contract/${q.contract}`, { headers });
    if (!c.ok) return json({ error: 'upstream' }, 502, 0);
    const { collection } = (await c.json()) as { collection?: string | null };
    if (!collection) return json({ listing: null });
    const r = await fetch(`${OS}/listings/collection/${collection}/nfts/${q.id}/best`, { headers });
    if (r.status === 404) return json({ listing: null });
    if (!r.ok) return json({ error: 'upstream' }, 502, 0);
    return json({ listing: normalizeListing((await r.json()) as OsRawListing, q.contract) });
  } catch {
    return json({ error: 'upstream' }, 502, 0);
  }
}
```

Run tests → PASS.

- [ ] **Step 4: Client** — append to `src/scripts/work.ts`

```ts
import { formatEth } from '../lib/format';

const priceEl = document.getElementById('live-price');
if (priceEl?.dataset.contract) {
  const params = new URLSearchParams({ contract: priceEl.dataset.contract, id: priceEl.dataset.id ?? '' });
  fetch(`/api/listing?${params}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ listing: { priceWei: string } | null }>) : Promise.reject(new Error(String(r.status)))))
    .then(({ listing }) => {
      const label = document.getElementById('price-label');
      const note = document.getElementById('price-note');
      if (listing) {
        priceEl.textContent = formatEth(listing.priceWei);
        if (label) label.textContent = 'listed';
        if (note) note.textContent = 'live';
      } else if (priceEl.dataset.snapshot) {
        priceEl.textContent = 'not listed';
        if (label) label.textContent = '';
        if (note) note.textContent = 'live';
      }
    })
    .catch(() => {
      // keep the snapshot price and its "as of" note
    });
}
```

Move the import to the top of the file.

- [ ] **Step 5: e2e** — the preview server has no functions, so the page must keep the snapshot quietly (append):

```ts
test('work page keeps the snapshot price when the live price is unavailable', async ({ page }) => {
  await page.goto('/w/silver-surfer/1/');
  await expect(page.locator('#live-price')).not.toBeEmpty();
});
```

Run `npm run e2e`, `npm test`, `npm run typecheck` → pass.

- [ ] **Step 6: Commit**

```bash
git add functions src tests
git commit -m "feat(site): live listed price via Pages Function with snapshot fallback

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 8: Print label

**Files:**
- Create: `src/lib/label.ts`, `src/scripts/print-label.ts`, `tests/site/label.test.ts`
- Modify: `src/scripts/work.ts` (import print-label), `src/pages/w/[slug]/[id].astro` (data attributes for the label), `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `TokenOut`, `CollectionOut`, `format.ts`; button `#print-label`; a `<script type="application/json" id="label-data">` added to the work page holding `{ lines: LabelLine[]; image: string | null; filename: string }`.
- Produces: `label.ts`: `interface LabelLine { text: string; style: 'accession' | 'title' | 'meta' | 'price' | 'row' }`; `labelLines(t, c): LabelLine[]`; `labelImage(t): string | null` (local image only: animated → thumb; static → large; svg → large; none → null); `labelFilename(t): string` (`gruff-GRF.23.SLV.001.png`).

- [ ] **Step 1: Failing test** — `tests/site/label.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { CollectionOut, TokenOut } from '../../src/lib/data';
import { labelFilename, labelImage, labelLines } from '../../src/lib/label';

const c = { title: 'SILVER SURFER', standard: 'erc721', firstMint: '2023-03-27T10:00:00.000Z' } as CollectionOut;
const t = {
  id: '1', accession: 'GRF.23.SLV.001', name: "'Cosmic Power'", supply: 1,
  image: { kind: 'image', thumb: '/media/a-t.webp', large: '/media/a-l.webp', file: null },
  mint: { at: '2023-03-27T10:00:00.000Z', txHash: '0x', priceWei: '100000000000000000', primary: false },
  lastSale: { at: '2025-01-01T00:00:00.000Z', priceWei: '320000000000000000' },
  owners: [{ address: '0x00000000000000000000000000000000000000b2', ens: 'keeper.eth', quantity: 1 }],
} as unknown as TokenOut;

describe('print label', () => {
  it('lists the museum label lines', () => {
    expect(labelLines(t, c).map((l) => l.text)).toEqual([
      'GRF.23.SLV.001',
      "'Cosmic Power'",
      'gruff, 2023 · SILVER SURFER',
      '1/1 · erc-721',
      'keeper  keeper.eth',
      'mint  27.03.2023 · 0.1 Ξ',
      'last sale  01.01.2025 · 0.32 Ξ',
    ]);
  });
  it('uses a local image and a stable filename', () => {
    expect(labelImage(t)).toBe('/media/a-l.webp');
    expect(labelImage({ ...t, image: { kind: 'image', thumb: '/media/b-t.webp', large: '/media/b.gif', file: '/media/b.gif', animated: true } } as TokenOut)).toBe('/media/b-t.webp');
    expect(labelFilename(t)).toBe('gruff-GRF.23.SLV.001.png');
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/lib/label.ts`**

```ts
import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';
import { displayName, formatDate, formatEth } from './format';

export interface LabelLine { text: string; style: 'accession' | 'title' | 'meta' | 'price' | 'row' }

export function labelLines(t: TokenOut, c: CollectionOut): LabelLine[] {
  const year = (t.mint?.at ?? c.firstMint ?? '').slice(0, 4);
  const lines: LabelLine[] = [
    { text: t.accession, style: 'accession' },
    { text: t.name, style: 'title' },
    { text: `gruff, ${year} · ${c.title}`, style: 'meta' },
    { text: c.standard === 'erc1155' ? `edition of ${t.supply} · erc-1155` : '1/1 · erc-721', style: 'meta' },
  ];
  const owner = t.owners[0];
  if (owner) lines.push({ text: `keeper  ${displayName(owner.address, owner.ens)}`, style: 'row' });
  if (t.mint) lines.push({ text: `${t.mint.primary ? 'primary' : 'mint'}  ${formatDate(t.mint.at)} · ${formatEth(t.mint.priceWei) ?? 'free'}`, style: 'row' });
  if (t.lastSale) lines.push({ text: `last sale  ${formatDate(t.lastSale.at)} · ${formatEth(t.lastSale.priceWei)}`, style: 'row' });
  return lines;
}

export function labelImage(t: TokenOut): string | null {
  const img = t.image;
  if (!img) return null;
  if (img.animated) return img.thumb;
  if (img.kind === 'image' || img.kind === 'svg') return img.large ?? img.thumb;
  return img.thumb;
}

export const labelFilename = (t: TokenOut) => `gruff-${t.accession}.png`;
```

Run → PASS.

- [ ] **Step 3: Label data on the work page** — in `src/pages/w/[slug]/[id].astro` frontmatter add:

```ts
import { labelFilename, labelImage, labelLines } from '../../../lib/label';
const labelData = JSON.stringify({ lines: labelLines(t, c), image: labelImage(t), filename: labelFilename(t) });
```

and inside the `<section>`, before `</section>`:

```astro
<script type="application/json" id="label-data" set:html={labelData}></script>
```

- [ ] **Step 4: `src/scripts/print-label.ts`**

```ts
import type { LabelLine } from '../lib/label';

const W = 1080;
const H = 1350;
const PAD = 72;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export async function renderLabel(data: { lines: LabelLine[]; image: string | null }): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const boxH = 820;
  if (data.image) {
    const img = await loadImage(data.image);
    const s = Math.min((W - PAD * 2) / img.width, boxH / img.height);
    const w = img.width * s;
    const h = img.height * s;
    ctx.imageSmoothingEnabled = !data.image.endsWith('.svg');
    ctx.drawImage(img, (W - w) / 2, PAD + (boxH - h) / 2, w, h);
  }
  let y = PAD + boxH + 64;
  for (const l of data.lines) {
    const size = l.style === 'title' ? 30 : 22;
    ctx.font = `${l.style === 'title' ? 400 : 300} ${size}px 'DM Mono'`;
    ctx.fillStyle = l.style === 'accession' || l.style === 'meta' ? '#777' : '#fff';
    const text = l.style === 'title' ? l.text : l.text.toUpperCase();
    ctx.fillText(text, PAD, y);
    y += size + 14;
  }
  ctx.font = "56px 'Castoro'";
  ctx.fillStyle = '#fff';
  ctx.filter = 'url(#ink)';
  ctx.textAlign = 'right';
  ctx.fillText('gruff', W - PAD, H - PAD);
  ctx.filter = 'none';
  return canvas;
}

const button = document.getElementById('print-label');
const raw = document.getElementById('label-data')?.textContent;
if (button && raw) {
  const data = JSON.parse(raw) as { lines: LabelLine[]; image: string | null; filename: string };
  button.addEventListener('click', async () => {
    const canvas = await renderLabel(data);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = data.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });
}
```

Add `import './print-label';` at the top of `src/scripts/work.ts`.

- [ ] **Step 5: e2e** (append)

```ts
test('print label downloads a 1080×1350 png', async ({ page }) => {
  await page.goto('/w/silver-surfer/1/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'print label ↓' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gruff-GRF\.\d{2}\.SLV\.\d{3}\.png$/);
  const path = await download.path();
  const { default: sharp } = await import('sharp');
  const meta = await sharp(path!).metadata();
  expect([meta.width, meta.height]).toEqual([1080, 1350]);
});
```

Run `npm run e2e`, `npm test`, `npm run typecheck` → pass.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(site): print label as a 1080x1350 png

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 9: Activity ledger (/activity and monthly archives)

**Files:**
- Create: `src/pages/activity/index.astro`, `src/pages/activity/[month].astro`, `src/scripts/activity.ts`
- Modify: `src/lib/activity.ts` (add `collapseMints`, `summary`, `KIND_FILTERS`), `tests/site/activity.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `latestActivity()`, `activityMonths()`, `activityMonth()`, `keepers()`, `meta()`, `ActivityTable`.
- Produces: `collapseMints(rows: ActivityRow[]): DisplayRow[]` (merges consecutive mint rows with the same txHash, slug and recipient; `ids` newest-first; label `mint ×<sum of quantities>`); `summary(rows: ActivityRow[], keepers: KeeperOut[], now: Date, days = 30): { sales: number; volumeWei: string; newKeepers: number }`; `KIND_FILTERS: readonly ['all','sale','mint','transfer','listed']`.

- [ ] **Step 1: Failing tests** — append to `tests/site/activity.test.ts` (merge the two import lines into the existing imports at the top of the file)

```ts
import { collapseMints, summary } from '../../src/lib/activity';
import type { KeeperOut } from '../../src/lib/data';

describe('collapseMints', () => {
  it('merges mints of one tx to one recipient', () => {
    const rows = [
      row({ id: 'a', kind: 'mint', tokenId: '2203', txHash: '0xm', slug: 'facets', from: null, to: '0x00000000000000000000000000000000000000c3', priceWei: null }),
      row({ id: 'b', kind: 'mint', tokenId: '2202', txHash: '0xm', slug: 'facets', from: null, to: '0x00000000000000000000000000000000000000c3', priceWei: null }),
      row({ id: 'c', kind: 'mint', tokenId: '2201', txHash: '0xm', slug: 'facets', from: null, to: '0x00000000000000000000000000000000000000c3', priceWei: null }),
      row({ id: 'd', kind: 'sale' }),
    ];
    const out = collapseMints(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ label: 'mint ×3', ids: ['2203', '2202', '2201'] });
  });
});

describe('summary', () => {
  it('counts recent sales, volume and new keepers', () => {
    const now = new Date('2026-11-05T00:00:00.000Z');
    const rows = [row({ priceWei: '100', timestamp: '2026-11-01T00:00:00.000Z' }), row({ id: 'x', priceWei: '50', timestamp: '2026-09-01T00:00:00.000Z' }), row({ id: 'y', kind: 'mint', priceWei: null })];
    const k = [{ firstAcquired: '2026-10-20T00:00:00.000Z' }, { firstAcquired: '2024-01-01T00:00:00.000Z' }] as KeeperOut[];
    expect(summary(rows, k, now)).toEqual({ sales: 1, volumeWei: '100', newKeepers: 1 });
  });
});
```

Run → FAIL.

- [ ] **Step 2: Extend `src/lib/activity.ts`** (append)

```ts
import type { KeeperOut } from '../../indexer/aggregate/keepers';

export const KIND_FILTERS = ['all', 'sale', 'mint', 'transfer', 'listed'] as const;

export function collapseMints(rows: ActivityRow[]): DisplayRow[] {
  const out: DisplayRow[] = [];
  let qty = 0;
  for (const d of toDisplayRows(rows)) {
    const src = rows.find((r) => r.id === d.key)!;
    const prev = out.at(-1);
    const prevSrc = prev ? rows.find((r) => r.id === prev.key) : undefined;
    if (prev && prevSrc && d.kind === 'mint' && prev.kind === 'mint' && src.txHash && src.txHash === prevSrc.txHash && d.slug === prev.slug && d.to === prev.to) {
      prev.ids.push(d.tokenId);
      qty += src.quantity;
      prev.label = eventLabel('mint', qty);
      continue;
    }
    qty = src.quantity;
    out.push(d);
  }
  return out;
}

export function summary(rows: ActivityRow[], keepers: KeeperOut[], now: Date, days = 30) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const sales = rows.filter((r) => r.kind === 'sale' && r.timestamp >= since);
  return {
    sales: sales.length,
    volumeWei: sales.reduce((s, r) => s + BigInt(r.priceWei ?? '0'), 0n).toString(),
    newKeepers: keepers.filter((k) => k.firstAcquired && k.firstAcquired >= since).length,
  };
}
```

(`collapseMints` keeps the first (newest) row's key/timestamp; `ids` accumulate newest-first.) Run → PASS.

- [ ] **Step 3: `src/scripts/activity.ts`**

```ts
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip[data-kind]'));
const rows = Array.from(document.querySelectorAll<HTMLElement>('.act .ev'));
for (const chip of chips)
  chip.addEventListener('click', () => {
    const k = chip.dataset.kind ?? 'all';
    for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
    for (const r of rows) r.hidden = k !== 'all' && r.dataset.kind !== k;
  });
```

- [ ] **Step 4: `src/pages/activity/index.astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import ActivityTable from '../../components/ActivityTable.astro';
import { activityMonths, keepers, latestActivity, meta } from '../../lib/data';
import { collapseMints, KIND_FILTERS, summary } from '../../lib/activity';
import { formatEth, timeAgo } from '../../lib/format';
import { monthLabel } from '../../lib/timeline';
const m = meta();
const now = new Date(m.lastInventory);
const latest = latestActivity();
const s = summary(latest, keepers(), now);
---
<Base title="activity — gruff" current="activity">
  <section class="page">
    <div class="sum">
      <div class="k">last 30 days<span>{s.sales} sales</span></div>
      <div class="k">volume<span>{formatEth(s.volumeWei)}</span></div>
      <div class="k">new keepers<span>{s.newKeepers}</span></div>
      <div class="k">last inventory<span>{timeAgo(m.lastInventory, now)}</span></div>
    </div>
    <div class="chips" role="group" aria-label="filter">{KIND_FILTERS.map((k) => <button class="chip" type="button" data-kind={k} aria-pressed={k === 'all' ? 'true' : 'false'}>{k === 'all' ? 'all' : `${k}s`}</button>)}</div>
    <ActivityTable rows={collapseMints(latest)} showWork groupDays />
    <p class="k months">earlier → {activityMonths().map((mo, i) => <>{i > 0 && ' · '}<a href={`/activity/${mo}/`}>{monthLabel(mo)}</a></>)}</p>
  </section>
</Base>
<style>
  .sum { display: flex; gap: 28px; flex-wrap: wrap; margin: 26px 0 16px; }
  .sum span { display: block; font-size: 22px; color: var(--fg); margin-top: 2px; text-transform: none; }
  .months { margin-top: 20px; line-height: 2; }
</style>
<script src="../../scripts/activity.ts"></script>
```

- [ ] **Step 5: `src/pages/activity/[month].astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import ActivityTable from '../../components/ActivityTable.astro';
import { activityMonth, activityMonths } from '../../lib/data';
import { collapseMints, KIND_FILTERS } from '../../lib/activity';
import { monthLabel } from '../../lib/timeline';
export function getStaticPaths() {
  return activityMonths().map((month) => ({ params: { month } }));
}
const { month } = Astro.params as { month: string };
const rows = collapseMints(activityMonth(month));
const all = activityMonths();
const i = all.indexOf(month);
---
<Base title={`activity ${monthLabel(month)} — gruff`} current="activity">
  <section class="page">
    <p class="k crumbs"><a href="/activity/">← activity</a> · {monthLabel(month)} · {rows.length} entries</p>
    <div class="chips" role="group" aria-label="filter">{KIND_FILTERS.map((k) => <button class="chip" type="button" data-kind={k} aria-pressed={k === 'all' ? 'true' : 'false'}>{k === 'all' ? 'all' : `${k}s`}</button>)}</div>
    <ActivityTable rows={rows} showWork groupDays />
    <nav class="pn k">
      {all[i + 1] ? <a href={`/activity/${all[i + 1]}/`}>← {monthLabel(all[i + 1])}</a> : <span />}
      {all[i - 1] ? <a href={`/activity/${all[i - 1]}/`}>{monthLabel(all[i - 1])} →</a> : <span />}
    </nav>
  </section>
</Base>
<style>
  .crumbs { margin: 26px 0 12px; }
  .pn { display: flex; justify-content: space-between; margin-top: 20px; }
</style>
<script src="../../scripts/activity.ts"></script>
```

- [ ] **Step 6: e2e** (append)

```ts
test('activity ledger lists events and filters them', async ({ page }) => {
  await checkPage(page, '/activity/');
  expect(await page.locator('.act .ev').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'mints' }).click();
  for (const kind of await page.locator('.act .ev:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))) expect(kind).toBe('mint');
  const firstMonth = page.locator('.months a').first();
  await firstMonth.click();
  await expect(page.locator('.crumbs')).toContainText('entries');
});
```

Run `npm run e2e`, `npm test`, `npm run typecheck` → pass.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(site): activity ledger with monthly archives

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 10: Keepers

**Files:**
- Create: `src/lib/keepers.ts`, `src/pages/keepers.astro`, `src/scripts/keepers.ts`, `tests/site/keepers.test.ts`
- Modify: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `keepers()`, `collections()`, `tokenIndex()`, `format.ts`, `links.ts`.
- Produces: `keepers.ts`: `type KeeperSort = 'pieces'|'works'|'collections'|'since'`; `sortKeepers(k, by): KeeperOut[]` (new array); `maskCells(mask): boolean[]`; `matchesQuery(k, q): boolean`; `KEEPERS_SHOWN = 300`. Row markup: `li.keeper[data-name][data-pieces][data-works][data-collections][data-since]` inside `ol#keepers`.

- [ ] **Step 1: Failing test** — `tests/site/keepers.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { KeeperOut } from '../../src/lib/data';
import { maskCells, matchesQuery, sortKeepers } from '../../src/lib/keepers';

const k = (p: Partial<KeeperOut>) => ({ address: '0x00000000000000000000000000000000000000a1', ens: null, pieces: 1, works: 1, collections: [], mask: '00', firstAcquired: '2024-01-01T00:00:00.000Z', lastAcquired: null, fromArtist: { pieces: 0, paidWei: '0' }, firstFromArtist: null, longestHeld: null, holdings: [], ...p }) as KeeperOut;

describe('keepers', () => {
  const list = [
    k({ address: '0xa', pieces: 10, works: 1, mask: '10', firstAcquired: '2025-01-01T00:00:00.000Z' }),
    k({ address: '0xb', pieces: 3, works: 3, mask: '11', firstAcquired: '2023-01-01T00:00:00.000Z' }),
    k({ address: '0xc', pieces: 3, works: 2, mask: '01', firstAcquired: null }),
  ];
  it('sorts by pieces, works, collections and since', () => {
    expect(sortKeepers(list, 'pieces').map((x) => x.address)).toEqual(['0xa', '0xb', '0xc']);
    expect(sortKeepers(list, 'works').map((x) => x.address)).toEqual(['0xb', '0xc', '0xa']);
    expect(sortKeepers(list, 'collections').map((x) => x.address)).toEqual(['0xb', '0xa', '0xc']);
    expect(sortKeepers(list, 'since').map((x) => x.address)).toEqual(['0xb', '0xa', '0xc']);
  });
  it('maps the mask and matches queries', () => {
    expect(maskCells('101')).toEqual([true, false, true]);
    expect(matchesQuery(k({ ens: 'keeper.eth' }), 'KEEP')).toBe(true);
    expect(matchesQuery(k({}), '0x000000')).toBe(true);
    expect(matchesQuery(k({}), 'nope')).toBe(false);
    expect(matchesQuery(k({}), '  ')).toBe(true);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/lib/keepers.ts`**

```ts
import type { KeeperOut } from '../../indexer/aggregate/keepers';

export type KeeperSort = 'pieces' | 'works' | 'collections' | 'since';
export const KEEPERS_SHOWN = 300;
const filled = (mask: string) => [...mask].filter((c) => c === '1').length;

export function sortKeepers(list: KeeperOut[], by: KeeperSort): KeeperOut[] {
  const out = [...list];
  const cmp: Record<KeeperSort, (a: KeeperOut, b: KeeperOut) => number> = {
    pieces: (a, b) => b.pieces - a.pieces || b.works - a.works,
    works: (a, b) => b.works - a.works || b.pieces - a.pieces,
    collections: (a, b) => filled(b.mask) - filled(a.mask) || b.pieces - a.pieces,
    since: (a, b) => (a.firstAcquired ?? '9999').localeCompare(b.firstAcquired ?? '9999'),
  };
  return out.sort(cmp[by]);
}

export const maskCells = (mask: string) => [...mask].map((c) => c === '1');

export function matchesQuery(k: KeeperOut, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return k.address.includes(s) || (k.ens ?? '').toLowerCase().includes(s);
}
```

Run → PASS.

- [ ] **Step 3: `src/pages/keepers.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import { collections, keepers, meta, tokenIndex } from '../lib/data';
import { indexCollections } from '../lib/collections';
import { KEEPERS_SHOWN, maskCells } from '../lib/keepers';
import { displayName, formatDate, formatEth, formatMonth, heldFor } from '../lib/format';
import { workPath } from '../lib/links';
const list = keepers();
const order = [...indexCollections(collections())].reverse().map((c) => c.code);
const idx = tokenIndex();
const now = new Date(meta().lastInventory);
const work = (slug: string, id: string) => idx.get(`${slug}/${id}`);
---
<Base title="keepers — gruff" current="keepers">
  <section class="page">
    <p class="lower intro">{list.length.toLocaleString('en-US')} keepers hold the archive.</p>
    <div class="chips" role="group" aria-label="sort">sort:
      {(['pieces', 'works', 'collections', 'since'] as const).map((s) => <button class="chip" type="button" data-sort={s} aria-pressed={s === 'pieces' ? 'true' : 'false'}>{s}</button>)}
    </div>
    <label class="find k">find a keeper <input id="find" type="search" placeholder="ens or address" autocomplete="off" /></label>
    <div class="row head f" aria-hidden="true"><span>#</span><span>keeper</span><span class="n">pieces</span><span class="n">works</span><span class="strip-h">collections ({order[0]} → {order.at(-1)})</span><span>since</span></div>
    <ol id="keepers">
      {list.map((k, i) => (
        <li class="keeper" data-name={`${k.ens ?? ''} ${k.address}`} data-pieces={k.pieces} data-works={k.works} data-collections={maskCells(k.mask).filter(Boolean).length} data-since={k.firstAcquired ?? '9999'} hidden={i >= KEEPERS_SHOWN}>
          <details>
            <summary class="row">
              <span class="k rank">{String(i + 1).padStart(2, '0')}</span>
              <span class="lower name">{displayName(k.address, k.ens)}</span>
              <span class="n">{k.pieces}</span>
              <span class="n">{k.works}</span>
              <span class="strip" aria-label={`${k.collections.length} collections`}>{maskCells(k.mask).map((on, j) => <i class:list={{ on }} title={order[j]} />)}</span>
              <span class="k">{k.firstAcquired ? formatMonth(k.firstAcquired) : '—'}</span>
            </summary>
            <div class="det">
              <div>
                {k.firstFromArtist && <div class="lr"><span class="l">first from gruff</span><span class="v">{formatDate(k.firstFromArtist.at)} · {work(k.firstFromArtist.slug, k.firstFromArtist.tokenId)?.name ?? `#${k.firstFromArtist.tokenId}`}{k.firstFromArtist.priceWei ? ` · ${formatEth(k.firstFromArtist.priceWei)}` : ''}</span></div>}
                {k.lastAcquired && <div class="lr"><span class="l">latest</span><span class="v">{formatDate(k.lastAcquired)}</span></div>}
                <div class="lr"><span class="l">from gruff directly</span><span class="v">{k.fromArtist.pieces} pieces · {formatEth(k.fromArtist.paidWei)}</span></div>
                {k.longestHeld && <div class="lr"><span class="l">longest held</span><span class="v">{work(k.longestHeld.slug, k.longestHeld.tokenId)?.name ?? `#${k.longestHeld.tokenId}`} · {heldFor(k.longestHeld.since, now)}</span></div>}
              </div>
              <div class="holds">
                {k.holdings.slice(0, 40).map((h) => {
                  const w = work(h.slug, h.tokenId);
                  return <a href={workPath(h.slug, h.tokenId)} title={w?.name}>{w?.thumb ? <img src={w.thumb} alt={w.name} loading="lazy" /> : <i>{w?.accession}</i>}</a>;
                })}
                {k.holdings.length > 40 && <span class="k">+{k.holdings.length - 40}</span>}
              </div>
            </div>
          </details>
        </li>
      ))}
    </ol>
    {list.length > KEEPERS_SHOWN && <button class="chip more" type="button" id="show-all">show all {list.length}</button>}
  </section>
</Base>
<style>
  .intro { margin: 26px 0 12px; color: var(--dim); }
  .find { display: flex; gap: 10px; align-items: center; margin: 10px 0 18px; }
  .find input { background: none; border: 0; border-bottom: 1px solid var(--dot); color: var(--fg); font: inherit; text-transform: none; padding: 8px 0; width: min(320px, 60vw); }
  ol { list-style: none; margin: 0; padding: 0; }
  .row { display: grid; grid-template-columns: 34px minmax(0, 1.2fr) 64px 56px 170px 80px; gap: 12px; align-items: center; padding: 9px 0; border-top: 1px solid #121212; cursor: pointer; list-style: none; }
  .row::-webkit-details-marker { display: none; }
  .row.head { cursor: default; border: 0; font-size: 10px; }
  .n { text-align: right; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .strip { display: flex; gap: 2px; }
  .strip i { width: 8px; height: 12px; background: #222; display: block; }
  .strip i.on { background: var(--fg); }
  details[open] { background: #0b0b0b; }
  .det { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; padding: 6px 12px 18px; }
  .holds { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .holds img, .holds i { width: 42px; height: 42px; object-fit: cover; display: block; background: #111; font-size: 7px; font-style: normal; overflow: hidden; }
  .more { margin-top: 18px; }
  @media (max-width: 767px) {
    .row { grid-template-columns: 28px minmax(0, 1fr) 44px; }
    .row > :nth-child(4), .row > :nth-child(6), .row.head > .strip-h { display: none; }
    .strip { grid-column: 2 / -1; }
    .det { grid-template-columns: 1fr; }
  }
</style>
<script src="../scripts/keepers.ts"></script>
```

- [ ] **Step 4: `src/scripts/keepers.ts`**

```ts
const list = document.getElementById('keepers');
const items = Array.from(list?.querySelectorAll<HTMLLIElement>('li.keeper') ?? []);
const SHOWN = 300;
let showAll = false;
let query = '';

const render = () => {
  let visible = 0;
  for (const li of items) {
    const match = !query || (li.dataset.name ?? '').toLowerCase().includes(query);
    const show = match && (showAll || query !== '' || visible < SHOWN);
    li.hidden = !show;
    if (show) visible++;
  }
};

const num = (li: HTMLLIElement, key: string) => Number(li.dataset[key] ?? 0);
const sorters: Record<string, (a: HTMLLIElement, b: HTMLLIElement) => number> = {
  pieces: (a, b) => num(b, 'pieces') - num(a, 'pieces') || num(b, 'works') - num(a, 'works'),
  works: (a, b) => num(b, 'works') - num(a, 'works') || num(b, 'pieces') - num(a, 'pieces'),
  collections: (a, b) => num(b, 'collections') - num(a, 'collections') || num(b, 'pieces') - num(a, 'pieces'),
  since: (a, b) => (a.dataset.since ?? '').localeCompare(b.dataset.since ?? ''),
};
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip[data-sort]'));
for (const chip of chips)
  chip.addEventListener('click', () => {
    for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
    items.sort(sorters[chip.dataset.sort ?? 'pieces']);
    items.forEach((li, i) => {
      const rank = li.querySelector('.rank');
      if (rank) rank.textContent = String(i + 1).padStart(2, '0');
      list?.append(li);
    });
    render();
  });

document.getElementById('find')?.addEventListener('input', (e) => {
  query = (e.target as HTMLInputElement).value.trim().toLowerCase();
  render();
});
document.getElementById('show-all')?.addEventListener('click', (e) => {
  showAll = true;
  (e.target as HTMLElement).remove();
  render();
});
```

- [ ] **Step 5: e2e** (append)

```ts
test('keepers rank, expand and search', async ({ page }) => {
  await checkPage(page, '/keepers/');
  const first = page.locator('li.keeper').first();
  await first.locator('summary').click();
  await expect(first.locator('.det')).toBeVisible();
  const name = (await first.locator('.name').textContent())!.trim();
  await page.getByPlaceholder('ens or address').fill(name.slice(0, 6));
  expect(await page.locator('li.keeper:visible').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'since' }).click();
  await expect(page.locator('li.keeper:visible .rank').first()).toHaveText('01');
});
```

Run `npm run e2e`, `npm test`, `npm run typecheck` → pass.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(site): keepers ranking with strips, details, sort and search

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 11: Techniques

**Files:**
- Create: `src/lib/techniques.ts`, `src/pages/techniques.astro`, `tests/site/techniques.test.ts`
- Modify: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `collections()`, `tokensOf()`, `timeline()`.
- Produces: `techniqueYears(cols, tokensBySlug): { years: string[]; rows: { technique: string; counts: number[] }[] }` (index collections only; a token counts once per technique of its collection, in its mint year; tokens with supply 0 excluded); `bar(value, max, width = 12): string`; `balance(cols): { oneOfOne: number; editionPieces: number }`; `onChainShare(cols): number` (0..1, by works, index only).

- [ ] **Step 1: Failing test** — `tests/site/techniques.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { CollectionOut, TokenOut } from '../../src/lib/data';
import { balance, bar, onChainShare, techniqueYears } from '../../src/lib/techniques';

const col = (p: Partial<CollectionOut>) => ({ slug: 's', section: 'index', standard: 'erc721', techniques: ['illustration'], works: 1, pieces: 1, ...p }) as CollectionOut;
const tok = (at: string, supply = 1) => ({ supply, mint: { at } }) as TokenOut;

describe('techniques', () => {
  const cols = [col({ slug: 'a', techniques: ['illustration'], works: 2, pieces: 2 }), col({ slug: 'b', techniques: ['generative', 'on-chain'], works: 6, pieces: 6 }), col({ slug: 'e', standard: 'erc1155', pieces: 40, works: 3 }), col({ slug: 'x', section: 'experiments', techniques: ['generative'] })];
  const tokens = { a: [tok('2023-02-01T00:00:00.000Z'), tok('2023-03-01T00:00:00.000Z')], b: [tok('2026-09-01T00:00:00.000Z'), tok('2026-09-02T00:00:00.000Z', 0)], e: [tok('2023-01-01T00:00:00.000Z')], x: [tok('2026-09-01T00:00:00.000Z')] };

  it('counts works per technique and year', () => {
    expect(techniqueYears(cols, tokens)).toEqual({
      years: ['2023', '2026'],
      rows: [
        { technique: 'illustration', counts: [3, 0] },
        { technique: 'generative', counts: [0, 1] },
        { technique: 'on-chain', counts: [0, 1] },
      ],
    });
  });
  it('draws mono bars', () => {
    expect(bar(3, 3, 6)).toBe('██████');
    expect(bar(1, 12, 6)).toBe('█░░░░░');
    expect(bar(0, 5, 4)).toBe('░░░░');
  });
  it('computes balance and on-chain share', () => {
    expect(balance(cols)).toEqual({ oneOfOne: 2, editionPieces: 40 });
    expect(onChainShare(cols)).toBeCloseTo(6 / 11);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/lib/techniques.ts`**

```ts
import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';

const index = (cols: CollectionOut[]) => cols.filter((c) => c.section === 'index');

export function techniqueYears(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>) {
  const order: string[] = [];
  const counts = new Map<string, Map<string, number>>();
  for (const c of index(cols)) {
    for (const tech of c.techniques) if (!order.includes(tech)) order.push(tech);
    for (const t of tokensBySlug[c.slug] ?? []) {
      if (t.supply <= 0 || !t.mint) continue;
      const y = t.mint.at.slice(0, 4);
      for (const tech of c.techniques) {
        const m = counts.get(tech) ?? new Map<string, number>();
        m.set(y, (m.get(y) ?? 0) + 1);
        counts.set(tech, m);
      }
    }
  }
  const years = [...new Set([...counts.values()].flatMap((m) => [...m.keys()]))].sort();
  return { years, rows: order.map((technique) => ({ technique, counts: years.map((y) => counts.get(technique)?.get(y) ?? 0) })) };
}

export function bar(value: number, max: number, width = 12): string {
  const n = max <= 0 || value <= 0 ? 0 : Math.max(1, Math.round((value / max) * width));
  return '█'.repeat(n) + '░'.repeat(width - n);
}

export function balance(cols: CollectionOut[]) {
  const idx = index(cols);
  return {
    oneOfOne: idx.filter((c) => c.standard === 'erc721' && !c.techniques.includes('generative')).reduce((s, c) => s + c.works, 0),
    editionPieces: idx.filter((c) => c.standard === 'erc1155').reduce((s, c) => s + c.pieces, 0),
  };
}

export function onChainShare(cols: CollectionOut[]): number {
  const idx = index(cols);
  const total = idx.reduce((s, c) => s + c.works, 0);
  return total ? idx.filter((c) => c.techniques.includes('on-chain')).reduce((s, c) => s + c.works, 0) / total : 0;
}
```

Run → PASS.

- [ ] **Step 3: `src/pages/techniques.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import { collections, timeline, tokensOf } from '../lib/data';
import { balance, bar, onChainShare, techniqueYears } from '../lib/techniques';
import { monthLabel } from '../lib/timeline';
const cols = collections();
const tokens = Object.fromEntries(cols.map((c) => [c.slug, tokensOf(c.slug)]));
const tv = techniqueYears(cols, tokens);
const max = Math.max(1, ...tv.rows.flatMap((r) => r.counts));
const b = balance(cols);
const share = onChainShare(cols);
const tl = timeline();
const hmax = Math.max(1, ...tl.map((t) => t.holders));
const quarterly = tl.filter((_, i) => i % 3 === 0 || i === tl.length - 1);
---
<Base title="techniques — gruff" current="techniques">
  <section class="page">
    <h2 class="k">technique × year <span class="f">· source: catalog</span></h2>
    <div class="tbl" style={`--cols:${tv.years.length}`}>
      <span></span>{tv.years.map((y) => <span class="k">{y}</span>)}
      {tv.rows.map((r) => (<><span>{r.technique}</span>{r.counts.map((n) => <span class="bar" title={`${n} works`}>{bar(n, max, 8)}</span>)}</>))}
    </div>
    <h2 class="k">1/1 ←→ editions</h2>
    <p class="bal"><span>1/1 · {b.oneOfOne} works</span><span class="bar">{bar(b.oneOfOne, b.oneOfOne + b.editionPieces, 24)}</span><span>{b.editionPieces} edition pieces</span></p>
    <h2 class="k">on-chain</h2>
    <p><span class="bar">{bar(share, 1, 24)}</span> {Math.round(share * 100)}% of works live entirely on-chain</p>
    <h2 class="k">keepers over time</h2>
    <div class="growth">{quarterly.map((t) => <div class="g"><span class="k">{monthLabel(t.month)}</span><span class="bar">{bar(t.holders, hmax, 24)}</span><span class="m">{t.holders}</span></div>)}</div>
  </section>
</Base>
<style>
  h2 { font: 400 11px var(--mono); letter-spacing: .04em; margin: 34px 0 12px; }
  h2:first-child { margin-top: 26px; }
  .tbl { display: grid; grid-template-columns: 140px repeat(var(--cols), minmax(0, 1fr)); gap: 8px 14px; align-items: center; }
  .bar { letter-spacing: -1px; font-size: 13px; text-transform: none; white-space: nowrap; overflow: hidden; }
  .bal { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
  .g { display: grid; grid-template-columns: 70px minmax(0, 1fr) 60px; gap: 12px; padding: 2px 0; }
  .g .m { text-align: right; }
  @media (max-width: 767px) { .tbl { grid-template-columns: 96px repeat(var(--cols), minmax(0, 1fr)); gap: 6px 6px; } .bar { font-size: 10px; } }
</style>
```

- [ ] **Step 4: e2e** (append)

```ts
test('techniques page draws the catalog', async ({ page }) => {
  await checkPage(page, '/techniques/');
  await expect(page.getByText('technique × year')).toBeVisible();
  expect(await page.locator('.bar').count()).toBeGreaterThan(4);
});
```

Run `npm run e2e`, `npm test`, `npm run typecheck` → pass.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(site): techniques page computed from the catalog

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 12: About and Experiments

**Files:**
- Create: `src/lib/site.ts`, `src/pages/about.astro`, `src/pages/experiments.astro`, `tests/site/site.test.ts`
- Modify: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `site.ts`: `SOCIALS: { label: string; url: string }[]`, `STATEMENT = 'trying to be an experimental artist'`.

> The social profile URLs below were confirmed by the user on 2026-11-05.

- [ ] **Step 1: Failing test** — `tests/site/site.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { SOCIALS, STATEMENT } from '../../src/lib/site';

describe('site constants', () => {
  it('has the statement and https socials', () => {
    expect(STATEMENT).toBe('trying to be an experimental artist');
    expect(SOCIALS.map((s) => s.label)).toEqual(['x', '6529', 'opensea', 'transient', 'networked.art']);
    for (const s of SOCIALS) expect(s.url).toMatch(/^https:\/\//);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `src/lib/site.ts`**

```ts
export const STATEMENT = 'trying to be an experimental artist';

export const SOCIALS: { label: string; url: string }[] = [
  { label: 'x', url: 'https://x.com/gruffwashere' },
  { label: '6529', url: 'https://6529.io/gruff' },
  { label: 'opensea', url: 'https://opensea.io/gruffdzn.eth' },
  { label: 'transient', url: 'https://www.transient.xyz/@gruff' },
  { label: 'networked.art', url: 'https://networked.art/gruff' },
];
```

Run → PASS.

- [ ] **Step 3: `src/pages/about.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import { SOCIALS, STATEMENT } from '../lib/site';
---
<Base title="about — gruff" current="about">
  <section class="page about">
    <p class="lower stmt">{STATEMENT}</p>
    <p class="tag">archive emotions before they fade</p>
    <ul class="socials">
      {SOCIALS.map((s) => <li class="lr"><span class="l">{s.label}</span><a class="v" href={s.url} rel="me noopener" target="_blank">{s.url.replace('https://', '')} ↗</a></li>)}
    </ul>
  </section>
</Base>
<style>
  .about { max-width: 720px; }
  .stmt { font-size: 22px; margin: 40px 0 6px; }
  .tag { font-weight: 300; text-transform: none; font-size: 13px; margin: 0 0 40px; background: linear-gradient(90deg, #bbb 0%, #999 35%, #444 70%, #0d0d0d 100%); -webkit-background-clip: text; background-clip: text; color: transparent; display: inline-block; }
  .tag::before { content: '— '; }
  .socials { list-style: none; padding: 0; margin: 0; }
  .socials a { min-height: 32px; display: inline-flex; align-items: center; }
</style>
```

- [ ] **Step 4: `src/pages/experiments.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import { collections, tokensOf } from '../lib/data';
import { experimentCollections, firstYear } from '../lib/collections';
import { chooseMedia } from '../lib/media';
import { collectionPath } from '../lib/links';
const rooms = experimentCollections(collections()).map((c) => ({ c, cover: tokensOf(c.slug).find((t) => t.id === c.coverTokenId) ?? tokensOf(c.slug)[0] }));
---
<Base title="experiments — gruff" current="experiments">
  <section class="page">
    <p class="k intro">experiments · rooms where things are still moving</p>
    <div class="rooms">
      {rooms.map(({ c, cover }) => {
        const m = cover ? chooseMedia(cover, 'thumb') : null;
        return (
          <a class="room" href={collectionPath(c.slug)}>
            {m?.src ? <img src={m.src} alt={c.title} loading="lazy" class:list={{ px: m.pixelated }} /> : <div class="empty" />}
            <span class="k">{c.accession}</span>
            <span class="lead">{c.title}</span>
            <span class="k">{firstYear(c)} · {c.works} works</span>
          </a>
        );
      })}
    </div>
  </section>
</Base>
<style>
  .intro { margin: 26px 0 22px; }
  .rooms { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 28px; }
  .room { display: flex; flex-direction: column; gap: 4px; }
  .room img, .room .empty { aspect-ratio: 1 / 1; object-fit: cover; width: 100%; background: #0b0b0b; margin-bottom: 8px; }
  .px { image-rendering: pixelated; }
</style>
```

- [ ] **Step 5: e2e** (append)

```ts
test('about lists the socials and experiments lists the rooms', async ({ page }) => {
  await checkPage(page, '/about/');
  await expect(page.getByText('trying to be an experimental artist')).toBeVisible();
  expect(await page.locator('.socials a').count()).toBe(5);
  await checkPage(page, '/experiments/');
  await expect(page.locator('.room')).toHaveCount(1);
});
```

Run `npm run e2e`, `npm test`, `npm run typecheck` → pass.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(site): about and experiments pages

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

### Task 13: Deploy readiness — headers, idle check, deploy guide

**Files:**
- Create: `public/_headers`, `docs/deploy.md`
- Modify: `tests/e2e/smoke.spec.ts` (idle fade + mobile menu)

**Interfaces:**
- Consumes: everything above.
- Produces: a build that Cloudflare Pages deploys with build command `npm run build`, output `dist`, functions from `functions/`, env `OPENSEA_API_KEY`.

- [ ] **Step 1: e2e for global behaviours** (append)

```ts
test('idle fade and the mobile menu', async ({ page }, info) => {
  await page.clock.install();
  await page.goto('/');
  await page.clock.fastForward(61_000);
  await expect(page.locator('body')).toHaveClass(/fading/);
  await page.mouse.move(10, 10);
  await expect(page.locator('body')).not.toHaveClass(/fading/);
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'menu' }).click();
    await expect(page.getByRole('link', { name: 'keepers' })).toBeVisible();
  }
});
```

Run `npm run e2e -- -g idle` → PASS (behaviour from Task 1); if it fails, fix `idle.ts`/`nav.ts` minimally.

- [ ] **Step 2: `public/_headers`**

```
/media/*
  Cache-Control: public, max-age=31536000, immutable
  Content-Security-Policy: sandbox allow-scripts
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

- [ ] **Step 3: `docs/deploy.md`** (Turkish, for the user)

```markdown
# Siteyi yayına alma (Cloudflare Pages, ücretsiz)

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → GitHub reposunu seç.
2. Ayarlar:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: boş bırak
3. **Environment variables** → **Add**: `OPENSEA_API_KEY` = OpenSea'den aldığın anahtar (Production ve Preview için). Bu anahtarı sen girersin; repoya hiç yazılmaz.
4. **Save and Deploy**. İlk build birkaç dakika sürer. Sonunda `*.pages.dev` adresin hazır olur.
5. Domain: **Custom domains** → **Set up a custom domain** → domainini yaz, Cloudflare'in gösterdiği DNS adımlarını izle.
6. Bundan sonra her 6 saatte bir envanter GitHub'a commit attığında Cloudflare siteyi kendiliğinden yeniden kurar (ücretsiz planda ayda 500 build hakkı var; envanter en fazla ~120 kullanır).
```

- [ ] **Step 4: Full verification**

Run: `npm test` (all unit tests), `npm run typecheck`, `npm run build` (prints `[check-dist] N files`, N < 19000), `npm run e2e` (all smoke tests, both projects).
Expected: everything passes.

- [ ] **Step 5: Commit**

```bash
git add public/_headers docs/deploy.md tests/e2e
git commit -m "chore(site): cache headers, global behaviour checks, deploy guide

Co-Authored-By: (your model name) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- Spec §5 pages: index (Task 3) + scrubber (4) + pulse (3); collection (5); work page A layout + activity + print label (6, 8); /activity (9); /keepers (10); /techniques (11); /about (12); /experiments (12); 404 (1). §5.1/5.2 visitors' book, verified badge, back room → plan 3. §6 visual language → Tasks 1, 3, 6 (tokens, wordmark ink, tagline fade, dotted leaders, big price, no accent/grain). §7 mobile → every page's CSS + e2e at 390 px. Live price (§3) → Task 7. Cloudflare limits → Task 6 check-dist. Deploy → Task 13.
- Deviation from spec §4.4 (accepted): large collections are generated as static pages too (≈3,900 work pages + ≈6–7k media files stay under the 20,000-file limit; `check-dist` fails the build above 19,000), so no `_redirects` template is needed.
- Open item for the controller: confirm social URLs before Task 12.
- Deferred to plan 3 (final review I8): spec §5 keeper extras, namely a few small images in each keeper row and a 2023-to-now acquisitions timeline in the expanded details. The data exists (`holdings`, the activity months); the keepers page ships without them.
- Accepted deviations from the spec (final review recommendation 6), to be written into the spec:
  - Techniques use CSS meters instead of the █░ glyph bars.
  - Token titles keep their original case (spec §6 says titles are uppercase).
  - No `_redirects` fallback (§4.4); every work page is static.
  - The index meta line has no "N works".
  - The index pulse line links to the work, not to /activity.
  - /keepers renders all keepers client-side rather than 300 rows plus a JSON file.
  - §8's "every token has an image and a page, codes unique" is enforced by the indexer, not by `check-dist`.
- Plan 1 follow-up: every collection has `wallText: null`; the spec says to fall back to the contract metadata description, so collection pages open without wall text for now.
- Tokens with `supply === 0` (burned or unclaimed) are hidden from collection grids and counts; their work pages stay as a record and read "none in circulation".
