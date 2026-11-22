# Glyphoras on the archive (design)

Approved by the artist on 2026-11-22 (option B, "garden window").

## What Glyphoras is
1,111 playable glyph flowers by gruff, fully on chain on Ethereum: each work's tokenURI holds a still SVG (the grid
picture) and an HTML page (a WebGL engine that grows the flower from its seed, every flower its own instrument).
ERC721A, Core `0x3cc3e703da2c4b529c17efd1f1afd61dec0216af`, minted through an OpenSea drop on 18-19 Nov 2026 (free
community phase, then a fixed-price public sale), sold out. The holders' site is https://glyphoras.art (collection,
gardens at `/garden/<address or ENS>`, record page at `/record/<id>`). glyphoras.art sends no frame restrictions.

## What the archive shows
- **Index, catalog, activity, keepers, techniques:** Glyphoras joins like any collection (`GLY`, section index,
  techniques generative art + code art, tools on-chain + mathematics, metadata read from the chain).
- **Collection page** `/c/glyphoras/`: the usual header, wall text, `site ↗` link and figures, then a **garden
  window**: a poster (a still of the artist's garden) with `enter the garden ↗`; a click loads
  `https://glyphoras.art/garden/gruffdzn.eth` in place. Under it a field "address or ens" and `visit ↗` load that
  holder's garden in the same window. Invalid input gets an inline hint and loads nothing. 16:10 on desktop, 4:5 on
  phones. Then the 1,111 grid.
- **Work page** `/w/glyphoras/<id>/`: the on-chain still, and `play ▶` under it. A click reads the token's tokenURI
  from a public RPC in the visitor's browser and runs its HTML in a sandboxed iframe (`allow-scripts` only) in place of
  the still. Nothing of the live page is stored by the archive, so a renderer upgrade shows at once. If every RPC
  fails, the still stays and a short line says the chain could not be reached. The link row adds `its garden ↗`
  (glyphoras.art/garden/<current owner>) and `record ↗` (glyphoras.art/record/<id>).

## How (indexer and site)
- `config/collections.yaml` gets the GLY entry with three new optional, generic fields:
  - `liveWork: chain`: the indexer skips storing animations for the collection; the site plays the live work from the
    contract on demand.
  - `workLinks`: extra per-work links, URL templates with `{id}` and `{owner}` (a work with no single owner skips an
    `{owner}` link).
  - `garden`: `{ base, start, poster }` for the collection page window.
- The fields pass through `collections.json` to the site. New units: `src/lib/live-work.ts` (RPC body, ABI string
  decode, data URI decode; pure, unit tested), `src/lib/work-links.ts` (template fill), `src/lib/garden.ts` (input
  check, garden URL), components `LiveWork.astro` and `GardenWindow.astro` with small scripts.
- The garden iframe uses the existing third-party embed sandbox and `allow` list.
- Poster: a still of the artist's garden captured once, `public/c/glyphoras/garden.webp`.
- The data itself arrives with the next scheduled inventory run (the archive never commits `data/` or `public/media/`
  by hand).

## Out of scope
Garden links on /keepers, embedding glyphoras.art's collection or record pages, storing live HTML copies.

## Testing
Vitest for config, aggregation pass-through, live-work decoding, link templates and garden input; Playwright for the
garden window (poster, input check, iframe src) and the work page (play with a mocked RPC, failure line, links), on
phone and desktop widths, against a local inventory run.
