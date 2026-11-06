# Techniques page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Write the failing test first for every pure function.

**Goal:** Replace `/techniques` with one-vote technique lines per quarter, a tool strip on the same time axis, eight method notes with process images, and a one-line summary.

**Spec:** `docs/superpowers/specs/2026-11-06-techniques-page-design.md` (approved by the artist 2026-11-06). Read it first. It holds the copy drafts and the tag table.

**Architecture:**
- The config splits `techniques` into two zod-enum lists, `techniques` (4) and `tools` (6). The indexer copies both into `CollectionOut`.
- A pure `src/lib/techniques.ts` turns the catalog and rooms into quarter series.
- Two Astro components draw them as static HTML plus inline SVG, with no JS and no chart library.
- A one-off Node script makes the note images into `public/techniques/`.

**Tech Stack:** Astro 7, TypeScript, zod, Vitest, Playwright, sharp (already a dependency).

## Global Constraints

Everything in `docs/superpowers/plans/2026-11-05-gruff-site-followups.md` → "Global Constraints" still applies:
- `gruff` always lowercase; addresses lowercase.
- `:global` styles for runtime DOM.
- 44 px `.hit` targets.
- No horizontal scroll from 360 px.
- The site never writes `public/media/` or `data/`.
- No secrets in git.
- No accent colour, no red/blue, no grain, no glyph bars.

Copy is English, lowercase, quiet. **No em dashes (—) in any new user-facing text**, a rule from the artist's earlier projects. The en dash in existing labels stays.

Ink is `var(--fg)`, hairlines `var(--line)`, muted text `var(--muted)`/`var(--dim)`. The tokens live in `src/styles/global.css`.

Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage only your own paths. Never stage `data/` or `public/media/`.

---

### Task 1: Split tags into techniques and tools

**Files:**
- Create: `indexer/tags.ts`
- Modify:
  - `indexer/config.ts` (schema)
  - `indexer/types.ts` (`CollectionConfig.tools?`)
  - `indexer/aggregate/collections.ts` (`CollectionOut.tools`)
  - `config/collections.yaml` (every collection's tags)
  - `src/lib/collections.ts` (`filterTags`)
  - `src/lib/catalog.ts` (two generative checks)
  - `src/lib/techniques.ts` (`balance`, `onChainShare`)
  - `src/lib/rooms.ts` (`Room.tools?`, dive bar)
- Test:
  - `tests/indexer/config.test.ts`
  - `tests/site/collections.test.ts`
  - `tests/site/catalog.test.ts`
  - `tests/site/techniques.test.ts`
  - `tests/site/rooms.test.ts`
  - `tests/site/fixtures/catalog/collections.json`
  - `tests/e2e/smoke.spec.ts` (lines that read `c.techniques.includes('on-chain' | 'generative')`)

**Interfaces:**
- Produces, in `indexer/tags.ts`:

  ```ts
  export const TECHNIQUES = ['vector illustration', 'glitch art', 'generative art', 'code art'] as const;
  export type Technique = (typeof TECHNIQUES)[number];
  export const TOOLS = ['photoshop', 'touchdesigner', 'mathematics', 'pixel grid', 'three.js', 'on-chain'] as const;
  export type Tool = (typeof TOOLS)[number];
  export const isGenerative = (c: { techniques: readonly string[] }) => c.techniques.includes('generative art');
  export const isOnChain = (c: { tools?: readonly string[] }) => (c.tools ?? []).includes('on-chain');
  ```

  Also `CollectionOut.tools: string[]` and `Room.tools?: Tool[]`.

- [ ] **Step 1: Write failing tests.** In `tests/indexer/config.test.ts`:
  - Change every inline YAML `techniques: [illustration]` to `techniques: [vector illustration]`.
  - Add:

  ```ts
  it('accepts only the four techniques and the six tools', () => {
    const base = (t: string, tools = '') => `artist: "0x4730497622bdfd6eafe1f09fa22b3a0aca94a646"\ncollections:\n  - { code: AAA, slug: a, title: "A", contract: "0x0000000000000000000000000000000000000001", standard: erc721, platform: custom, section: index, techniques: [${t}]${tools} }\n`;
    expect(() => parseConfig(base('vector illustration'))).not.toThrow();
    expect(parseConfig(base('glitch art')).collections[0].tools).toEqual([]);
    expect(() => parseConfig(base('illustration'))).toThrow();
    expect(() => parseConfig(base('code art', ', tools: [blender]'))).toThrow();
    expect(parseConfig(base('code art', ', tools: [three.js, on-chain]')).collections[0].tools).toEqual(['three.js', 'on-chain']);
  });
  it('tags the real collections as the artist set them (2026-11-06)', () => {
    const cols = loadConfig().collections;
    const codes = (f: (c: (typeof cols)[number]) => boolean) => cols.filter(f).map((c) => c.code).sort();
    expect(codes((c) => isGenerative(c))).toEqual(['FCT', 'GRT', 'OVN', 'PHG']);
    expect(codes((c) => isOnChain(c))).toEqual(['FCT', 'OVN', 'PHG']);
    expect(codes((c) => c.techniques.includes('glitch art'))).toEqual(['366', 'OVS', 'PUL', 'SUB']);
    expect(codes((c) => c.techniques.includes('code art'))).toEqual(['FCT', 'OVN', 'PHG']);
    expect(codes((c) => !!c.tools?.includes('touchdesigner'))).toEqual(['PUL']);
    expect(codes((c) => !!c.tools?.includes('pixel grid'))).toEqual(['FCT']);
    expect(codes((c) => !!c.tools?.includes('photoshop'))).toEqual(['ANT', 'BLS', 'CLB', 'ESS', 'GFT', 'ICN', 'LSO', 'ONE', 'PPC', 'PUL', 'RES', 'SLV', 'SOA', 'VBS']);
  });
  ```

  The quoted YAML in `base` must keep the test file's existing style. Import `isGenerative, isOnChain` from `../../indexer/tags`.

- [ ] **Step 2: Update the site test fixtures to the new vocabulary.**
  - `'illustration'` → `'vector illustration'`.
  - `'generative'` → `'generative art'`.
  - `'on-chain'` moves into a `tools: ['on-chain']` field.
  - `'pixel'` → `tools: ['pixel grid']`.

  This applies to `tests/site/collections.test.ts`, `tests/site/catalog.test.ts`, `tests/site/techniques.test.ts` and `tests/site/fixtures/catalog/collections.json`. Keep every expected result the same: the split must not change any filter, wall or balance outcome. In `tests/site/rooms.test.ts` add:

  ```ts
  it('gives the dive bar its three.js tool and no other room a tool yet', () => {
    expect(ROOMS.find((r) => r.slug === 'dive-bar')!.tools).toEqual(['three.js']);
    expect(ROOMS.filter((r) => r.slug !== 'dive-bar').every((r) => !r.tools?.length)).toBe(true);
  });
  ```

- [ ] **Step 3: Run and see them fail.** Run `npx vitest run tests/indexer/config.test.ts tests/site`. Expect failures: `indexer/tags` is missing, the enum is not enforced, the real config still has the old tags, and the fixtures no longer match the old checks.

- [ ] **Step 4: Implement.**
  - Create `indexer/tags.ts` exactly as in Interfaces.
  - In `indexer/config.ts` import `TECHNIQUES, TOOLS` and change the schema:

    ```ts
    techniques: z.array(z.enum(TECHNIQUES)).min(1),
    tools: z.array(z.enum(TOOLS)).default([]),
    ```

  - In `indexer/types.ts` add `tools?: string[];` next to `techniques`.
  - In `indexer/aggregate/collections.ts`, add `tools: string[];` to `CollectionOut` and set `tools: i.cfg.tools ?? [],` next to `techniques`.
  - In `src/lib/collections.ts`, `filterTags` uses `isGenerative(c)` and `isOnChain(c)` from `../../indexer/tags`.
  - In `src/lib/catalog.ts`, both `c.techniques.includes('generative')` checks become `isGenerative(c)`.
  - In `src/lib/techniques.ts`, `balance` uses `!isGenerative(c)` and `onChainShare` uses `isOnChain(c)`. Task 2 rewrites the rest of this file.
  - In `src/lib/rooms.ts`, add to `Room`:

    ```ts
    /** Tools for the techniques page strip (rooms never count toward the technique lines). */
    tools?: Tool[];
    ```

    and `tools: ['three.js'],` to the `dive-bar` room.
  - Rewrite each collection's `techniques: [...]` in `config/collections.yaml`, and add `tools: [...]` per the spec's table:
    - ANT, BLS, PPC, VBS, GFT, CLB, ONE, ICN, SLV, ESS, LSO, RES, SOA: `techniques: [vector illustration], tools: [photoshop]`
    - GRT: `techniques: [generative art, vector illustration]`
    - PUL: `techniques: [vector illustration, glitch art], tools: [photoshop, touchdesigner]`
    - OVS, 366, SUB: `techniques: [glitch art]`
    - PHG: `techniques: [generative art, code art], tools: [mathematics, on-chain]`
    - FCT: `techniques: [generative art, code art], tools: [mathematics, pixel grid, on-chain]`
    - OVN: `techniques: [generative art, code art], tools: [on-chain]`

    YAML flow sequences accept the spaces and `three.js` unquoted. Keep the file's comments.
  - In `tests/e2e/smoke.spec.ts`, replace `c.techniques.includes('on-chain')` with `isOnChain(c)` and `c.techniques.includes('generative')` with `isGenerative(c)`, imported from `../../indexer/tags`.

- [ ] **Step 5: Verify.**
  - `npx vitest run` passes in full.
  - `npm run typecheck` passes.
  - `node -e "require('yaml')"` is not needed; `loadConfig()` runs in the test.

- [ ] **Step 6: Commit.** Message: `feat: techniques and tools as separate, validated tags (the artist's four techniques)`. Stage only the files above.

> The committed catalog (`data/catalog/collections.json`) still holds the old tags until the next inventory run. The controller runs a keyed inventory after this task and commits the data, before Tasks 2–4 run their e2e. Do not run the inventory yourself.

### Task 2: Quarter series in `src/lib/techniques.ts`

**Files:**
- Modify: `src/lib/techniques.ts`. Remove `techniqueYears` and `barPct`; `src/pages/techniques.astro` is rewritten in Task 4.
- Test: `tests/site/techniques.test.ts`, fully rewritten.

**Interfaces:**
- Consumes `TECHNIQUES, TOOLS, Technique, Tool, isGenerative, isOnChain` from `indexer/tags.ts`, and `Room` from `src/lib/rooms.ts`.
- Produces:

  ```ts
  export const quarterOf = (iso: string): string            // '2025-08-14T…' → '2025Q3'
  export function quarterSpan(from: string, to: string): string[]   // inclusive, '2024Q4','2025Q2' → ['2024Q4','2025Q1','2025Q2']
  export function timelineQuarters(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, rooms: Pick<Room, 'date' | 'since'>[]): string[]
  export function techniqueShares(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, quarters: string[]): Record<Technique, (number | null)[]>
  export function toolCells(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, rooms: Pick<Room, 'date' | 'since' | 'tools'>[], quarters: string[]): Record<Tool, boolean[]>
  export function summary(cols: CollectionOut[]): { onChainPct: number; oneOfOne: number; editionPieces: number }
  ```

- [ ] **Step 1: Write the failing tests** in `tests/site/techniques.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import type { CollectionOut, TokenOut } from '../../src/lib/data';
  import { quarterOf, quarterSpan, summary, techniqueShares, timelineQuarters, toolCells } from '../../src/lib/techniques';

  const col = (p: Partial<CollectionOut>) => ({ slug: 's', section: 'index', standard: 'erc721', techniques: ['vector illustration'], tools: [], works: 1, pieces: 1, ...p }) as CollectionOut;
  const tok = (at: string, supply = 1) => ({ supply, mint: { at } }) as TokenOut;
  const many = (n: number, at: string) => Array.from({ length: n }, () => tok(at));

  describe('quarters', () => {
    it('names a quarter and spans quarters inclusively', () => {
      expect(quarterOf('2023-01-31T00:00:00.000Z')).toBe('2023Q1');
      expect(quarterOf('2025-08-14T10:00:00.000Z')).toBe('2025Q3');
      expect(quarterOf('2026-12-01')).toBe('2026Q4');
      expect(quarterSpan('2024Q4', '2025Q2')).toEqual(['2024Q4', '2025Q1', '2025Q2']);
      expect(quarterSpan('2025Q1', '2025Q1')).toEqual(['2025Q1']);
    });
    it('runs from the first dated work or room to the last', () => {
      const cols = [col({ slug: 'a' })];
      expect(timelineQuarters(cols, { a: [tok('2023-02-01T00:00:00.000Z')] }, [{ date: '2023-11-30', since: '2023-11' }])).toEqual(['2023Q1', '2023Q2', '2023Q3', '2023Q4']);
      expect(timelineQuarters([], {}, [])).toEqual([]);
    });
  });

  describe('techniqueShares', () => {
    const Q = ['2023Q1', '2023Q2', '2023Q3'];
    it('gives every collection one vote, whatever its size', () => {
      const cols = [col({ slug: 'big', techniques: ['generative art'] }), col({ slug: 'one', techniques: ['vector illustration'] })];
      const s = techniqueShares(cols, { big: many(673, '2023-02-01T00:00:00.000Z'), one: [tok('2023-03-01T00:00:00.000Z')] }, Q);
      expect(s['generative art'][0]).toBe(50);
      expect(s['vector illustration'][0]).toBe(50);
    });
    it('counts a collection fully on each of its techniques', () => {
      const s = techniqueShares([col({ slug: 'p', techniques: ['vector illustration', 'glitch art'] })], { p: [tok('2023-05-01T00:00:00.000Z')] }, Q);
      expect(s['vector illustration'][1]).toBe(100);
      expect(s['glitch art'][1]).toBe(100);
      expect(s['code art'][1]).toBe(0);
    });
    it('leaves a quarter with no mints empty, not zero, and skips burned or undated tokens', () => {
      const s = techniqueShares([col({ slug: 'a' })], { a: [tok('2023-01-10T00:00:00.000Z'), tok('2023-02-10T00:00:00.000Z', 0), { supply: 1, mint: null } as unknown as TokenOut] }, Q);
      expect(s['vector illustration']).toEqual([100, null, null]);
    });
    it('splits a collection across the quarters it minted in', () => {
      const cols = [col({ slug: 'a', techniques: ['glitch art'] }), col({ slug: 'b', techniques: ['code art'] })];
      const s = techniqueShares(cols, { a: [tok('2023-01-10T00:00:00.000Z'), tok('2023-04-10T00:00:00.000Z')], b: [tok('2023-04-11T00:00:00.000Z')] }, Q);
      expect(s['glitch art']).toEqual([100, 33, null]);
      expect(s['code art']).toEqual([0, 67, null]);
    });
  });

  describe('toolCells', () => {
    it('fills a quarter when a collection minted then or a room is dated then', () => {
      const cols = [col({ slug: 'a', tools: ['photoshop'] })];
      const t = toolCells(cols, { a: [tok('2023-01-10T00:00:00.000Z')] }, [{ date: '2023-08-01', since: '2023-08', tools: ['three.js'] }], ['2023Q1', '2023Q2', '2023Q3']);
      expect(t.photoshop).toEqual([true, false, false]);
      expect(t['three.js']).toEqual([false, false, true]);
      expect(t['on-chain']).toEqual([false, false, false]);
    });
  });

  describe('summary', () => {
    it('counts on-chain share, 1/1 works and edition pieces', () => {
      const cols = [col({ slug: 'a', works: 2 }), col({ slug: 'b', techniques: ['generative art', 'code art'], tools: ['on-chain'], works: 6 }), col({ slug: 'e', standard: 'erc1155', pieces: 40, works: 3 }), col({ slug: 'x', section: 'experiments', techniques: ['generative art'], works: 1 })];
      expect(summary(cols)).toEqual({ onChainPct: 50, oneOfOne: 2, editionPieces: 40 });
    });
  });
  ```

- [ ] **Step 2: Run and see it fail.** Run `npx vitest run tests/site/techniques.test.ts`. Expect: the functions are not exported.

- [ ] **Step 3: Implement** in `src/lib/techniques.ts`:

  ```ts
  import type { CollectionOut } from '../../indexer/aggregate/collections';
  import type { TokenOut } from '../../indexer/aggregate/tokens';
  import { TECHNIQUES, TOOLS, isGenerative, isOnChain, type Technique, type Tool } from '../../indexer/tags';
  import type { Room } from './rooms';

  /** Every collection, the experiments included: no work silently drops out of the page. */
  const shown = (cols: CollectionOut[]) => cols.filter((c) => c.section === 'index' || c.section === 'experiments');
  const dated = (tokens: TokenOut[] = []) => tokens.filter((t) => t.supply > 0 && !!t.mint?.at);
  const roomDay = (r: Pick<Room, 'date' | 'since'>) => r.date ?? `${r.since}-01`;

  export const quarterOf = (iso: string) => `${iso.slice(0, 4)}Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;

  export function quarterSpan(from: string, to: string): string[] {
    const n = (q: string) => Number(q.slice(0, 4)) * 4 + Number(q.slice(5)) - 1;
    const out: string[] = [];
    for (let i = n(from); i <= n(to); i++) out.push(`${Math.floor(i / 4)}Q${(i % 4) + 1}`);
    return out;
  }

  export function timelineQuarters(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, rooms: Pick<Room, 'date' | 'since'>[]): string[] {
    const qs = [...shown(cols).flatMap((c) => dated(tokensBySlug[c.slug]).map((t) => quarterOf(t.mint!.at))), ...rooms.map((r) => quarterOf(roomDay(r)))].sort();
    return qs.length ? quarterSpan(qs[0]!, qs[qs.length - 1]!) : [];
  }

  /** Each collection is one vote: its dated tokens share a weight of 1 across the quarters they were minted in. */
  export function techniqueShares(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, quarters: string[]): Record<Technique, (number | null)[]> {
    const at = new Map(quarters.map((q, i) => [q, i]));
    const total = quarters.map(() => 0);
    const per = Object.fromEntries(TECHNIQUES.map((t) => [t, quarters.map(() => 0)])) as Record<Technique, number[]>;
    for (const c of shown(cols)) {
      const ts = dated(tokensBySlug[c.slug]);
      for (const t of ts) {
        const i = at.get(quarterOf(t.mint!.at));
        if (i === undefined) continue;
        total[i]! += 1 / ts.length;
        for (const tech of c.techniques) if (tech in per) per[tech as Technique][i]! += 1 / ts.length;
      }
    }
    return Object.fromEntries(TECHNIQUES.map((t) => [t, per[t].map((w, i) => (total[i]! > 0 ? Math.round((100 * w) / total[i]!) : null))])) as Record<Technique, (number | null)[]>;
  }

  export function toolCells(cols: CollectionOut[], tokensBySlug: Record<string, TokenOut[]>, rooms: Pick<Room, 'date' | 'since' | 'tools'>[], quarters: string[]): Record<Tool, boolean[]> {
    const at = new Map(quarters.map((q, i) => [q, i]));
    const cells = Object.fromEntries(TOOLS.map((t) => [t, quarters.map(() => false)])) as Record<Tool, boolean[]>;
    const mark = (tools: readonly string[] | undefined, q: string) => {
      const i = at.get(q);
      if (i !== undefined) for (const tool of tools ?? []) if (tool in cells) cells[tool as Tool][i] = true;
    };
    for (const c of shown(cols)) for (const t of dated(tokensBySlug[c.slug])) mark(c.tools, quarterOf(t.mint!.at));
    for (const r of rooms) mark(r.tools, quarterOf(roomDay(r)));
    return cells;
  }

  export function summary(cols: CollectionOut[]) {
    const idx = shown(cols);
    const works = idx.reduce((s, c) => s + c.works, 0);
    return {
      onChainPct: works ? Math.round((100 * idx.filter(isOnChain).reduce((s, c) => s + c.works, 0)) / works) : 0,
      oneOfOne: idx.filter((c) => c.standard === 'erc721' && !isGenerative(c)).reduce((s, c) => s + c.works, 0),
      editionPieces: idx.filter((c) => c.standard === 'erc1155').reduce((s, c) => s + c.pieces, 0),
    };
  }
  ```

  Remove the old `balance`, `onChainShare`, `techniqueYears` and `barPct`. If `src/pages/techniques.astro` still imports them, replace that page's frontmatter imports with `summary` only. The page body is rewritten in Task 4, so a temporary minimal page that prints `summary` is fine; it just has to keep `npm run typecheck` green.

- [ ] **Step 4: Verify.** `npx vitest run` and `npm run typecheck` pass.

- [ ] **Step 5: Commit.** Message: `feat: technique shares and tool cells per quarter, one vote per collection`.

### Task 3: Note images and the on-chain excerpt

**Files:**
- Create:
  - `scripts/techniques-assets.mjs`
  - its outputs under `public/techniques/`
  - `src/content/techniques/facets-onchain.txt`
- Test: `tests/site/techniques-assets.test.ts`, which checks the committed outputs exist with the right sizes.

**Inputs:**
- The artist's images in `.superpowers/techniques-src/` (git-ignored, already there):
  - `gruffters-illustrator-1.jpg` and `gruffters-illustrator-2.jpg`, 611×1080 portrait
  - `pulverulents-touchdesigner.jpg`, 803×804
  - `pulverulents-shoot.jpg`, 1284×714
  - `pulverulents-xcopy-dm.jpg`, 1284×926
- Media that is read only, never written:
  - FACETS #1 SVG: `data/catalog/tokens/facets.json` → `image.file`. It has a 35×35 viewBox, with one `<path>` per colour made of `M x y h n v1 H x z` row runs.
  - The large images of `essence` #1 and `icons` #1 (`image.large`, WebP).
  - The large image of `phigures` #1.

**Outputs** (all WebP, quality 86 unless lossless is stated):

| file | how |
|---|---|
| `vector-1.webp` | crop `gruffters-illustrator-1.jpg` to a square: left 0, top 260, size 611. Resize to 900. |
| `vector-2.webp` | crop `gruffters-illustrator-2.jpg` to a square: left 0, top 80, size 611. Resize to 900. |
| `td-network.webp` | `pulverulents-touchdesigner.jpg`, longest side at most 1200 |
| `td-shoot.webp` | `pulverulents-shoot.jpg`, longest side at most 1200 |
| `td-xcopy.webp` | `pulverulents-xcopy-dm.jpg`, longest side at most 1200 |
| `pixel-grid.webp` | FACETS #1: render the SVG to exactly 35×35 (`sharp(svg, { density: 72 }).resize(35, 35, { kernel: 'nearest' })`), upscale to 840×840 with `kernel: 'nearest'`, then composite a generated SVG of 34 vertical and 34 horizontal lines every 24 px, `stroke="#000" stroke-opacity=".35" stroke-width="1"`. Lossless. |
| `photoshop-a.webp` | a 640×640 centre crop of `essence` #1 large, at native resolution, so the grain shows |
| `photoshop-b.webp` | the same for `icons` #1. The artist picks a or b later; the page uses `a`. |
| `math-phigures.webp` | `phigures` #1 large, longest side at most 1200. First check `C:\Users\gruff\wallet-portraits-demo\` (read only) for a ready construction or skeleton debug image (`*.png`/`*.svg` named with debug/skeleton/joints/construction). If one exists, use it instead and say so in the report. Do not run that project. |

**`facets-onchain.txt`** is 8 lines taken from the same FACETS #1 SVG:
- line 1: the `<svg …>` open tag;
- line 2: the background `<rect …/>`;
- lines 3–8: the first six `<path>` elements, each cut after its first four `z` runs, with ` …"/>` appended;
- no other edits.

The three.js note uses the existing `public/exp/dive-bar/stills/wide.webp`. Do not copy it.

- [ ] **Step 1: Write the failing test** `tests/site/techniques-assets.test.ts`:

  ```ts
  import { existsSync, readFileSync } from 'node:fs';
  import sharp from 'sharp';
  import { describe, expect, it } from 'vitest';

  const dir = 'public/techniques';
  describe('techniques assets', () => {
    it('has every note image, web-sized', async () => {
      for (const f of ['vector-1', 'vector-2', 'td-network', 'td-shoot', 'td-xcopy', 'pixel-grid', 'photoshop-a', 'photoshop-b', 'math-phigures']) {
        const p = `${dir}/${f}.webp`;
        expect(existsSync(p), p).toBe(true);
        const m = await sharp(p).metadata();
        expect(Math.max(m.width!, m.height!), p).toBeLessThanOrEqual(1200);
      }
      const v = await sharp(`${dir}/vector-1.webp`).metadata();
      expect(v.width).toBe(v.height);
      expect((await sharp(`${dir}/pixel-grid.webp`).metadata()).width).toBe(840);
    });
    it('keeps an eight-line excerpt of a real on-chain FACETS svg', () => {
      const lines = readFileSync('src/content/techniques/facets-onchain.txt', 'utf8').trimEnd().split('\n');
      expect(lines).toHaveLength(8);
      expect(lines[0]).toMatch(/^<svg viewBox="0 0 35 35"/);
      expect(lines.slice(2).every((l) => /^<path fill="#[0-9a-f]{6}" d="M\d/.test(l))).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run and see it fail.** Run `npx vitest run tests/site/techniques-assets.test.ts`. Expect missing files.
- [ ] **Step 3: Write `scripts/techniques-assets.mjs`** to the table above:
  - ESM, using `sharp` and `node:fs`.
  - It reads token JSON to find media paths: `public` + `image.large` or `image.file`.
  - It writes only under `public/techniques/` and `src/content/techniques/`.
  - It prints each output with its size.
- [ ] **Step 4: Run it, then look at every output image yourself.**
  - Run `node scripts/techniques-assets.mjs`.
  - Read each WebP with the Read tool and check the crops show the screen or subject.
  - Adjust the two Gruffters crop offsets if the laptop screen is cut. Note the final offsets in the report.
- [ ] **Step 5: Verify.** Run `npx vitest run`.
- [ ] **Step 6: Commit** the script, the `public/techniques/*.webp` files, the excerpt and the test. Message: `feat: process images and an on-chain excerpt for the techniques notes`.

### Task 4: The page (chart, strip, notes, summary)

**Files:**
- Create:
  - `src/lib/technique-notes.ts`
  - `src/components/TechniqueChart.astro`
  - `src/components/TechniqueNotes.astro`
  - `tests/e2e/techniques.spec.ts`
- Modify:
  - `src/pages/techniques.astro`, a full rewrite
  - `tests/e2e/smoke.spec.ts`: delete the test `'techniques page draws the catalog'`
- Test:
  - `tests/site/technique-notes.test.ts`
  - `tests/e2e/techniques.spec.ts`

**Interfaces:**
- Consumes from Task 2: `timelineQuarters`, `techniqueShares`, `toolCells`, `summary`. From Task 1: `TECHNIQUES`, `TOOLS`. From Task 3: the files in `public/techniques/` and `src/content/techniques/facets-onchain.txt`.
- Produces, in `src/lib/technique-notes.ts`:

  ```ts
  export interface NoteImage { src: string; alt: string; caption?: string }
  export interface Note { key: string; label: string; text: string; images: NoteImage[]; excerpt?: 'facets-onchain'; links: { label: string; href: string }[] }
  export function techniqueNotes(cols: CollectionOut[]): Note[]   // 8 notes, in spec order
  export const LINE_DASH: Record<Technique, string>   // '' | '2 4' | '9 4' | '14 4 2 4'
  ```

**Notes content.** The copy is verbatim from the spec, section "Notes: copy drafts and visuals".

| key | label | images | links (`label` = collection title in lowercase, `href` = `collectionPath(slug)`) |
|---|---|---|---|
| vector | `vector illustration` | vector-1, vector-2 | gruffters, then the 3 earliest (by `firstMint`) other collections whose techniques include `vector illustration` |
| photoshop | `photoshop` | photoshop-a | the 3 earliest collections with tool `photoshop`, plus pulverulents |
| touchdesigner | `touchdesigner` | td-network, td-shoot, td-xcopy (caption `a message from xcopy`) | pulverulents |
| mathematics | `mathematics` | math-phigures | phigures, facets |
| pixel | `pixel grid` | pixel-grid | facets |
| three | `three.js` | `/exp/dive-bar/stills/wide.webp` | the dive bar room (`roomPath('dive-bar')`, label `6529 dive bar`) |
| onchain | `on-chain` | none; `excerpt: 'facets-onchain'` | phigures, facets, ovvn, plus `facets #1` → `workPath('facets', '1')` |
| ai | `ai` | none | none |

Alt texts describe the image plainly, e.g. `gruffters traits being drawn in illustrator`, `a touchdesigner network over a camera feed`, `facets #1 on its 35 by 35 grid`.

- [ ] **Step 1: Write a failing unit test** `tests/site/technique-notes.test.ts`, checking on the real catalog (`collections()` from `src/lib/data`):
  - 8 notes, with keys in the table's order.
  - The AI note has `images: []`, `links: []` and no `excerpt`.
  - The vector links start with gruffters and number 4.
  - No note text contains `—`.
  - Every local image path (`/techniques/…`, `/exp/…`) exists under `public/`.
  - `LINE_DASH` gives four different patterns.

- [ ] **Step 2: Implement `src/lib/technique-notes.ts`** to make it pass.

- [ ] **Step 3: Implement `TechniqueChart.astro`.** Props: `{ quarters: string[]; shares: Record<Technique, (number | null)[]>; tools: Record<Tool, boolean[]> }`. Structure, with no JS:

  ```astro
  <figure class="tchart" style={`--n:${quarters.length}`}>
    <ul class="legend">{TECHNIQUES.map((t) => <li><svg width="34" height="8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="currentColor" stroke-width="2" stroke-dasharray={LINE_DASH[t]} /></svg>{t}</li>)}</ul>
    <div class="grid">
      <span class="k y y100">100%</span><span class="k y y50">50%</span><span class="k y y0">0%</span>
      <svg class="plot" viewBox={`0 0 ${quarters.length} 100`} preserveAspectRatio="none" role="img" aria-label="…one sentence…">
        {[0, 50, 100].map((v) => <line x1="0" x2={quarters.length} y1={100 - v} y2={100 - v} class="gl" vector-effect="non-scaling-stroke" />)}
        {TECHNIQUES.map((t, k) => <path d={pathOf(shares[t], k)} class="ln" stroke-dasharray={LINE_DASH[t]} vector-effect="non-scaling-stroke" />)}
      </svg>
      <div class="years">{yearTicks(quarters).map(({ i, year }) => <span class="k" style={`left:calc(${(i + 0.5) / quarters.length} * 100%)`}>{year}</span>)}</div>
      {TOOLS.map((tool) => (<><span class="k tool">{tool}</span><span class="cells">{tools[tool].map((on) => <i class:list={{ on }} />)}</span></>))}
    </div>
    <table class="sr">…one row per quarter: quarter, each technique value or "no works", each tool yes/no…</table>
  </figure>
  ```

  - `pathOf(values, k)` lives in the component frontmatter (or `technique-notes.ts`):
    - The point for quarter `i` is at `x = i + 0.5` and `y = 100 - v + (k - 1.5) * 1.2`. The small per-line offset keeps equal lines side by side; the hidden table carries the exact values.
    - A `null` breaks the path: start a new `M`.
    - A run of one point draws `M x-0.3 y L x+0.3 y`.
  - `yearTicks(quarters)` returns the index of each year's first quarter with its year: `'2023Q1'` → `{ i: 0, year: '2023' }`.
  - CSS (scoped, nothing runtime-created):
    - `.grid` is a 2-column grid: `120px minmax(0, 1fr)` on desktop, `96px minmax(0, 1fr)` under 768 px.
    - The plot is `height: 220px` (`180px` on phones) with `width: 100%`.
    - `.ln` has `fill: none; stroke: var(--fg); stroke-width: 1.6`. `.gl` has `stroke: var(--line); stroke-width: 1`.
    - `.cells` is `display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 2px; height: 8px`. Filled cells are `i.on { background: var(--fg) }`.
    - Strip rows are 22 px apart, with a dotted `var(--line)` baseline.
    - `.years` is relative with absolute spans `translateX(-50%)`.
    - `.sr` is visually hidden: `position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap`.

- [ ] **Step 4: Implement `TechniqueNotes.astro`.** Props: `{ notes: Note[]; excerpt: string }`, where `excerpt` is read in the page with `readFileSync('src/content/techniques/facets-onchain.txt', 'utf8')`.
  - Each note is an `<article class="note" data-key={key}>` holding:
    - `<p class="k label">{label}</p>`
    - `<p class="text lower">{text}</p>`
    - the images, `<img loading="lazy" decoding="async" width height alt>`, with width and height read at build from the file via `sharp(...).metadata()` in the frontmatter, and an optional `<span class="k">caption</span>`;
    - when the note has an excerpt, the excerpt in a `<pre class="code">` with `overflow-x: auto` inside its own box (that box may scroll, the page never);
    - links as `<a class="hit">→ {label}</a>`.
  - Desktop layout: a grid of `220px minmax(0, 1fr)` (label | text + images). The images sit in a row that wraps, each `max-width: 360px`. On phones everything stacks and images are full width.

- [ ] **Step 5: Rewrite `src/pages/techniques.astro`.**
  - Frontmatter: collections, tokens by slug and `ROOMS` → `quarters` / `shares` / `tools` / `summary` / `techniqueNotes(cols)` / the excerpt.
  - Body, inside `<section class="page">`:
    - `<h2 class="k">techniques <span class="f">· one vote per collection, by quarter</span></h2>`
    - `<TechniqueChart …/>`
    - `<h2 class="k">methods</h2>`
    - `<TechniqueNotes …/>`
    - `<p class="k sum">{onChainPct}% on-chain · {fmt(oneOfOne)} 1/1 · {fmt(editionPieces)} edition pieces</p>`
  - With an empty catalog, the chart renders axes and no paths and the page does not throw.

- [ ] **Step 6: e2e** `tests/e2e/techniques.spec.ts` (import `checkPage` from `./helpers`):
  - `checkPage(page, '/techniques/')`.
  - 4 `path.ln`, whose `stroke-dasharray` values are all different (one may be empty, meaning solid).
  - 6 `.tool` labels.
  - 8 `article.note`.
  - `article.note[data-key="ai"]` has no `img` and no `a`.
  - Every `article.note img` has `naturalWidth > 0` after scrolling into view.
  - `.sum` matches `summary(collections())` from `src/lib/techniques` computed in the test.
  - At 360×800 there is no horizontal overflow.
  - On `/` the `generative` filter shows exactly `collections().filter(isGenerative)` rows, and the `on-chain` filter shows the `isOnChain` ones.

  Then delete the old `'techniques page draws the catalog'` test from `smoke.spec.ts`.

- [ ] **Step 7: Verify.**
  - `npx vitest run`, `npm run typecheck`, then `npm run build` and `npm run e2e`, if the controller says the port is free.
  - Take screenshots of `/techniques/` at 1440 and 390 width.
  - Check that the dashes look like four distinct styles, the columns of the strip line up under the chart's quarters, and nothing overflows.
- [ ] **Step 8: Commit.** Message: `feat: techniques page with one-vote technique lines, a tool strip and method notes`.

---

## Self-review (done while writing)

- **Spec coverage:**
  - decisions 1–3 → Task 2 and Task 4 Step 3
  - decision 4 → Task 1
  - decision 5 → Tasks 1, 2 and 4
  - decision 6 → Task 4 (the AI note)
  - decision 7 → Tasks 3 and 4
  - decision 8 → Task 2 `summary` and Task 4 Step 5
  - decision 9 → Global Constraints and the unit test for `—`

  The spec's testing section is covered by Task 1 Steps 1–2, Task 2 Step 1, Task 3 Step 1, and Task 4 Steps 1 and 6.
- **Order:** Task 1 → (controller: keyed inventory + data commit) → Task 2 → Task 4. Task 3 is independent and can run alongside Task 1 or 2.
