# Techniques page redesign (design)

Date: 2026-11-06. Agreed with the artist in chat. Replaces the current `/techniques` page (technique × year table, 1/1 ↔ editions meter, on-chain meter, keepers over time).

## Goal

One honest picture of how gruff's practice moved over time, in data. The page shows which techniques the artist leaned on in each quarter, which tools came with them, and a short note on each method with a real process image. The underlying idea: "sometimes one method, sometimes several together".

## Decisions (locked with the artist)

1. **One line chart.** There is a line per technique, told apart by line style only (solid, dotted, dashed, dash-dot). No colour, matching the site's rules.
2. **Measure: each collection gets one vote.** A token minted in quarter Q adds `1 / (dated tokens in its collection)` to Q. A technique's value in Q is the weight of the collections using it, divided by Q's total weight, as a percentage.
   - A collection with two techniques counts fully toward both lines, so the lines may sum to more than 100%.
   - A quarter with no mints has no value. The lines break there; they do not drop to 0.
   - Gruffters (673 tokens) and RESONANCE (1 token) each weigh 1, so volume never drowns the artist's leaning.
3. **Time axis: quarters.** It runs from the quarter of the first dated item to the quarter of the last, with rooms included.
4. **Four techniques** (the artist's words): `vector illustration`, `glitch art`, `generative art`, `code art`.
5. **Tool strip** under the chart, on the same x axis.
   - Rows: `photoshop`, `touchdesigner`, `mathematics`, `pixel grid`, `three.js`, `on-chain`.
   - A cell is filled when a collection minted that quarter, or a room dated that quarter, uses the tool.
   - Rooms count toward the strip only, never toward the technique lines, because rooms are unminted experiments.
6. **AI is never a tool row and is never tied to particular works.** It appears once, as the last note: a tool in the studio for maths, code and calculations, never the hand that makes the image.
7. **Notes under the strip, one per method.** Each note has a label, 1–3 lines of English copy, one visual (or none, for AI), and links to the works.
8. **Summary line at the bottom:** `N% on-chain · N 1/1 · N edition pieces`, computed from the catalog. The keepers-over-time chart leaves this page.
9. **Copy rules:** English, lowercase, quiet, ledger tone. `gruff` is always lowercase. No em dashes (a rule from the artist's earlier projects). The artist edits the drafts below in their own voice before release.

## Data model

`config/collections.yaml` splits today's single `techniques` list into two validated lists.

- `techniques`: one or more of `vector illustration | glitch art | generative art | code art`. Zod enum, at least 1 entry.
- `tools`: zero or more of `photoshop | touchdesigner | mathematics | pixel grid | three.js | on-chain`. Zod enum, optional, default `[]`.

The indexer copies both into `CollectionOut` (`techniques`, `tools`), so the site never reads the config. Rooms get an optional `tools` list in `src/lib/rooms.ts`.

| code | techniques | tools |
|---|---|---|
| ANT, BLS, PPC, VBS, GFT, CLB, ONE, ICN, SLV, ESS, LSO, RES, SOA | vector illustration | photoshop |
| GRT | generative art, vector illustration | (none) |
| PUL | vector illustration, glitch art | photoshop, touchdesigner |
| OVS, 366, SUB | glitch art | (none) |
| PHG | generative art, code art | mathematics, on-chain |
| FCT | generative art, code art | mathematics, pixel grid, on-chain |
| OVN | generative art, code art | on-chain |
| room `dive-bar` | (rooms carry no techniques) | three.js |

Other rooms carry no tools until the artist adds them.

**Consumers that read the old tags change with the split:**
- The index filters (`src/lib/collections.ts` `filterTags`): `generative` means `techniques` includes `generative art`; `on-chain` means `tools` includes `on-chain`.
- `src/lib/catalog.ts`: its generative check (the 5-per-collection wall and the pool) uses `generative art`.
- `src/lib/techniques.ts` `balance` / `onChainShare`: the same mapping.

The filter results must be unchanged: exactly the same collections count as generative and as on-chain as today.

## Components

- `src/lib/techniques.ts` (pure, unit-tested):
  - `quarterOf(iso) → '2025Q3'`
  - `quarterSpan(from, to) → string[]`
  - `techniqueShares(cols, tokensBySlug, quarters) → Record<Technique, (number | null)[]>`
  - `toolCells(cols, tokensBySlug, rooms, quarters) → Record<Tool, boolean[]>`
  - `summary(cols) → { onChainPct, oneOfOne, editionPieces }`
- `src/components/TechniqueChart.astro` draws one inline SVG, rendered at build time with no JS and no chart library. It holds:
  - the axis (0 / 50 / 100%);
  - quarter labels, every other one on phones;
  - the four line paths with `stroke-dasharray`;
  - the tool strip rows, sharing the chart's x scale so the columns line up.

  Ink is `var(--fg)`, gridlines `var(--line)`. The SVG has `role="img"` and an `aria-label`, followed by a visually hidden table of every quarter's values for screen readers. A legend above shows each line style as a small SVG swatch with its name.
- `src/components/TechniqueNotes.astro` renders the note ledger. Each note is a label in `.k` uppercase, the text, the visual (`<img>` lazy, or the code excerpt as text), and `→ collection` links. On desktop the text sits left and the visual right; on phones they stack.
- `src/pages/techniques.astro` composes the legend, chart, notes and summary line.

## Notes: copy drafts and visuals

Visuals live in `public/techniques/` as committed, site-owned static files, like `public/exp/`. They are WebP, at most 1200 px on the long side, with alt text. Sources:
- The artist's five images are kept in `.superpowers/techniques-src/` (git-ignored).
- Generated ones are made by a script in `scripts/` from data already in the repo.

1. **vector illustration** → gruffters plus the three earliest vector collections by first mint
   - Copy: "where it started. the early pieces are drawn point by point in vector, and all 673 gruffters traits were drawn by hand before any code mixed them."
   - Visual: the artist's two Illustrator photos (Gruffters), each cropped square.
2. **photoshop** → the early collections, pulverulents.
   - Copy: "almost every drawing passed through photoshop at the end. sometimes for a whole effect, sometimes only to lay grain over it."
   - Visual: a 1:1-pixel crop of an early work's large image where the grain shows. The implementer proposes two crops and the artist picks one.
3. **touchdesigner** → pulverulents.
   - Copy: "pulverulents was built in real time: camera feeds and vector forms pushed through touchdesigner networks, then shot and finished by hand."
   - Visuals: the TouchDesigner network screenshot, the night shoot photo, and the XCOPY message, captioned "a message from xcopy". The XCOPY image is a private DM the artist chose to publish.
4. **mathematics** → phigures, facets.
   - Copy: "phigures are solved, not drawn: every wallet seeds a figure whose proportions follow the golden ratio and a jointed anatomy. facets does its trigonometry in solidity, in fixed point, inside the contract."
   - Visual: a Phigures token at large size. A construction or skeleton view from the Phigures source is preferred if the repo has a debug mode. The implementer looks for it and falls back to the token image.
5. **pixel grid** → facets.
   - Copy: "facets lives on one 35 × 35 grid. same-colour cells merge row by row, which gives the tetris look and keeps the art small enough to live on-chain."
   - Visual: generated. A FACETS token scaled up with nearest-neighbour, with the 35 × 35 grid drawn over it in hairlines.
6. **three.js** → dive bar.
   - Copy: "for moving 3d: a ps1 shader for ovvn's x, a 3d tool for facets holders, and the dive bar."
   - Visual: a dive bar still from `public/exp/dive-bar/stills/`.
7. **on-chain** → phigures, facets, ovvn.
   - Copy: "phigures, facets and ovvn are drawn by their own contracts. no server, no ipfs: the code that makes the image lives on ethereum."
   - Visual: a short text excerpt, about 8 lines, of a FACETS token's on-chain SVG (row-scan `<rect>` runs), in mono, with the token linked.
8. **ai** → no links, no visual.
   - Copy: "and all the way through, ai: checking the maths, writing code, running the numbers. a tool in the studio, never the hand that makes the image."

## Layout and behaviour

- Order: legend, chart with the strip, notes, summary line. There is no interaction beyond links. The chart is static.
- Phone (360–767 px):
  - The chart scales to the column width.
  - Quarter labels show every other quarter.
  - Strip labels sit in a 96 px left column.
  - The legend wraps.
  - There is no horizontal scroll at 360 px.
- Images use `loading="lazy"` and `decoding="async"`, with explicit width and height so nothing shifts.
- Empty data (a fresh catalog) renders the axis and notes without lines, with no errors.

## Testing

- **Unit:**
  - `quarterOf` and `quarterSpan`.
  - `techniqueShares`:
    - one-vote weighting, with a 1-token collection weighing the same as a 673-token one;
    - multi-technique collections counting on both lines;
    - empty quarters giving `null`.
  - `toolCells`, with rooms counted.
  - `summary`.
  - Config validation: an unknown technique or tool fails, and the real config passes.
  - `filterTags` gives the same results as before the split.
- **e2e:**
  - `/techniques/` shows four line paths with four distinct dash patterns, six strip rows and eight notes.
  - The AI note has no image and no links.
  - Every note image loads.
  - The summary line matches the catalog.
  - No horizontal scroll at 360 px.
  - The index filters for generative and on-chain still return the same rows.

## Out of scope

- Per-work technique tags.
- Interactive tooltips.
- Tool rows for rooms other than the dive bar, which the artist can add later.
- A Turkish version of the page.
