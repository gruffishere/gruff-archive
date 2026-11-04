# gruff archive — Indexer Implementation Plan (plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Node/TypeScript indexer that reads gruff's collections from Ethereum (Blockscout) and OpenSea, and writes the JSON catalog plus cached, resized media that the site (plan 2) will render.

**Architecture:** Pure, unit-tested modules (config, ledger, mint prices, OpenSea normalizers, media, aggregations) wired together by one per-collection pipeline and a CLI (`npm run index`). Raw chain history is stored incrementally under `data/raw/` so every run only fetches what is new; derived outputs go to `data/catalog/`, media to `public/media/`. A GitHub Actions cron runs it every 6 hours and commits the result.

**Tech Stack:** Node ≥ 22 (ESM), TypeScript (strict), tsx, Vitest, zod, yaml, sharp.

**Spec:** `docs/superpowers/specs/2026-11-04-gruff-portfolio-design.md`

**The other plans (written after this one ships):** 2 — site (Astro pages, live listing function, deploy), 3 — visitors' book + verified + back room (Cloudflare Worker), 4 — experiments.

## Global Constraints

- Zero recurring cost: only free endpoints — Blockscout (`https://eth.blockscout.com/api/v2`, no key), OpenSea API v2 (free key, env `OPENSEA_API_KEY`), CoinGecko simple price (no key).
- The indexer MUST run without `OPENSEA_API_KEY`: OpenSea-derived fields then come from the last cached values (or stay `null`), and `meta.json` reports `opensea: "skipped"`.
- Artist wallet: `0x4730497622bdfd6eafe1f09fa22b3a0aca94a646` (gruffdzn.eth). All addresses are stored lowercase.
- Never counted as keepers/holders: `0x0000000000000000000000000000000000000000`, `0x000000000000000000000000000000000000dead`, Foundation market escrow `0xcda72070e455bb31c7690a170224ce43623d0b6f`, and the artist wallet.
- Accession number format: `GRF.<YY>.<CODE>.<token>`; token zero-padded to `max(3, digits of the largest token id)`; collections with exactly one configured token id get no token suffix (e.g. `GRF.25.366`).
- Paths: config `config/collections.yaml`; raw caches `data/raw/`; outputs `data/catalog/`; media `public/media/` served as `/media/...`.
- Media: static images → `<hash>-t.webp` (fit inside 480) and `<hash>-l.webp` (fit inside 1600); animated images (GIF / animated WebP / APNG) → static first-frame `<hash>-t.webp` thumb + the original file copied byte-for-byte as `<hash>.<ext>` for the large view, or, if the original exceeds 24 MiB, no local large and `remote: <source url>` (user decision 2026-11-04); SVG/HTML stored as-is; video stored only if ≤ 25 MB.
- Secrets never enter git. `back-room/` and `.superpowers/` are git-ignored.
- Base chain and other wallets are out of scope.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, .gitignore
config/collections.yaml              the only hand-edited data file
indexer/
  types.ts                           shared types
  config.ts                          load + validate collections.yaml
  accession.ts                       accession numbers
  http.ts                            fetchJson with rate limit + retry
  blockscout.ts                      Blockscout URLs, pagination, mappers
  sync-transfers.ts                  incremental transfer history
  ledger.ts                          balances, chain events, ENS map
  mint-prices.ts                     mint date + paid price per token
  opensea.ts                         OpenSea client + normalizers
  merge-events.ts                    chain + OpenSea event merge
  media.ts                           download, sniff, resize, cache, gc
  store.ts                           JSON read / atomic write
  prices.ts                          ETH/USD
  validate.ts                        snapshot validation
  aggregate/exclusions.ts            who counts as a keeper
  aggregate/tokens.ts                per-token output
  aggregate/collections.ts           per-collection output
  aggregate/activity.ts              global activity rows + month shards
  aggregate/keepers.ts               keepers ranking
  aggregate/timeline.ts              monthly archive summaries
  pipeline/collection.ts             fetch + assemble one collection
  run.ts                             CLI entry
tests/indexer/...                    one test file per module
.github/workflows/inventory.yml      6-hour cron
```

---

### Task 1: Repository scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

**Interfaces:**
- Produces: `npm test` (Vitest), `npm run typecheck` (tsc), `npm run index` (tsx indexer/run.ts — file arrives in Task 11).

- [ ] **Step 1: Initialise git and npm**

The working directory already contains `docs/` and `.superpowers/`. Run:

```bash
git init -b main
npm init -y
npm pkg set name=gruff-archive private=true type=module engines.node=">=22"
npm pkg set scripts.test="vitest run" scripts.typecheck="tsc --noEmit" scripts.index="tsx indexer/run.ts"
npm pkg delete main scripts.start
npm install -D typescript tsx vitest @types/node
```

- [ ] **Step 2: Write `tsconfig.json`**

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
    "types": ["node"]
  },
  "include": ["indexer", "tests"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
.env
.env.*
.superpowers/
back-room/
.wrangler/
tmp/
*.tmp
```

- [ ] **Step 5: Verify tooling runs**

Run: `npm test`
Expected: Vitest prints `No test files found` and exits 0.

Run: `npm run typecheck`
Expected: exits 0 (no inputs yet is fine; if tsc complains "No inputs were found", create an empty `indexer/.keep.ts` containing `export {};` and re-run).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore docs
git commit -m "chore: scaffold gruff archive repo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Types, collection config and accession numbers

**Files:**
- Create: `indexer/types.ts`, `indexer/config.ts`, `indexer/accession.ts`, `config/collections.yaml`
- Test: `tests/indexer/config.test.ts`, `tests/indexer/accession.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Address`, `Standard`, `Platform`, `Section`, `CollectionConfig`, `RawTransfer`, `EventKind`, `ArchiveEvent`, `TokenMeta`, `MintInfo`, `Listing` (exact shapes below — every later task imports these).
  - `config.ts`: `interface ArchiveConfig { artist: string; collections: CollectionConfig[] }`, `parseConfig(text: string): ArchiveConfig`, `loadConfig(path?: string): ArchiveConfig`.
  - `accession.ts`: `accession(code: string, year: number, tokenId?: string, maxTokenId?: string): string`.

- [ ] **Step 1: Install runtime deps**

```bash
npm install zod yaml
```

- [ ] **Step 2: Write `indexer/types.ts`**

```ts
export type Address = string; // always lowercase, 0x-prefixed

export type Standard = 'erc721' | 'erc1155';
export type Platform = 'manifold' | 'foundation' | 'transient' | '6529' | 'onchain' | 'custom';
export type Section = 'index' | 'experiments';

export interface CollectionConfig {
  code: string;
  slug: string;
  title: string;
  contract: Address;
  standard: Standard;
  platform: Platform;
  platformUrl?: string;
  section: Section;
  tokenIds?: string[];
  techniques: string[];
  tokenTechniques?: Record<string, string[]>;
  wallText?: string;
}

export interface RawTransfer {
  contract: Address;
  tokenId: string;
  from: Address;
  to: Address;
  fromEns: string | null;
  toEns: string | null;
  value: string; // integer string, '1' for ERC-721
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: string; // ISO 8601, normalised with Date#toISOString
}

export type EventKind = 'mint' | 'transfer' | 'burn' | 'sale' | 'listed';

export interface ArchiveEvent {
  id: string;
  kind: EventKind;
  contract: Address;
  tokenId: string;
  quantity: number;
  from: Address | null;
  to: Address | null;
  priceWei: string | null;
  txHash: string | null;
  timestamp: string;
}

export interface TokenMeta {
  tokenId: string;
  name: string | null;
  description: string | null;
  image: string | null;
  animation: string | null;
}

export interface MintInfo {
  at: string;
  txHash: string;
  priceWei: string | null; // per unit; null when nothing was paid
  primary: boolean; // true when priceWei was filled from the artist's first sale
}

export interface Listing {
  tokenId: string;
  priceWei: string; // per unit
  maker: Address;
  at: string;
}
```

- [ ] **Step 3: Write the failing tests**

`tests/indexer/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig, parseConfig } from '../../indexer/config';

const yaml = `
artist: "0x4730497622bDFd6EAFe1F09Fa22B3A0ACA94a646"
collections:
  - code: SLV
    slug: silver-surfer
    title: SILVER SURFER
    contract: "0x3BE88ADF4D68C32BAD5707588C7D25E1AF8644E0"
    standard: erc721
    platform: manifold
    section: index
    techniques: [illustration]
`;

describe('parseConfig', () => {
  it('lowercases addresses', () => {
    const c = parseConfig(yaml);
    expect(c.artist).toBe('0x4730497622bdfd6eafe1f09fa22b3a0aca94a646');
    expect(c.collections[0].contract).toBe('0x3be88adf4d68c32bad5707588c7d25e1af8644e0');
  });

  it('rejects duplicate codes', () => {
    const duplicated = yaml + yaml.split('collections:\n')[1];
    expect(() => parseConfig(duplicated)).toThrow(/duplicate code:SLV/);
  });

  it('coerces numeric token ids to strings', () => {
    const c = parseConfig(yaml.replace('techniques: [illustration]', 'techniques: [illustration]\n    tokenIds: [366]'));
    expect(c.collections[0].tokenIds).toEqual(['366']);
  });

  it('rejects a bad code', () => {
    expect(() => parseConfig(yaml.replace('code: SLV', 'code: slv'))).toThrow();
  });
});

describe('loadConfig (real file)', () => {
  it('has 16 index collections and OVVN in experiments', () => {
    const c = loadConfig();
    expect(c.collections.filter((x) => x.section === 'index')).toHaveLength(16);
    expect(c.collections.find((x) => x.code === 'OVN')?.section).toBe('experiments');
    expect(c.collections.find((x) => x.code === '366')?.tokenIds).toEqual(['366']);
  });
});
```

`tests/indexer/accession.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { accession } from '../../indexer/accession';

describe('accession', () => {
  it('formats a collection-level number', () => {
    expect(accession('SLV', 2023)).toBe('GRF.23.SLV');
  });
  it('pads token ids to at least 3 digits', () => {
    expect(accession('SLV', 2023, '2', '3')).toBe('GRF.23.SLV.002');
  });
  it('pads to the width of the largest id', () => {
    expect(accession('FCT', 2026, '7', '2222')).toBe('GRF.26.FCT.0007');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../../indexer/config` and `../../indexer/accession`.

- [ ] **Step 5: Write `indexer/accession.ts`**

```ts
export function accession(code: string, year: number, tokenId?: string, maxTokenId?: string): string {
  const yy = String(year % 100).padStart(2, '0');
  const base = `GRF.${yy}.${code}`;
  if (tokenId === undefined) return base;
  const width = Math.max(3, (maxTokenId ?? tokenId).length);
  return `${base}.${tokenId.padStart(width, '0')}`;
}
```

- [ ] **Step 6: Write `indexer/config.ts`**

```ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { CollectionConfig } from './types';

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((s) => s.toLowerCase());

const collectionSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{3}$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  contract: address,
  standard: z.enum(['erc721', 'erc1155']),
  platform: z.enum(['manifold', 'foundation', 'transient', '6529', 'onchain', 'custom']),
  platformUrl: z.string().url().optional(),
  section: z.enum(['index', 'experiments']),
  tokenIds: z.array(z.coerce.string()).optional(),
  techniques: z.array(z.string()).min(1),
  tokenTechniques: z.record(z.string(), z.array(z.string())).optional(),
  wallText: z.string().optional(),
});

const fileSchema = z.object({
  artist: address,
  collections: z.array(collectionSchema).min(1),
});

export interface ArchiveConfig {
  artist: string;
  collections: CollectionConfig[];
}

export function parseConfig(text: string): ArchiveConfig {
  const data = fileSchema.parse(parse(text));
  const seen = new Set<string>();
  for (const c of data.collections) {
    for (const key of [`code:${c.code}`, `slug:${c.slug}`]) {
      if (seen.has(key)) throw new Error(`duplicate ${key}`);
      seen.add(key);
    }
  }
  return data;
}

export function loadConfig(path = 'config/collections.yaml'): ArchiveConfig {
  return parseConfig(readFileSync(path, 'utf8'));
}
```

- [ ] **Step 7: Write `config/collections.yaml`**

```yaml
# The only hand-edited data file. Codes are permanent once published.
artist: "0x4730497622bdfd6eafe1f09fa22b3a0aca94a646"
collections:
  - { code: ANT, slug: antique, title: "Antique by Gruff", contract: "0x8c94b846bb90f4a1c1c77b6baca2be7be1507dab", standard: erc1155, platform: manifold, section: index, techniques: [illustration] }
  - { code: BLS, slug: blast, title: "BLAST", contract: "0xbd2d5d9fbb00aabb8a2b7a4951cbdfeb459265b4", standard: erc1155, platform: manifold, section: index, techniques: [illustration] }
  - { code: PPC, slug: pepe-club, title: "Pepe Club", contract: "0x6f348237a913e75557b6c1dd2c024c2580975636", standard: erc1155, platform: manifold, section: index, techniques: [illustration] }
  - { code: VBS, slug: vibes-and-times, title: "Vibes & Times", contract: "0x0e64f1665b86bf3579148321d31cd7fde44cbc0d", standard: erc1155, platform: manifold, section: index, techniques: [illustration] }
  - { code: GFT, slug: gift-editions, title: "Gift Editions by Gruff", contract: "0x8ee9ffa0cf643f5bfc4b0046c12cb5036d8f802f", standard: erc1155, platform: manifold, section: index, techniques: [illustration] }
  - { code: CLB, slug: collabs, title: "Gruff's Collabs", contract: "0x258f44d4ebe9f74481eedb6177b1d53f97128e1c", standard: erc1155, platform: manifold, section: index, techniques: [illustration] }
  - { code: ONE, slug: one-of-ones, title: "1/1's by Gruff", contract: "0xda6388ca494c1f9920b679ee79d78548907e7ed2", standard: erc721, platform: foundation, section: index, techniques: [illustration] }
  - { code: ICN, slug: icons, title: "ICON's by Gruff", contract: "0x4b5599f580dc09db8ac3c7cbe650137d871d3ae1", standard: erc721, platform: foundation, section: index, techniques: [illustration] }
  - { code: SLV, slug: silver-surfer, title: "SILVER SURFER", contract: "0x3be88adf4d68c32bad5707588c7d25e1af8644e0", standard: erc721, platform: manifold, section: index, techniques: [illustration] }
  - { code: ESS, slug: essence, title: "ESSENCE", contract: "0xf808228c5dd6e5b0a8f80c55c83c54f5520d15d5", standard: erc721, platform: manifold, section: index, techniques: [illustration] }
  - { code: GRT, slug: gruffters, title: "Gruffters", contract: "0x72b1f41c1afc5cc7e68071753967902138b51bb2", standard: erc721, platform: custom, section: index, techniques: [generative] }
  - { code: OVS, slug: oversimulated, title: "oversimulated", contract: "0x685ec110408cede874604f75ff9ccbd297ccde21", standard: erc721, platform: transient, section: index, techniques: [photo, glitch] }
  - { code: "366", slug: worthless, title: "WORTHLESS", contract: "0x33fd426905f149f8376e227d0c9d3340aad17af1", standard: erc1155, platform: "6529", section: index, tokenIds: [366], techniques: [photo, glitch] }
  - { code: SUB, slug: subsimulated, title: "subsimulated", contract: "0x5b5a4bcaedf305a6c85f83486a907a188224efa8", standard: erc1155, platform: transient, section: index, techniques: [photo, glitch] }
  - { code: PHG, slug: phigures, title: "Phigures", contract: "0xcbbca0a0871a4f2a5567940c38a5c7fd6fbb6480", standard: erc721, platform: onchain, section: index, techniques: [generative, on-chain] }
  - { code: FCT, slug: facets, title: "FACETS", contract: "0xa219558e037063879315d6c0dc37aa29e1ed9f07", standard: erc721, platform: onchain, section: index, techniques: [generative, on-chain, pixel] }
  - { code: OVN, slug: ovvn, title: "OVVN", contract: "0x11dd77cfda1ffa289522f028977fbfc0fc0fce67", standard: erc721, platform: onchain, section: experiments, techniques: [generative, on-chain] }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (8 tests).

- [ ] **Step 9: Commit**

```bash
git add indexer/types.ts indexer/config.ts indexer/accession.ts config/collections.yaml tests/indexer package.json package-lock.json
git commit -m "feat(indexer): collection config, shared types, accession numbers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: HTTP client and Blockscout mappers

**Files:**
- Create: `indexer/http.ts`, `indexer/blockscout.ts`
- Test: `tests/indexer/http.test.ts`, `tests/indexer/blockscout.test.ts`

**Interfaces:**
- Consumes: `RawTransfer`, `TokenMeta`, `Address` from `types.ts`.
- Produces:
  - `http.ts`: `type FetchJson = <T = unknown>(url: string, init?: { headers?: Record<string, string> }) => Promise<T>`; `class HttpError extends Error { status: number }`; `createFetchJson(opts?: { retries?: number; minIntervalMs?: number; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>; sleepImpl?: (ms: number) => Promise<void> }): FetchJson`.
  - `blockscout.ts`: `interface BsAddress`, `interface BsTransfer`, `interface BsInstance`; `paginate<T>(fetchJson, url): AsyncGenerator<T>`; `transfersUrl(contract, tokenId?)`; `instancesUrl(contract)`; `instanceUrl(contract, tokenId)`; `toRawTransfer(contract, t: BsTransfer): RawTransfer | null`; `toTokenMeta(i: BsInstance): TokenMeta`; `txValueWei(fetchJson, txHash): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

`tests/indexer/http.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createFetchJson, HttpError } from '../../indexer/http';

const noSleep = async () => {};

describe('createFetchJson', () => {
  it('retries a 500 and then returns json', async () => {
    const responses = [new Response('boom', { status: 500 }), new Response(JSON.stringify({ ok: 1 }), { status: 200 })];
    let calls = 0;
    const fetchJson = createFetchJson({ fetchImpl: async () => responses[calls++], sleepImpl: noSleep, minIntervalMs: 0 });
    await expect(fetchJson('https://x.test/a')).resolves.toEqual({ ok: 1 });
    expect(calls).toBe(2);
  });

  it('throws HttpError on 404 without retrying', async () => {
    let calls = 0;
    const fetchJson = createFetchJson({
      fetchImpl: async () => {
        calls++;
        return new Response('nope', { status: 404 });
      },
      sleepImpl: noSleep,
      minIntervalMs: 0,
    });
    await expect(fetchJson('https://x.test/b')).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(1);
  });

  it('sends custom headers', async () => {
    let seen: Record<string, string> = {};
    const fetchJson = createFetchJson({
      fetchImpl: async (_url, init) => {
        seen = init?.headers as Record<string, string>;
        return new Response('{}', { status: 200 });
      },
      sleepImpl: noSleep,
      minIntervalMs: 0,
    });
    await fetchJson('https://x.test/c', { headers: { 'x-api-key': 'k' } });
    expect(seen['x-api-key']).toBe('k');
  });
});
```

`tests/indexer/blockscout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { paginate, toRawTransfer, toTokenMeta, transfersUrl, type BsTransfer } from '../../indexer/blockscout';
import type { FetchJson } from '../../indexer/http';

describe('paginate', () => {
  it('follows next_page_params until null', async () => {
    const pages: Record<string, unknown> = {
      'https://eth.blockscout.com/api/v2/tokens/0xabc/transfers': { items: [1, 2], next_page_params: { block_number: 10, index: 5 } },
      'https://eth.blockscout.com/api/v2/tokens/0xabc/transfers?block_number=10&index=5': { items: [3], next_page_params: null },
    };
    const fetchJson = (async (url: string) => pages[url]) as unknown as FetchJson;
    const out: number[] = [];
    for await (const x of paginate<number>(fetchJson, transfersUrl('0xabc'))) out.push(x);
    expect(out).toEqual([1, 2, 3]);
  });
});

describe('toRawTransfer', () => {
  const sample: BsTransfer = {
    block_number: 18471925,
    from: { hash: '0xB893AE8A1824604F6df4Dfde52E2754921ba1A73', ens_domain_name: 'bitmancrypto.eth' },
    to: { hash: '0xcDA72070E455bb31C7690a170224Ce43623d0B6f', ens_domain_name: null },
    log_index: 58,
    timestamp: '2023-10-31T18:33:47.000000Z',
    total: { token_id: '2' },
    transaction_hash: '0x09470E56A8CB9C79646194B3C989916C1AEEE4442B3DA7865A7823B195E27A25',
    type: 'token_transfer',
  };

  it('maps and lowercases an ERC-721 transfer', () => {
    expect(toRawTransfer('0x3be88adf4d68c32bad5707588c7d25e1af8644e0', sample)).toEqual({
      contract: '0x3be88adf4d68c32bad5707588c7d25e1af8644e0',
      tokenId: '2',
      from: '0xb893ae8a1824604f6df4dfde52e2754921ba1a73',
      to: '0xcda72070e455bb31c7690a170224ce43623d0b6f',
      fromEns: 'bitmancrypto.eth',
      toEns: null,
      value: '1',
      txHash: '0x09470e56a8cb9c79646194b3c989916c1aeee4442b3da7865a7823b195e27a25',
      logIndex: 58,
      blockNumber: 18471925,
      timestamp: '2023-10-31T18:33:47.000Z',
    });
  });

  it('keeps the ERC-1155 value', () => {
    expect(toRawTransfer('0xc', { ...sample, total: { token_id: '3', value: '5' } })?.value).toBe('5');
  });

  it('returns null when there is no token id', () => {
    expect(toRawTransfer('0xc', { ...sample, total: null })).toBeNull();
  });
});

describe('toTokenMeta', () => {
  it('prefers the original metadata image', () => {
    expect(
      toTokenMeta({
        id: '2',
        image_url: 'https://blockscout-cache.test/2.png',
        animation_url: null,
        metadata: { name: "'Spacewalker'", description: 'It has all begun.', image: 'https://arweave.net/Z1_K' },
      }),
    ).toEqual({ tokenId: '2', name: "'Spacewalker'", description: 'It has all begun.', image: 'https://arweave.net/Z1_K', animation: null });
  });

  it('falls back to blockscout urls when metadata is missing', () => {
    expect(toTokenMeta({ id: '9', image_url: 'https://b/9.png', animation_url: 'https://b/9.html', metadata: null })).toEqual({
      tokenId: '9',
      name: null,
      description: null,
      image: 'https://b/9.png',
      animation: 'https://b/9.html',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/indexer/http.test.ts tests/indexer/blockscout.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `indexer/http.ts`**

```ts
export type FetchJson = <T = unknown>(url: string, init?: { headers?: Record<string, string> }) => Promise<T>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFetchJson(
  opts: {
    retries?: number;
    minIntervalMs?: number;
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
    sleepImpl?: (ms: number) => Promise<void>;
  } = {},
): FetchJson {
  const retries = opts.retries ?? 4;
  const minInterval = opts.minIntervalMs ?? 250;
  const doFetch = opts.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const sleep = opts.sleepImpl ?? realSleep;
  let lastRequest = 0;

  return async <T>(url: string, init?: { headers?: Record<string, string> }): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const gap = lastRequest + minInterval - Date.now();
      if (gap > 0) await sleep(gap);
      lastRequest = Date.now();

      let res: Response;
      try {
        res = await doFetch(url, { headers: { accept: 'application/json', ...init?.headers } });
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new HttpError(res.status, url);
    }
  };
}
```

- [ ] **Step 4: Write `indexer/blockscout.ts`**

```ts
import type { FetchJson } from './http';
import type { Address, RawTransfer, TokenMeta } from './types';

const BASE = 'https://eth.blockscout.com/api/v2';

export interface BsAddress {
  hash: string;
  ens_domain_name: string | null;
}

export interface BsTransfer {
  from: BsAddress;
  to: BsAddress;
  log_index: number;
  block_number: number;
  timestamp: string;
  transaction_hash: string;
  total: { token_id: string; value?: string } | null;
  type: string;
}

export interface BsInstance {
  id: string;
  image_url: string | null;
  animation_url: string | null;
  metadata: Record<string, unknown> | null;
}

interface Page<T> {
  items: T[];
  next_page_params: Record<string, string | number> | null;
}

function withParams(url: string, params: Record<string, string | number> | null): string {
  if (!params) return url;
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

export async function* paginate<T>(fetchJson: FetchJson, url: string): AsyncGenerator<T> {
  let params: Record<string, string | number> | null = null;
  do {
    const page: Page<T> = await fetchJson<Page<T>>(withParams(url, params));
    for (const item of page.items) yield item;
    params = page.next_page_params;
  } while (params);
}

export const transfersUrl = (contract: Address, tokenId?: string) =>
  tokenId === undefined ? `${BASE}/tokens/${contract}/transfers` : `${BASE}/tokens/${contract}/instances/${tokenId}/transfers`;
export const instancesUrl = (contract: Address) => `${BASE}/tokens/${contract}/instances`;
export const instanceUrl = (contract: Address, tokenId: string) => `${BASE}/tokens/${contract}/instances/${tokenId}`;

export function toRawTransfer(contract: Address, t: BsTransfer): RawTransfer | null {
  if (!t.total?.token_id) return null;
  return {
    contract,
    tokenId: t.total.token_id,
    from: t.from.hash.toLowerCase(),
    to: t.to.hash.toLowerCase(),
    fromEns: t.from.ens_domain_name ?? null,
    toEns: t.to.ens_domain_name ?? null,
    value: t.total.value ?? '1',
    txHash: t.transaction_hash.toLowerCase(),
    logIndex: t.log_index,
    blockNumber: t.block_number,
    timestamp: new Date(t.timestamp).toISOString(),
  };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function toTokenMeta(i: BsInstance): TokenMeta {
  const m = i.metadata ?? {};
  return {
    tokenId: String(i.id),
    name: str(m.name),
    description: str(m.description),
    image: str(m.image) ?? str(m.image_url) ?? i.image_url,
    animation: str(m.animation_url) ?? i.animation_url,
  };
}

export async function txValueWei(fetchJson: FetchJson, txHash: string): Promise<string> {
  const tx = await fetchJson<{ value?: string | null }>(`${BASE}/transactions/${txHash}`);
  return tx.value ?? '0';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/indexer/http.test.ts tests/indexer/blockscout.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add indexer/http.ts indexer/blockscout.ts tests/indexer/http.test.ts tests/indexer/blockscout.test.ts
git commit -m "feat(indexer): rate-limited fetch and Blockscout mappers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Incremental transfer sync

**Files:**
- Create: `indexer/sync-transfers.ts`
- Test: `tests/indexer/sync-transfers.test.ts`

**Interfaces:**
- Consumes: `RawTransfer`.
- Produces: `transferKey(t: RawTransfer): string`; `compareChrono(a, b): number` (ascending by block, then log index); `syncTransfers(existing: RawTransfer[], newestFirst: AsyncIterable<RawTransfer>, stopAfterKnown?: number): Promise<{ transfers: RawTransfer[]; added: number }>` — result is sorted ascending.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { syncTransfers } from '../../indexer/sync-transfers';
import type { RawTransfer } from '../../indexer/types';

const t = (block: number, log = 0, tokenId = '1'): RawTransfer => ({
  contract: '0xc',
  tokenId,
  from: '0x0000000000000000000000000000000000000000',
  to: '0xa',
  fromEns: null,
  toEns: null,
  value: '1',
  txHash: `0x${block}`,
  logIndex: log,
  blockNumber: block,
  timestamp: new Date(Date.UTC(2024, 0, block)).toISOString(),
});

async function* from(items: RawTransfer[], counter?: { n: number }) {
  for (const i of items) {
    if (counter) counter.n++;
    yield i;
  }
}

describe('syncTransfers', () => {
  it('does a full sync from empty and sorts ascending', async () => {
    const r = await syncTransfers([], from([t(3), t(2), t(1)]));
    expect(r.transfers.map((x) => x.blockNumber)).toEqual([1, 2, 3]);
    expect(r.added).toBe(3);
  });

  it('adds only new transfers and stops after enough known ones', async () => {
    const existing = Array.from({ length: 60 }, (_, i) => t(i + 1));
    const counter = { n: 0 };
    const r = await syncTransfers(existing, from([t(62), t(61), ...[...existing].reverse()], counter), 50);
    expect(r.added).toBe(2);
    expect(r.transfers).toHaveLength(62);
    expect(counter.n).toBe(52);
  });

  it('treats the same tx + log + token as one transfer', async () => {
    const r = await syncTransfers([t(5, 1)], from([t(5, 1), t(5, 2)]));
    expect(r.added).toBe(1);
    expect(r.transfers.map((x) => x.logIndex)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/indexer/sync-transfers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `indexer/sync-transfers.ts`**

```ts
import type { RawTransfer } from './types';

export const transferKey = (t: RawTransfer) => `${t.txHash}:${t.logIndex}:${t.tokenId}`;

export const compareChrono = (a: RawTransfer, b: RawTransfer) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

/**
 * Blockscout returns transfers newest first. We pull until we have seen
 * `stopAfterKnown` consecutive transfers that are already stored.
 */
export async function syncTransfers(
  existing: RawTransfer[],
  newestFirst: AsyncIterable<RawTransfer>,
  stopAfterKnown = 50,
): Promise<{ transfers: RawTransfer[]; added: number }> {
  const known = new Set(existing.map(transferKey));
  const fresh: RawTransfer[] = [];
  let knownInARow = 0;
  for await (const t of newestFirst) {
    const key = transferKey(t);
    if (known.has(key)) {
      if (++knownInARow >= stopAfterKnown) break;
      continue;
    }
    knownInARow = 0;
    known.add(key);
    fresh.push(t);
  }
  return { transfers: [...existing, ...fresh].sort(compareChrono), added: fresh.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/indexer/sync-transfers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add indexer/sync-transfers.ts tests/indexer/sync-transfers.test.ts
git commit -m "feat(indexer): incremental transfer history sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ledger — balances, chain events, ENS map

**Files:**
- Create: `indexer/ledger.ts`
- Test: `tests/indexer/ledger.test.ts`

**Interfaces:**
- Consumes: `RawTransfer`, `ArchiveEvent`, `Address`.
- Produces: `ZERO`, `DEAD` constants; `type Balances = Map<string /* tokenId */, Map<Address, bigint>>`; `buildBalances(transfers: RawTransfer[] /* ascending */, until?: string /* ISO */): Balances`; `chainEvents(transfers: RawTransfer[]): ArchiveEvent[]` (mints in the same tx for the same token + recipient merged, quantity summed; burns have `to: null`); `ensMap(transfers: RawTransfer[]): Map<Address, string>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildBalances, chainEvents, DEAD, ensMap, ZERO } from '../../indexer/ledger';
import type { RawTransfer } from '../../indexer/types';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';

const tr = (p: Partial<RawTransfer>): RawTransfer => ({
  contract: '0xc',
  tokenId: '1',
  from: ZERO,
  to: A,
  fromEns: null,
  toEns: null,
  value: '1',
  txHash: '0x1',
  logIndex: 0,
  blockNumber: 1,
  timestamp: '2024-01-01T00:00:00.000Z',
  ...p,
});

const history: RawTransfer[] = [
  tr({ value: '5', txHash: '0x1', logIndex: 0, blockNumber: 1, timestamp: '2024-01-01T00:00:00.000Z' }),
  tr({ value: '2', txHash: '0x1', logIndex: 1, blockNumber: 1, timestamp: '2024-01-01T00:00:00.000Z' }),
  tr({ from: A, to: B, value: '3', txHash: '0x2', blockNumber: 2, timestamp: '2024-02-01T00:00:00.000Z', toEns: 'bee.eth' }),
  tr({ from: B, to: DEAD, value: '1', txHash: '0x3', blockNumber: 3, timestamp: '2024-03-01T00:00:00.000Z' }),
];

describe('buildBalances', () => {
  it('tracks mints, transfers and burns', () => {
    const b = buildBalances(history).get('1')!;
    expect(b.get(A)).toBe(4n);
    expect(b.get(B)).toBe(2n);
    expect(b.has(DEAD)).toBe(false);
  });

  it('can stop at a date', () => {
    const b = buildBalances(history, '2024-01-31T23:59:59.999Z').get('1')!;
    expect([...b.entries()]).toEqual([[A, 7n]]);
  });

  it('drops holders whose balance reaches zero', () => {
    const b = buildBalances([tr({}), tr({ from: A, to: B, txHash: '0x9', blockNumber: 9 })]).get('1')!;
    expect(b.has(A)).toBe(false);
    expect(b.get(B)).toBe(1n);
  });
});

describe('chainEvents', () => {
  it('merges mints in one tx and classifies burns', () => {
    const e = chainEvents(history);
    expect(e.map((x) => [x.kind, x.quantity, x.from, x.to])).toEqual([
      ['mint', 7, null, A],
      ['transfer', 3, A, B],
      ['burn', 1, B, null],
    ]);
  });
});

describe('ensMap', () => {
  it('collects ens names', () => {
    expect(ensMap(history).get(B)).toBe('bee.eth');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/indexer/ledger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `indexer/ledger.ts`**

```ts
import type { Address, ArchiveEvent, RawTransfer } from './types';

export const ZERO = '0x0000000000000000000000000000000000000000';
export const DEAD = '0x000000000000000000000000000000000000dead';

export type Balances = Map<string, Map<Address, bigint>>;

const isBurnTarget = (a: Address) => a === ZERO || a === DEAD;

export function buildBalances(transfers: RawTransfer[], until?: string): Balances {
  const balances: Balances = new Map();
  for (const t of transfers) {
    if (until && t.timestamp > until) break;
    const v = BigInt(t.value);
    let holders = balances.get(t.tokenId);
    if (!holders) balances.set(t.tokenId, (holders = new Map()));
    if (t.from !== ZERO) {
      const left = (holders.get(t.from) ?? 0n) - v;
      if (left > 0n) holders.set(t.from, left);
      else holders.delete(t.from);
    }
    if (!isBurnTarget(t.to)) holders.set(t.to, (holders.get(t.to) ?? 0n) + v);
  }
  return balances;
}

export function chainEvents(transfers: RawTransfer[]): ArchiveEvent[] {
  const out = new Map<string, ArchiveEvent>();
  for (const t of transfers) {
    const qty = Number(t.value);
    if (t.from === ZERO) {
      const id = `${t.txHash}:${t.tokenId}:${t.to}:mint`;
      const prev = out.get(id);
      if (prev) {
        prev.quantity += qty;
        continue;
      }
      out.set(id, { id, kind: 'mint', contract: t.contract, tokenId: t.tokenId, quantity: qty, from: null, to: t.to, priceWei: null, txHash: t.txHash, timestamp: t.timestamp });
      continue;
    }
    const burn = isBurnTarget(t.to);
    const id = `${t.txHash}:${t.logIndex}:${t.tokenId}`;
    out.set(id, {
      id,
      kind: burn ? 'burn' : 'transfer',
      contract: t.contract,
      tokenId: t.tokenId,
      quantity: qty,
      from: t.from,
      to: burn ? null : t.to,
      priceWei: null,
      txHash: t.txHash,
      timestamp: t.timestamp,
    });
  }
  return [...out.values()];
}

export function ensMap(transfers: RawTransfer[]): Map<Address, string> {
  const m = new Map<Address, string>();
  for (const t of transfers) {
    if (t.fromEns) m.set(t.from, t.fromEns);
    if (t.toEns) m.set(t.to, t.toEns);
  }
  return m;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/indexer/ledger.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add indexer/ledger.ts tests/indexer/ledger.test.ts
git commit -m "feat(indexer): balances, chain events and ens map from transfers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mint dates and prices

**Files:**
- Create: `indexer/mint-prices.ts`
- Test: `tests/indexer/mint-prices.test.ts`

**Interfaces:**
- Consumes: `RawTransfer`, `MintInfo`, `ZERO` (ledger), `compareChrono` (sync-transfers).
- Produces: `mintInfo(transfers: RawTransfer[], getTxValue: (txHash: string) => Promise<string>, maxLookupsPerToken?: number): Promise<Map<string, MintInfo>>`. `at`/`txHash` = the token's earliest mint. `priceWei` = per-unit value of the earliest mint tx that paid anything (tx value ÷ units minted in that tx for this contract), `null` when none of the first `maxLookupsPerToken` (default 5) mint txs paid. `primary` is always `false` here (Task 9 fills it).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { ZERO } from '../../indexer/ledger';
import { mintInfo } from '../../indexer/mint-prices';
import type { RawTransfer } from '../../indexer/types';

const mint = (tokenId: string, txHash: string, block: number, value = '1', to = '0xa'): RawTransfer => ({
  contract: '0xc',
  tokenId,
  from: ZERO,
  to,
  fromEns: null,
  toEns: null,
  value,
  txHash,
  logIndex: 0,
  blockNumber: block,
  timestamp: new Date(Date.UTC(2024, 0, block)).toISOString(),
});

describe('mintInfo', () => {
  it('uses the earliest paid mint for the price and the earliest mint for the date', async () => {
    const values: Record<string, string> = { '0xm1': '0', '0xm2': '20000000000000000', '0xm3': '0' };
    const lookups: string[] = [];
    const info = await mintInfo(
      [mint('1', '0xm1', 1), mint('1', '0xm2', 2, '2', '0xb'), mint('2', '0xm3', 3)],
      async (h) => {
        lookups.push(h);
        return values[h];
      },
    );
    expect(info.get('1')).toEqual({ at: '2024-01-01T00:00:00.000Z', txHash: '0xm1', priceWei: '10000000000000000', primary: false });
    expect(info.get('2')).toEqual({ at: '2024-01-03T00:00:00.000Z', txHash: '0xm3', priceWei: null, primary: false });
    expect(lookups).toEqual(['0xm1', '0xm2', '0xm3']);
  });

  it('divides by every unit minted in the tx across tokens', async () => {
    const info = await mintInfo([mint('1', '0xab', 1), mint('2', '0xab', 1)], async () => '60000000000000000');
    expect(info.get('1')?.priceWei).toBe('30000000000000000');
  });

  it('stops looking after maxLookupsPerToken', async () => {
    const transfers = Array.from({ length: 8 }, (_, i) => mint('1', `0x${i}`, i + 1));
    let n = 0;
    const info = await mintInfo(transfers, async () => {
      n++;
      return '0';
    }, 5);
    expect(n).toBe(5);
    expect(info.get('1')?.priceWei).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/indexer/mint-prices.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `indexer/mint-prices.ts`**

```ts
import { ZERO } from './ledger';
import { compareChrono } from './sync-transfers';
import type { MintInfo, RawTransfer } from './types';

export async function mintInfo(
  transfers: RawTransfer[],
  getTxValue: (txHash: string) => Promise<string>,
  maxLookupsPerToken = 5,
): Promise<Map<string, MintInfo>> {
  const mints = transfers.filter((t) => t.from === ZERO);
  const unitsByTx = new Map<string, bigint>();
  const byToken = new Map<string, RawTransfer[]>();
  for (const m of mints) {
    unitsByTx.set(m.txHash, (unitsByTx.get(m.txHash) ?? 0n) + BigInt(m.value));
    const list = byToken.get(m.tokenId) ?? [];
    list.push(m);
    byToken.set(m.tokenId, list);
  }

  const out = new Map<string, MintInfo>();
  for (const [tokenId, list] of byToken) {
    list.sort(compareChrono);
    let priceWei: string | null = null;
    const seenTx = new Set<string>();
    for (const m of list) {
      if (seenTx.has(m.txHash)) continue;
      if (seenTx.size >= maxLookupsPerToken) break;
      seenTx.add(m.txHash);
      const value = BigInt(await getTxValue(m.txHash));
      if (value > 0n) {
        priceWei = (value / (unitsByTx.get(m.txHash) ?? 1n)).toString();
        break;
      }
    }
    out.set(tokenId, { at: list[0].timestamp, txHash: list[0].txHash, priceWei, primary: false });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/indexer/mint-prices.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add indexer/mint-prices.ts tests/indexer/mint-prices.test.ts
git commit -m "feat(indexer): mint dates and per-unit mint prices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: OpenSea client, normalizers and event merge

**Files:**
- Create: `indexer/opensea.ts`, `indexer/merge-events.ts`
- Test: `tests/indexer/opensea.test.ts`, `tests/indexer/merge-events.test.ts`

**Interfaces:**
- Consumes: `FetchJson`, `HttpError` (http), `ArchiveEvent`, `Listing`, `Address`.
- Produces:
  - `opensea.ts`: `interface OsNft { identifier: string; contract: string }`; `interface OsRawEvent`; `interface OsRawListing`; `interface OpenSea { slug(contract): Promise<string | null>; collection(slug): Promise<{ description: string | null }>; floorWei(slug): Promise<string | null>; events(slug, afterUnix): AsyncGenerator<OsRawEvent>; nftEvents(contract, tokenId, afterUnix): AsyncGenerator<OsRawEvent>; listings(slug): AsyncGenerator<OsRawListing>; bestListing(slug, tokenId): Promise<OsRawListing | null>; nftImageUrl(contract, tokenId): Promise<string | null> }`; `createOpenSea(fetchJson: FetchJson, apiKey: string): OpenSea`; `ethToWei(eth: number): string`; `normalizeOsEvent(e: OsRawEvent, contract: Address): ArchiveEvent | null`; `normalizeListing(l: OsRawListing, contract: Address): Listing | null`; `bestListings(list: Listing[]): Map<string, Listing>`.
  - `merge-events.ts`: `newestFirst(a, b): number`; `mergeEvents(chain: ArchiveEvent[], os: ArchiveEvent[]): ArchiveEvent[]` — drops chain `transfer`s whose tx + token is an OpenSea sale, de-dupes by id, returns newest first.

- [ ] **Step 1: Write the failing tests**

`tests/indexer/opensea.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { FetchJson } from '../../indexer/http';
import { bestListings, createOpenSea, ethToWei, normalizeListing, normalizeOsEvent, type OsRawEvent, type OsRawListing } from '../../indexer/opensea';

const C = '0x3be88adf4d68c32bad5707588c7d25e1af8644e0';

const sale: OsRawEvent = {
  event_type: 'sale',
  event_timestamp: 1730700000,
  transaction: '0xT1',
  order_hash: '0xO1',
  nft: { identifier: '2', contract: '0x3BE88ADF4D68C32BAD5707588C7D25E1AF8644E0' },
  quantity: 1,
  seller: '0xSELLER',
  buyer: '0xBUYER',
  payment: { quantity: '300000000000000000', decimals: 18, symbol: 'ETH' },
};

const listingEvent: OsRawEvent = {
  event_type: 'order',
  order_type: 'listing',
  event_timestamp: 1730800000,
  order_hash: '0xO2',
  asset: { identifier: '3', contract: C },
  quantity: 1,
  maker: '0xMAKER',
  payment: { quantity: '450000000000000000', decimals: 18, symbol: 'ETH' },
};

const listing = (tokenId: string, value: string, amount = '1'): OsRawListing => ({
  order_hash: `0x${tokenId}${value}`,
  price: { current: { currency: 'ETH', decimals: 18, value } },
  protocol_data: { parameters: { offerer: '0xMAKER', startTime: '1730800000', offer: [{ token: C, identifierOrCriteria: tokenId, startAmount: amount }] } },
});

describe('normalizeOsEvent', () => {
  it('maps a sale', () => {
    expect(normalizeOsEvent(sale, C)).toEqual({
      id: 'os:0xO1:0xt1:2:sale',
      kind: 'sale',
      contract: C,
      tokenId: '2',
      quantity: 1,
      from: '0xseller',
      to: '0xbuyer',
      priceWei: '300000000000000000',
      txHash: '0xt1',
      timestamp: '2024-11-04T06:00:00.000Z',
    });
  });

  it('maps an order/listing event', () => {
    const e = normalizeOsEvent(listingEvent, C);
    expect(e?.kind).toBe('listed');
    expect(e?.from).toBe('0xmaker');
    expect(e?.priceWei).toBe('450000000000000000');
  });

  it('ignores other contracts and other event types', () => {
    expect(normalizeOsEvent({ ...sale, nft: { identifier: '2', contract: '0xother' } }, C)).toBeNull();
    expect(normalizeOsEvent({ ...sale, event_type: 'transfer' }, C)).toBeNull();
  });
});

describe('listings', () => {
  it('normalizes per-unit price and keeps the cheapest per token', () => {
    const list = [listing('1', '500'), listing('1', '300'), listing('2', '1000', '4')].map((l) => normalizeListing(l, C)!);
    const best = bestListings(list);
    expect(best.get('1')?.priceWei).toBe('300');
    expect(best.get('2')?.priceWei).toBe('250');
    expect(best.get('1')?.at).toBe('2024-11-05T09:46:40.000Z');
  });
});

describe('ethToWei', () => {
  it('converts float eth', () => {
    expect(ethToWei(0.064)).toBe('64000000000000000');
  });
});

describe('createOpenSea', () => {
  it('pages events with the api key and both event types', async () => {
    const urls: string[] = [];
    const keys: string[] = [];
    const fetchJson = (async (url: string, init?: { headers?: Record<string, string> }) => {
      urls.push(url);
      keys.push(init?.headers?.['x-api-key'] ?? '');
      return urls.length === 1 ? { asset_events: [sale], next: 'CUR' } : { asset_events: [listingEvent], next: null };
    }) as unknown as FetchJson;
    const os = createOpenSea(fetchJson, 'KEY');
    const got: OsRawEvent[] = [];
    for await (const e of os.events('silver-surfer', 1700000000)) got.push(e);
    expect(got).toHaveLength(2);
    expect(urls[0]).toContain('/events/collection/silver-surfer?event_type=sale&event_type=listing&after=1700000000&limit=50');
    expect(urls[1]).toContain('next=CUR');
    expect(keys).toEqual(['KEY', 'KEY']);
  });

  it('returns null for a missing best listing', async () => {
    const { HttpError } = await import('../../indexer/http');
    const fetchJson = (async (url: string) => {
      throw new HttpError(404, url);
    }) as unknown as FetchJson;
    await expect(createOpenSea(fetchJson, 'K').bestListing('x', '1')).resolves.toBeNull();
  });
});
```

`tests/indexer/merge-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeEvents } from '../../indexer/merge-events';
import type { ArchiveEvent } from '../../indexer/types';

const ev = (p: Partial<ArchiveEvent>): ArchiveEvent => ({
  id: 'x',
  kind: 'transfer',
  contract: '0xc',
  tokenId: '1',
  quantity: 1,
  from: '0xa',
  to: '0xb',
  priceWei: null,
  txHash: '0xt',
  timestamp: '2024-01-01T00:00:00.000Z',
  ...p,
});

describe('mergeEvents', () => {
  it('replaces the chain transfer of a sale and sorts newest first', () => {
    const chain = [ev({ id: 'c1', txHash: '0xsale' }), ev({ id: 'c2', kind: 'mint', txHash: '0xm', timestamp: '2023-01-01T00:00:00.000Z' })];
    const os = [ev({ id: 'o1', kind: 'sale', txHash: '0xsale', priceWei: '5' }), ev({ id: 'o2', kind: 'listed', txHash: null, timestamp: '2025-01-01T00:00:00.000Z' })];
    expect(mergeEvents(chain, os).map((e) => e.id)).toEqual(['o2', 'o1', 'c2']);
  });

  it('de-dupes by id', () => {
    expect(mergeEvents([ev({ id: 'a' })], [ev({ id: 'a', kind: 'listed', txHash: null })])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/indexer/opensea.test.ts tests/indexer/merge-events.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `indexer/opensea.ts`**

```ts
import { HttpError, type FetchJson } from './http';
import type { Address, ArchiveEvent, Listing } from './types';

const OS = 'https://api.opensea.io/api/v2';

export interface OsNft {
  identifier: string;
  contract: string;
}

export interface OsRawEvent {
  event_type: string;
  order_type?: string;
  event_timestamp: number;
  transaction?: string | null;
  order_hash?: string | null;
  nft?: OsNft | null;
  asset?: OsNft | null;
  quantity?: number;
  seller?: string;
  buyer?: string;
  maker?: string;
  payment?: { quantity: string; decimals: number; symbol: string } | null;
}

export interface OsRawListing {
  order_hash: string;
  price: { current: { currency: string; decimals: number; value: string } };
  protocol_data: {
    parameters: {
      offerer: string;
      startTime: string;
      offer: { token: string; identifierOrCriteria: string; startAmount: string }[];
    };
  };
}

export interface OpenSea {
  slug(contract: Address): Promise<string | null>;
  collection(slug: string): Promise<{ description: string | null }>;
  floorWei(slug: string): Promise<string | null>;
  events(slug: string, afterUnix: number): AsyncGenerator<OsRawEvent>;
  nftEvents(contract: Address, tokenId: string, afterUnix: number): AsyncGenerator<OsRawEvent>;
  listings(slug: string): AsyncGenerator<OsRawListing>;
  bestListing(slug: string, tokenId: string): Promise<OsRawListing | null>;
  nftImageUrl(contract: Address, tokenId: string): Promise<string | null>;
}

export const ethToWei = (eth: number) => (BigInt(Math.round(eth * 1e9)) * 1_000_000_000n).toString();

export function createOpenSea(fetchJson: FetchJson, apiKey: string): OpenSea {
  const init = { headers: { 'x-api-key': apiKey } };

  async function* eventPages(base: string, afterUnix: number): AsyncGenerator<OsRawEvent> {
    let next: string | null = null;
    do {
      const u = new URL(base);
      u.searchParams.append('event_type', 'sale');
      u.searchParams.append('event_type', 'listing');
      u.searchParams.set('after', String(afterUnix));
      u.searchParams.set('limit', '50');
      if (next) u.searchParams.set('next', next);
      const r = await fetchJson<{ asset_events: OsRawEvent[]; next?: string | null }>(u.toString(), init);
      yield* r.asset_events;
      next = r.next ?? null;
    } while (next);
  }

  return {
    async slug(contract) {
      const r = await fetchJson<{ collection?: string | null }>(`${OS}/chain/ethereum/contract/${contract}`, init);
      return r.collection ?? null;
    },
    async collection(slug) {
      const r = await fetchJson<{ description?: string | null }>(`${OS}/collections/${slug}`, init);
      return { description: r.description || null };
    },
    async floorWei(slug) {
      const r = await fetchJson<{ total?: { floor_price?: number | null } }>(`${OS}/collections/${slug}/stats`, init);
      const floor = r.total?.floor_price;
      return floor == null ? null : ethToWei(floor);
    },
    events(slug, afterUnix) {
      return eventPages(`${OS}/events/collection/${slug}`, afterUnix);
    },
    nftEvents(contract, tokenId, afterUnix) {
      return eventPages(`${OS}/events/chain/ethereum/contract/${contract}/nfts/${tokenId}`, afterUnix);
    },
    async *listings(slug) {
      let next: string | null = null;
      do {
        const u = new URL(`${OS}/listings/collection/${slug}/all`);
        u.searchParams.set('limit', '100');
        if (next) u.searchParams.set('next', next);
        const r = await fetchJson<{ listings: OsRawListing[]; next?: string | null }>(u.toString(), init);
        yield* r.listings;
        next = r.next ?? null;
      } while (next);
    },
    async bestListing(slug, tokenId) {
      try {
        return await fetchJson<OsRawListing>(`${OS}/listings/collection/${slug}/nfts/${tokenId}/best`, init);
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) return null;
        throw err;
      }
    },
    async nftImageUrl(contract, tokenId) {
      const r = await fetchJson<{ nft?: { display_image_url?: string | null; image_url?: string | null } }>(
        `${OS}/chain/ethereum/contract/${contract}/nfts/${tokenId}`,
        init,
      );
      return r.nft?.display_image_url || r.nft?.image_url || null;
    },
  };
}

export function normalizeOsEvent(e: OsRawEvent, contract: Address): ArchiveEvent | null {
  const nft = e.nft ?? e.asset;
  if (!nft || nft.contract.toLowerCase() !== contract) return null;
  const isSale = e.event_type === 'sale';
  const isListing = e.event_type === 'listing' || (e.event_type === 'order' && e.order_type === 'listing');
  if (!isSale && !isListing) return null;
  const priceWei = e.payment && (e.payment.symbol === 'ETH' || e.payment.symbol === 'WETH') ? e.payment.quantity : null;
  const txHash = e.transaction ? e.transaction.toLowerCase() : null;
  const kind = isSale ? 'sale' : 'listed';
  return {
    // sales carry the tx hash too: one ERC-1155 listing can be filled by several buyers under one order_hash
    id: isSale ? `os:${e.order_hash ?? ''}:${txHash ?? ''}:${nft.identifier}:sale` : `os:${e.order_hash ?? txHash}:${nft.identifier}:listed`,
    kind,
    contract,
    tokenId: String(nft.identifier),
    quantity: e.quantity ?? 1,
    from: (isSale ? e.seller : e.maker)?.toLowerCase() ?? null,
    to: isSale ? (e.buyer?.toLowerCase() ?? null) : null,
    priceWei,
    txHash,
    timestamp: new Date(e.event_timestamp * 1000).toISOString(),
  };
}

export function normalizeListing(l: OsRawListing, contract: Address): Listing | null {
  const item = l.protocol_data?.parameters?.offer?.[0];
  if (!item || item.token.toLowerCase() !== contract) return null;
  if (l.price.current.currency !== 'ETH') return null;
  const units = BigInt(item.startAmount || '1') || 1n;
  return {
    tokenId: String(item.identifierOrCriteria),
    priceWei: (BigInt(l.price.current.value) / units).toString(),
    maker: l.protocol_data.parameters.offerer.toLowerCase(),
    at: new Date(Number(l.protocol_data.parameters.startTime) * 1000).toISOString(),
  };
}

export function bestListings(list: Listing[]): Map<string, Listing> {
  const best = new Map<string, Listing>();
  for (const l of list) {
    const cur = best.get(l.tokenId);
    if (!cur || BigInt(l.priceWei) < BigInt(cur.priceWei)) best.set(l.tokenId, l);
  }
  return best;
}
```

- [ ] **Step 4: Write `indexer/merge-events.ts`**

```ts
import type { ArchiveEvent } from './types';

export const newestFirst = (a: ArchiveEvent, b: ArchiveEvent) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0);

export function mergeEvents(chain: ArchiveEvent[], os: ArchiveEvent[]): ArchiveEvent[] {
  const saleKeys = new Set(os.filter((e) => e.kind === 'sale' && e.txHash).map((e) => `${e.txHash}:${e.tokenId}`));
  const kept = chain.filter((e) => !(e.kind === 'transfer' && saleKeys.has(`${e.txHash}:${e.tokenId}`)));
  const byId = new Map<string, ArchiveEvent>();
  for (const e of [...kept, ...os]) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort(newestFirst);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/indexer/opensea.test.ts tests/indexer/merge-events.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add indexer/opensea.ts indexer/merge-events.ts tests/indexer/opensea.test.ts tests/indexer/merge-events.test.ts
git commit -m "feat(indexer): OpenSea client, normalizers and event merge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Media pipeline

**Files:**
- Create: `indexer/media.ts`
- Test: `tests/indexer/media.test.ts`

**Interfaces:**
- Produces: `interface StoredMedia { kind: 'image' | 'svg' | 'html' | 'video'; thumb: string | null; large: string | null; file: string | null }`; `type ManifestEntry = StoredMedia | { failedAt: string }`; `interface MediaDeps { download: (url: string) => Promise<{ bytes: Buffer; mime: string } | null>; outDir: string; publicPrefix: string }`; `IPFS_GATEWAYS`; `extractIpfsPath(src)`; `candidateUrls(src): string[]`; `decodeDataUri(src)`; `sniffMime(bytes, hint): string`; `storeMedia(src, deps, manifest, now?): Promise<StoredMedia | null>` (failed sources are skipped for 7 days); `createDownloader(opts?): MediaDeps['download']` (30 s timeout, size cap, gives up on a host after 3 failures in one run); `gcMedia(dir, referenced: Set<string>, manifest): number`.

- [ ] **Step 1: Install sharp**

```bash
npm install sharp
```

- [ ] **Step 2: Write the failing test**

```ts
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { candidateUrls, decodeDataUri, gcMedia, sniffMime, storeMedia, type ManifestEntry } from '../../indexer/media';

describe('candidateUrls', () => {
  it('rewrites ipfs urls to working gateways', () => {
    expect(candidateUrls('ipfs://QmA/b.png')).toEqual(['https://gateway.pinata.cloud/ipfs/QmA/b.png', 'https://ipfs.filebase.io/ipfs/QmA/b.png']);
    expect(candidateUrls('https://dweb.link/ipfs/QmB/media')[0]).toBe('https://gateway.pinata.cloud/ipfs/QmB/media');
  });
  it('maps ar:// and keeps plain urls', () => {
    expect(candidateUrls('ar://XYZ')).toEqual(['https://arweave.net/XYZ']);
    expect(candidateUrls('https://arweave.net/XYZ')).toEqual(['https://arweave.net/XYZ']);
  });
});

describe('decodeDataUri / sniffMime', () => {
  it('decodes utf8 svg and base64 html', () => {
    expect(decodeDataUri('data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E')?.bytes.toString()).toBe('<svg></svg>');
    const html = decodeDataUri(`data:text/html;base64,${Buffer.from('<!doctype html><p>x').toString('base64')}`);
    expect(html?.mime).toBe('text/html');
    expect(sniffMime(html!.bytes, '')).toBe('text/html');
  });
  it('sniffs binary formats over a wrong header', () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'application/octet-stream')).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('GIF89a'), '')).toBe('image/gif');
  });
});

describe('storeMedia', () => {
  it('writes a thumb and a large webp and reuses the manifest', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'media-'));
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#ff0000' } }).png().toBuffer();
    let downloads = 0;
    const deps = { outDir, publicPrefix: '/media', download: async () => (downloads++, { bytes: png, mime: 'application/octet-stream' }) };
    const manifest: Record<string, ManifestEntry> = {};
    const a = await storeMedia('ipfs://QmPng', deps, manifest);
    const b = await storeMedia('ipfs://QmPng', deps, manifest);
    expect(a?.kind).toBe('image');
    expect(b).toEqual(a);
    expect(downloads).toBe(1);
    const thumb = await sharp(join(outDir, a!.thumb!.replace('/media/', ''))).metadata();
    const large = await sharp(join(outDir, a!.large!.replace('/media/', ''))).metadata();
    expect([thumb.width, thumb.format]).toEqual([480, 'webp']);
    expect(large.width).toBe(1600);
  });

  it('stores svg data uris as files', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'media-'));
    const s = await storeMedia('data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', { outDir, publicPrefix: '/media', download: async () => null }, {});
    expect(s?.kind).toBe('svg');
    expect(readdirSync(outDir)).toHaveLength(1);
  });

  it('remembers failures for 7 days', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'media-'));
    let tries = 0;
    const deps = { outDir, publicPrefix: '/media', download: async () => (tries++, null) };
    const manifest: Record<string, ManifestEntry> = {};
    await storeMedia('https://dead.test/a.png', deps, manifest, new Date('2026-01-01'));
    await storeMedia('https://dead.test/a.png', deps, manifest, new Date('2026-01-03'));
    expect(tries).toBe(1);
    await storeMedia('https://dead.test/a.png', deps, manifest, new Date('2026-01-09'));
    expect(tries).toBe(2);
  });
});

describe('gcMedia', () => {
  it('removes unreferenced files and their manifest entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gc-'));
    writeFileSync(join(dir, 'keep-t.webp'), 'x');
    writeFileSync(join(dir, 'drop.svg'), 'x');
    const manifest: Record<string, ManifestEntry> = {
      k1: { kind: 'image', thumb: '/media/keep-t.webp', large: '/media/keep-t.webp', file: null },
      k2: { kind: 'svg', thumb: '/media/drop.svg', large: '/media/drop.svg', file: '/media/drop.svg' },
    };
    expect(gcMedia(dir, new Set(['keep-t.webp']), manifest)).toBe(1);
    expect(readdirSync(dir)).toEqual(['keep-t.webp']);
    expect(Object.keys(manifest)).toEqual(['k1']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/indexer/media.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `indexer/media.ts`**

```ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export interface StoredMedia {
  kind: 'image' | 'svg' | 'html' | 'video';
  thumb: string | null;
  large: string | null;
  file: string | null;
}
export type ManifestEntry = StoredMedia | { failedAt: string };
export interface MediaDeps {
  download: (url: string) => Promise<{ bytes: Buffer; mime: string } | null>;
  outDir: string;
  publicPrefix: string;
}

export const IPFS_GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.filebase.io/ipfs/'];
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const RETRY_FAILED_AFTER_MS = 7 * 24 * 3600 * 1000;

export function extractIpfsPath(src: string): string | null {
  if (src.startsWith('ipfs://')) return src.slice(7).replace(/^ipfs\//, '');
  const m = src.match(/\/ipfs\/(.+)$/);
  return m ? m[1] : null;
}

export function candidateUrls(src: string): string[] {
  if (src.startsWith('data:')) return [src];
  const ipfs = extractIpfsPath(src);
  if (ipfs) return IPFS_GATEWAYS.map((g) => g + ipfs);
  if (src.startsWith('ar://')) return [`https://arweave.net/${src.slice(5)}`];
  return [src];
}

export function decodeDataUri(src: string): { bytes: Buffer; mime: string } | null {
  const m = src.match(/^data:([^,;]+)((?:;[^,;]*)*),(.*)$/s);
  if (!m) return null;
  if (m[2].includes(';base64')) return { bytes: Buffer.from(m[3], 'base64'), mime: m[1] };
  let text = m[3];
  try {
    text = decodeURIComponent(m[3]);
  } catch {
    // already plain text
  }
  return { bytes: Buffer.from(text, 'utf8'), mime: m[1] };
}

export function sniffMime(b: Buffer, hint: string): string {
  const ascii = (start: number, end: number) => b.subarray(start, end).toString('latin1');
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp') return 'video/mp4';
  const head = b.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'text/html';
  return hint || 'application/octet-stream';
}

const isStored = (e: ManifestEntry | undefined): e is StoredMedia => !!e && 'kind' in e;

export async function storeMedia(
  src: string,
  deps: MediaDeps,
  manifest: Record<string, ManifestEntry>,
  now = new Date(),
): Promise<StoredMedia | null> {
  const key = createHash('sha256').update(src).digest('hex').slice(0, 24);
  const prev = manifest[key];
  if (isStored(prev)) return prev;
  if (prev && now.getTime() - Date.parse(prev.failedAt) < RETRY_FAILED_AFTER_MS) return null;

  let got: { bytes: Buffer; mime: string } | null = null;
  if (src.startsWith('data:')) got = decodeDataUri(src);
  else
    for (const url of candidateUrls(src)) {
      got = await deps.download(url);
      if (got) break;
    }
  if (!got) {
    manifest[key] = { failedAt: now.toISOString() };
    return null;
  }

  const mime = sniffMime(got.bytes, got.mime);
  const hash = createHash('sha256').update(got.bytes).digest('hex').slice(0, 16);
  const pub = (f: string) => `${deps.publicPrefix}/${f}`;
  mkdirSync(deps.outDir, { recursive: true });

  let stored: StoredMedia;
  if (mime === 'image/svg+xml') {
    writeFileSync(join(deps.outDir, `${hash}.svg`), got.bytes);
    stored = { kind: 'svg', thumb: pub(`${hash}.svg`), large: pub(`${hash}.svg`), file: pub(`${hash}.svg`) };
  } else if (mime === 'text/html') {
    writeFileSync(join(deps.outDir, `${hash}.html`), got.bytes);
    stored = { kind: 'html', thumb: null, large: null, file: pub(`${hash}.html`) };
  } else if (mime.startsWith('video/')) {
    if (got.bytes.length > MAX_VIDEO_BYTES) return null;
    writeFileSync(join(deps.outDir, `${hash}.mp4`), got.bytes);
    stored = { kind: 'video', thumb: null, large: null, file: pub(`${hash}.mp4`) };
  } else if (mime.startsWith('image/')) {
    const animated = mime === 'image/gif' || mime === 'image/webp';
    for (const [size, suffix] of [
      [480, 't'],
      [1600, 'l'],
    ] as const) {
      await sharp(got.bytes, { animated, limitInputPixels: false })
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(join(deps.outDir, `${hash}-${suffix}.webp`));
    }
    stored = { kind: 'image', thumb: pub(`${hash}-t.webp`), large: pub(`${hash}-l.webp`), file: null };
  } else {
    manifest[key] = { failedAt: now.toISOString() };
    return null;
  }
  manifest[key] = stored;
  return stored;
}

export function createDownloader(
  opts: { maxBytes?: number; timeoutMs?: number; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> } = {},
): MediaDeps['download'] {
  const maxBytes = opts.maxBytes ?? 80 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const doFetch = opts.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const failuresByHost = new Map<string, number>();
  return async (url) => {
    const host = new URL(url).host;
    if ((failuresByHost.get(host) ?? 0) >= 3) return null;
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      if (!res.ok) throw new Error(String(res.status));
      if (Number(res.headers.get('content-length') ?? 0) > maxBytes) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > maxBytes) return null;
      failuresByHost.set(host, 0);
      return { bytes, mime: (res.headers.get('content-type') ?? '').split(';')[0].trim() };
    } catch {
      failuresByHost.set(host, (failuresByHost.get(host) ?? 0) + 1);
      return null;
    }
  };
}

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export function gcMedia(dir: string, referenced: Set<string>, manifest: Record<string, ManifestEntry>): number {
  let removed = 0;
  if (existsSync(dir))
    for (const f of readdirSync(dir))
      if (!referenced.has(f)) {
        rmSync(join(dir, f));
        removed++;
      }
  for (const [k, v] of Object.entries(manifest)) {
    if (!isStored(v)) continue;
    const files = [v.thumb, v.large, v.file].filter((x): x is string => !!x).map(basename);
    if (files.some((f) => !referenced.has(f))) delete manifest[k];
  }
  return removed;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/indexer/media.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add indexer/media.ts tests/indexer/media.test.ts package.json package-lock.json
git commit -m "feat(indexer): media download, sniffing, webp resizing and gc

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Token, collection and activity outputs

**Files:**
- Create: `indexer/aggregate/exclusions.ts`, `indexer/aggregate/tokens.ts`, `indexer/aggregate/collections.ts`, `indexer/aggregate/activity.ts`
- Test: `tests/indexer/aggregate-outputs.test.ts`

**Interfaces:**
- Consumes: `accession`, `Balances`, `StoredMedia`, `ArchiveEvent`, `CollectionConfig`, `Listing`, `MintInfo`, `TokenMeta`, `newestFirst` (merge-events).
- Produces:
  - `exclusions.ts`: `EXCLUDED_HOLDERS: Set<string>`; `isKeeperAddress(address: string, artist: string): boolean`.
  - `tokens.ts`: `interface TokenOut { id; accession; name; description: string | null; image: StoredMedia | null; animation: StoredMedia | null; mint: MintInfo | null; lastSale: { at: string; priceWei: string } | null; listing: Listing | null; supply: number; holderCount: number; owners: { address: string; ens: string | null; quantity: number }[]; recent: ArchiveEvent[] }`; `interface TokenInputs`; `buildTokens(i: TokenInputs): TokenOut[]`; `carryOverMedia(next: TokenOut[], prev: TokenOut[]): TokenOut[]`.
  - `collections.ts`: `interface CollectionOut { code; slug; title; contract; standard; platform; platformUrl: string | null; section; techniques: string[]; wallText: string | null; accession: string; firstMint: string | null; lastMint: string | null; works: number; pieces: number; holders: number; floorWei: string | null; coverTokenId: string | null; staleSince: string | null }`; `collectionYear(mints: Map<string, MintInfo>): number`; `buildCollection(i): CollectionOut`.
  - `activity.ts`: `interface ActivityRow extends ArchiveEvent { slug: string; code: string; tokenName: string; accession: string; thumb: string | null; fromEns: string | null; toEns: string | null }`; `buildActivity(input: { slug: string; code: string; events: ArchiveEvent[]; tokens: TokenOut[]; ens: Map<string, string> }[], latestCount?: number): { latest: ActivityRow[]; months: Record<string, ActivityRow[]> }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildActivity } from '../../indexer/aggregate/activity';
import { buildCollection, collectionYear } from '../../indexer/aggregate/collections';
import { isKeeperAddress } from '../../indexer/aggregate/exclusions';
import { buildTokens, carryOverMedia, type TokenInputs } from '../../indexer/aggregate/tokens';
import type { ArchiveEvent, CollectionConfig } from '../../indexer/types';

const ARTIST = '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646';
const K1 = '0x00000000000000000000000000000000000000a1';
const K2 = '0x00000000000000000000000000000000000000b2';

const cfg: CollectionConfig = {
  code: 'SLV',
  slug: 'silver-surfer',
  title: 'SILVER SURFER',
  contract: '0xc',
  standard: 'erc721',
  platform: 'manifold',
  section: 'index',
  techniques: ['illustration'],
};

const ev = (p: Partial<ArchiveEvent>): ArchiveEvent => ({
  id: Math.random().toString(),
  kind: 'transfer',
  contract: '0xc',
  tokenId: '1',
  quantity: 1,
  from: null,
  to: null,
  priceWei: null,
  txHash: null,
  timestamp: '2023-03-27T00:00:00.000Z',
  ...p,
});

const events = [
  ev({ kind: 'sale', tokenId: '1', from: K1, to: K2, priceWei: '900', timestamp: '2025-01-01T00:00:00.000Z' }),
  ev({ kind: 'sale', tokenId: '1', from: ARTIST, to: K1, priceWei: '500', timestamp: '2023-04-01T00:00:00.000Z' }),
  ev({ kind: 'mint', tokenId: '1', to: ARTIST, timestamp: '2023-03-27T00:00:00.000Z' }),
  ev({ kind: 'mint', tokenId: '2', to: ARTIST, timestamp: '2023-03-28T00:00:00.000Z' }),
];

const inputs: TokenInputs = {
  cfg,
  artist: ARTIST,
  year: 2023,
  metas: new Map([
    ['1', { tokenId: '1', name: "'Cosmic Power'", description: 'x', image: 'ar://a', animation: null }],
    ['2', { tokenId: '2', name: null, description: null, image: null, animation: null }],
  ]),
  balances: new Map([
    ['1', new Map([[K2, 1n]])],
    ['2', new Map([[ARTIST, 1n]])],
  ]),
  mints: new Map([
    ['1', { at: '2023-03-27T00:00:00.000Z', txHash: '0xm1', priceWei: null, primary: false }],
    ['2', { at: '2023-03-28T00:00:00.000Z', txHash: '0xm2', priceWei: null, primary: false }],
  ]),
  events,
  listings: new Map([['1', { tokenId: '1', priceWei: '1500', maker: K2, at: '2026-11-01T00:00:00.000Z' }]]),
  media: new Map([['1', { image: { kind: 'image', thumb: '/media/a-t.webp', large: '/media/a-l.webp', file: null }, animation: null }]]),
  ens: new Map([[K2, 'keeper.eth']]),
};

describe('isKeeperAddress', () => {
  it('excludes artist, zero, dead and the foundation escrow', () => {
    expect(isKeeperAddress(ARTIST, ARTIST)).toBe(false);
    expect(isKeeperAddress('0xcda72070e455bb31c7690a170224ce43623d0b6f', ARTIST)).toBe(false);
    expect(isKeeperAddress(K1, ARTIST)).toBe(true);
  });
});

describe('buildTokens', () => {
  const tokens = buildTokens(inputs);

  it('builds accession numbers and names', () => {
    expect(tokens.map((t) => [t.id, t.accession, t.name])).toEqual([
      ['1', 'GRF.23.SLV.001', "'Cosmic Power'"],
      ['2', 'GRF.23.SLV.002', 'SILVER SURFER #2'],
    ]);
  });

  it('fills an unpaid mint price from the artist first sale', () => {
    expect(tokens[0].mint).toEqual({ at: '2023-03-27T00:00:00.000Z', txHash: '0xm1', priceWei: '500', primary: true });
    expect(tokens[1].mint?.priceWei).toBeNull();
  });

  it('exposes last sale, listing, owners and recent events', () => {
    expect(tokens[0].lastSale).toEqual({ at: '2025-01-01T00:00:00.000Z', priceWei: '900' });
    expect(tokens[0].listing?.priceWei).toBe('1500');
    expect(tokens[0].owners).toEqual([{ address: K2, ens: 'keeper.eth', quantity: 1 }]);
    expect(tokens[0].recent.map((e) => e.kind)).toEqual(['sale', 'sale', 'mint']);
    expect(tokens[0].supply).toBe(1);
  });

  it('drops the token suffix for single-token collections', () => {
    const t = buildTokens({ ...inputs, cfg: { ...cfg, code: '366', tokenIds: ['1'] }, year: 2025 });
    expect(t.map((x) => x.accession)).toEqual(['GRF.25.366']);
  });

  it('carries over media lost in this run', () => {
    const prev = buildTokens(inputs);
    const next = buildTokens({ ...inputs, media: new Map() });
    expect(carryOverMedia(next, prev)[0].image?.thumb).toBe('/media/a-t.webp');
  });
});

describe('buildCollection', () => {
  it('summarises a collection', () => {
    const tokens = buildTokens(inputs);
    expect(collectionYear(inputs.mints)).toBe(2023);
    const c = buildCollection({ cfg, artist: ARTIST, year: 2023, tokens, balances: inputs.balances, floorWei: '700', osDescription: 'desc', staleSince: null });
    expect(c).toMatchObject({
      code: 'SLV',
      accession: 'GRF.23.SLV',
      firstMint: '2023-03-27T00:00:00.000Z',
      lastMint: '2023-03-28T00:00:00.000Z',
      works: 2,
      pieces: 2,
      holders: 1,
      floorWei: '700',
      coverTokenId: '1',
      wallText: 'desc',
      platformUrl: null,
    });
  });
});

describe('buildActivity', () => {
  it('enriches, sorts newest first and shards by month', () => {
    const tokens = buildTokens(inputs);
    const a = buildActivity([{ slug: cfg.slug, code: cfg.code, events, tokens, ens: inputs.ens }], 2);
    expect(a.latest.map((r) => r.timestamp)).toEqual(['2025-01-01T00:00:00.000Z', '2023-04-01T00:00:00.000Z']);
    expect(a.latest[0]).toMatchObject({ slug: 'silver-surfer', tokenName: "'Cosmic Power'", accession: 'GRF.23.SLV.001', thumb: '/media/a-t.webp', toEns: 'keeper.eth' });
    expect(Object.keys(a.months).sort()).toEqual(['2023-03', '2023-04', '2025-01']);
    expect(a.months['2023-03']).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/indexer/aggregate-outputs.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `indexer/aggregate/exclusions.ts`**

```ts
import { DEAD, ZERO } from '../ledger';

export const EXCLUDED_HOLDERS = new Set<string>([
  ZERO,
  DEAD,
  '0xcda72070e455bb31c7690a170224ce43623d0b6f', // Foundation market escrow
]);

export const isKeeperAddress = (address: string, artist: string) => address !== artist && !EXCLUDED_HOLDERS.has(address);
```

- [ ] **Step 4: Write `indexer/aggregate/tokens.ts`**

```ts
import { accession } from '../accession';
import type { Balances } from '../ledger';
import type { StoredMedia } from '../media';
import type { ArchiveEvent, CollectionConfig, Listing, MintInfo, TokenMeta } from '../types';

export interface TokenOut {
  id: string;
  accession: string;
  name: string;
  description: string | null;
  image: StoredMedia | null;
  animation: StoredMedia | null;
  mint: MintInfo | null;
  lastSale: { at: string; priceWei: string } | null;
  listing: Listing | null;
  supply: number;
  holderCount: number;
  owners: { address: string; ens: string | null; quantity: number }[];
  recent: ArchiveEvent[];
}

export interface TokenInputs {
  cfg: CollectionConfig;
  artist: string;
  year: number;
  metas: Map<string, TokenMeta>;
  balances: Balances;
  mints: Map<string, MintInfo>;
  events: ArchiveEvent[]; // newest first
  listings: Map<string, Listing>;
  media: Map<string, { image: StoredMedia | null; animation: StoredMedia | null }>;
  ens: Map<string, string>;
}

const byNumericId = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

export function buildTokens(i: TokenInputs): TokenOut[] {
  const allowed = i.cfg.tokenIds ? new Set(i.cfg.tokenIds) : null;
  const ids = [...new Set([...i.metas.keys(), ...i.balances.keys(), ...i.mints.keys()])]
    .filter((id) => !allowed || allowed.has(id))
    .sort(byNumericId);
  const maxId = ids.at(-1) ?? '0';
  const single = i.cfg.tokenIds?.length === 1;

  const eventsByToken = new Map<string, ArchiveEvent[]>();
  for (const e of i.events) {
    const list = eventsByToken.get(e.tokenId) ?? [];
    list.push(e);
    eventsByToken.set(e.tokenId, list);
  }

  return ids.map((id) => {
    const meta = i.metas.get(id);
    const evs = eventsByToken.get(id) ?? [];
    const holders = [...(i.balances.get(id) ?? new Map<string, bigint>()).entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));

    let mint = i.mints.get(id) ?? null;
    if (mint && mint.priceWei === null) {
      const firstArtistSale = [...evs].reverse().find((e) => e.kind === 'sale' && e.from === i.artist && e.priceWei);
      if (firstArtistSale) mint = { ...mint, priceWei: firstArtistSale.priceWei, primary: true };
    }
    const lastSale = evs.find((e) => e.kind === 'sale' && e.priceWei);
    const media = i.media.get(id);

    return {
      id,
      accession: single ? accession(i.cfg.code, i.year) : accession(i.cfg.code, i.year, id, maxId),
      name: meta?.name ?? `${i.cfg.title} #${id}`,
      description: meta?.description ?? null,
      image: media?.image ?? null,
      animation: media?.animation ?? null,
      mint,
      lastSale: lastSale ? { at: lastSale.timestamp, priceWei: lastSale.priceWei! } : null,
      listing: i.listings.get(id) ?? null,
      supply: holders.reduce((sum, [, q]) => sum + Number(q), 0),
      holderCount: holders.length,
      owners: holders.slice(0, 5).map(([address, q]) => ({ address, ens: i.ens.get(address) ?? null, quantity: Number(q) })),
      recent: evs.slice(0, 10),
    };
  });
}

export function carryOverMedia(next: TokenOut[], prev: TokenOut[]): TokenOut[] {
  const old = new Map(prev.map((t) => [t.id, t]));
  return next.map((t) => {
    const p = old.get(t.id);
    if (!p) return t;
    return { ...t, image: t.image ?? p.image, animation: t.animation ?? p.animation };
  });
}
```

- [ ] **Step 5: Write `indexer/aggregate/collections.ts`**

```ts
import { accession } from '../accession';
import type { Balances } from '../ledger';
import type { CollectionConfig, MintInfo } from '../types';
import { isKeeperAddress } from './exclusions';
import type { TokenOut } from './tokens';

export interface CollectionOut {
  code: string;
  slug: string;
  title: string;
  contract: string;
  standard: CollectionConfig['standard'];
  platform: CollectionConfig['platform'];
  platformUrl: string | null;
  section: CollectionConfig['section'];
  techniques: string[];
  wallText: string | null;
  accession: string;
  firstMint: string | null;
  lastMint: string | null;
  works: number;
  pieces: number;
  holders: number;
  floorWei: string | null;
  coverTokenId: string | null;
  staleSince: string | null;
}

export function collectionYear(mints: Map<string, MintInfo>): number {
  const first = [...mints.values()].map((m) => m.at).sort()[0];
  return first ? Number(first.slice(0, 4)) : new Date().getUTCFullYear();
}

export function buildCollection(i: {
  cfg: CollectionConfig;
  artist: string;
  year: number;
  tokens: TokenOut[];
  balances: Balances;
  floorWei: string | null;
  osDescription: string | null;
  staleSince: string | null;
}): CollectionOut {
  const ids = new Set(i.tokens.map((t) => t.id));
  const holders = new Set<string>();
  for (const [tokenId, h] of i.balances) if (ids.has(tokenId)) for (const a of h.keys()) if (isKeeperAddress(a, i.artist)) holders.add(a);
  const mintDates = i.tokens.map((t) => t.mint?.at).filter((x): x is string => !!x).sort();
  return {
    code: i.cfg.code,
    slug: i.cfg.slug,
    title: i.cfg.title,
    contract: i.cfg.contract,
    standard: i.cfg.standard,
    platform: i.cfg.platform,
    platformUrl: i.cfg.platformUrl ?? null,
    section: i.cfg.section,
    techniques: i.cfg.techniques,
    wallText: i.cfg.wallText ?? i.osDescription ?? null,
    accession: accession(i.cfg.code, i.year),
    firstMint: mintDates[0] ?? null,
    lastMint: mintDates.at(-1) ?? null,
    works: i.tokens.filter((t) => t.supply > 0).length,
    pieces: i.tokens.reduce((sum, t) => sum + t.supply, 0),
    holders: holders.size,
    floorWei: i.floorWei,
    coverTokenId: i.tokens.find((t) => t.image?.thumb)?.id ?? null,
    staleSince: i.staleSince,
  };
}
```

- [ ] **Step 6: Write `indexer/aggregate/activity.ts`**

```ts
import { newestFirst } from '../merge-events';
import type { ArchiveEvent } from '../types';
import type { TokenOut } from './tokens';

export interface ActivityRow extends ArchiveEvent {
  slug: string;
  code: string;
  tokenName: string;
  accession: string;
  thumb: string | null;
  fromEns: string | null;
  toEns: string | null;
}

export function buildActivity(
  input: { slug: string; code: string; events: ArchiveEvent[]; tokens: TokenOut[]; ens: Map<string, string> }[],
  latestCount = 200,
): { latest: ActivityRow[]; months: Record<string, ActivityRow[]> } {
  const rows: ActivityRow[] = [];
  for (const c of input) {
    const byId = new Map(c.tokens.map((t) => [t.id, t]));
    for (const e of c.events) {
      const t = byId.get(e.tokenId);
      if (!t) continue;
      rows.push({
        ...e,
        slug: c.slug,
        code: c.code,
        tokenName: t.name,
        accession: t.accession,
        thumb: t.image?.thumb ?? null,
        fromEns: e.from ? (c.ens.get(e.from) ?? null) : null,
        toEns: e.to ? (c.ens.get(e.to) ?? null) : null,
      });
    }
  }
  rows.sort(newestFirst);
  const months: Record<string, ActivityRow[]> = {};
  for (const r of rows) (months[r.timestamp.slice(0, 7)] ??= []).push(r);
  return { latest: rows.slice(0, latestCount), months };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/indexer/aggregate-outputs.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Commit**

```bash
git add indexer/aggregate tests/indexer/aggregate-outputs.test.ts
git commit -m "feat(indexer): token, collection and activity outputs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Keepers and timeline

**Files:**
- Create: `indexer/aggregate/keepers.ts`, `indexer/aggregate/timeline.ts`
- Test: `tests/indexer/aggregate-people.test.ts`

**Interfaces:**
- Consumes: `isKeeperAddress`, `TokenOut`, `buildBalances`, `Balances`, `RawTransfer`, `ArchiveEvent`, `CollectionConfig`.
- Produces:
  - `keepers.ts`: `interface KeeperOut { address: string; ens: string | null; pieces: number; works: number; collections: string[]; mask: string; firstAcquired: string | null; lastAcquired: string | null; fromArtist: { pieces: number; paidWei: string }; longestHeld: { slug: string; tokenId: string; since: string } | null; holdings: { slug: string; tokenId: string; quantity: number }[] }`; `buildKeepers(i: { artist: string; ens: Map<string, string>; indexOrder: string[]; collections: { cfg: CollectionConfig; transfers: RawTransfer[]; balances: Balances; events: ArchiveEvent[]; tokens: TokenOut[] }[] }): KeeperOut[]` — sorted by pieces desc, works desc, firstAcquired asc.
  - `timeline.ts`: `interface TimelineMonth { month: string; collections: { code: string; works: number }[]; holders: number }`; `monthRange(from: string, to: string): string[]`; `monthEnd(month: string): string`; `buildTimeline(i: { artist: string; from: string; to: string; collections: { code: string; transfers: RawTransfer[] }[] }): TimelineMonth[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildKeepers } from '../../indexer/aggregate/keepers';
import { buildTimeline, monthEnd, monthRange } from '../../indexer/aggregate/timeline';
import { buildTokens } from '../../indexer/aggregate/tokens';
import { buildBalances, chainEvents, ZERO } from '../../indexer/ledger';
import type { ArchiveEvent, CollectionConfig, RawTransfer } from '../../indexer/types';

const ARTIST = '0x4730497622bdfd6eafe1f09fa22b3a0aca94a646';
const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';

const cfg = (code: string, slug: string): CollectionConfig => ({
  code,
  slug,
  title: slug,
  contract: `0x${code.toLowerCase()}`,
  standard: 'erc1155',
  platform: 'manifold',
  section: 'index',
  techniques: ['illustration'],
});

let block = 0;
const tr = (contract: string, tokenId: string, from: string, to: string, value: string, timestamp: string): RawTransfer => ({
  contract,
  tokenId,
  from,
  to,
  fromEns: null,
  toEns: to === A ? 'aa.eth' : null,
  value,
  txHash: `0x${++block}`,
  logIndex: 0,
  blockNumber: block,
  timestamp,
});

const vbsTransfers = [
  tr('0xvbs', '1', ZERO, A, '2', '2023-01-15T00:00:00.000Z'),
  tr('0xvbs', '1', ZERO, B, '1', '2023-02-10T00:00:00.000Z'),
];
const fctTransfers = [
  tr('0xfct', '7', ZERO, ARTIST, '1', '2026-09-08T00:00:00.000Z'),
  tr('0xfct', '7', ARTIST, A, '1', '2026-09-20T00:00:00.000Z'),
];

function collection(c: CollectionConfig, transfers: RawTransfer[], extra: ArchiveEvent[] = []) {
  const balances = buildBalances(transfers);
  const events = [...chainEvents(transfers), ...extra].sort((x, y) => (x.timestamp < y.timestamp ? 1 : -1));
  const mints = new Map([...balances.keys()].map((id) => [id, { at: transfers[0].timestamp, txHash: transfers[0].txHash, priceWei: '10', primary: false }]));
  const tokens = buildTokens({ cfg: c, artist: ARTIST, year: 2023, metas: new Map(), balances, mints, events, listings: new Map(), media: new Map(), ens: new Map() });
  return { cfg: c, transfers, balances, events, tokens };
}

describe('buildKeepers', () => {
  const sale: ArchiveEvent = {
    id: 's',
    kind: 'sale',
    contract: '0xfct',
    tokenId: '7',
    quantity: 1,
    from: ARTIST,
    to: A,
    priceWei: '300',
    txHash: '0xs',
    timestamp: '2026-09-20T00:00:00.000Z',
  };
  const keepers = buildKeepers({
    artist: ARTIST,
    ens: new Map([[A, 'aa.eth']]),
    indexOrder: ['VBS', 'FCT'],
    collections: [collection(cfg('VBS', 'vibes'), vbsTransfers), collection(cfg('FCT', 'facets'), fctTransfers, [sale])],
  });

  it('ranks keepers and excludes the artist', () => {
    expect(keepers.map((k) => [k.address, k.pieces, k.works])).toEqual([
      [A, 3, 2],
      [B, 1, 1],
    ]);
  });

  it('computes mask, dates, from-artist totals and longest held', () => {
    expect(keepers[0]).toMatchObject({
      ens: 'aa.eth',
      collections: ['VBS', 'FCT'],
      mask: '11',
      firstAcquired: '2023-01-15T00:00:00.000Z',
      lastAcquired: '2026-09-20T00:00:00.000Z',
      fromArtist: { pieces: 3, paidWei: '320' },
      longestHeld: { slug: 'vibes', tokenId: '1', since: '2023-01-15T00:00:00.000Z' },
    });
    expect(keepers[1].mask).toBe('10');
  });
});

describe('timeline', () => {
  it('builds month ranges and month ends', () => {
    expect(monthRange('2022-11', '2023-02')).toEqual(['2022-11', '2022-12', '2023-01', '2023-02']);
    expect(monthEnd('2023-02')).toBe('2023-02-28T23:59:59.999Z');
  });

  it('summarises the archive at each month end', () => {
    const t = buildTimeline({
      artist: ARTIST,
      from: '2023-01',
      to: '2023-02',
      collections: [{ code: 'VBS', transfers: vbsTransfers }],
    });
    expect(t).toEqual([
      { month: '2023-01', collections: [{ code: 'VBS', works: 1 }], holders: 1 },
      { month: '2023-02', collections: [{ code: 'VBS', works: 1 }], holders: 2 },
    ]);
  });
});
```

Note on the expected `fromArtist`: A minted 2 VBS units at a mint price of `10` (20 wei) and bought FCT #7 from the artist for `300` → 3 pieces, 320 wei.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/indexer/aggregate-people.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `indexer/aggregate/keepers.ts`**

```ts
import type { Balances } from '../ledger';
import type { ArchiveEvent, CollectionConfig, RawTransfer } from '../types';
import { isKeeperAddress } from './exclusions';
import type { TokenOut } from './tokens';

export interface KeeperOut {
  address: string;
  ens: string | null;
  pieces: number;
  works: number;
  collections: string[];
  mask: string;
  firstAcquired: string | null;
  lastAcquired: string | null;
  fromArtist: { pieces: number; paidWei: string };
  longestHeld: { slug: string; tokenId: string; since: string } | null;
  holdings: { slug: string; tokenId: string; quantity: number }[];
}

interface Draft {
  address: string;
  pieces: number;
  works: number;
  codes: Set<string>;
  first: string | null;
  last: string | null;
  fromArtistPieces: number;
  fromArtistPaid: bigint;
  longest: KeeperOut['longestHeld'];
  holdings: KeeperOut['holdings'];
}

export function buildKeepers(i: {
  artist: string;
  ens: Map<string, string>;
  indexOrder: string[];
  collections: { cfg: CollectionConfig; transfers: RawTransfer[]; balances: Balances; events: ArchiveEvent[]; tokens: TokenOut[] }[];
}): KeeperOut[] {
  const drafts = new Map<string, Draft>();
  const get = (address: string): Draft => {
    let d = drafts.get(address);
    if (!d) {
      d = { address, pieces: 0, works: 0, codes: new Set(), first: null, last: null, fromArtistPieces: 0, fromArtistPaid: 0n, longest: null, holdings: [] };
      drafts.set(address, d);
    }
    return d;
  };

  for (const c of i.collections) {
    const lastInbound = new Map<string, string>();
    for (const t of c.transfers) {
      if (!isKeeperAddress(t.to, i.artist)) continue;
      const d = get(t.to);
      if (!d.first || t.timestamp < d.first) d.first = t.timestamp;
      if (!d.last || t.timestamp > d.last) d.last = t.timestamp;
      lastInbound.set(`${t.tokenId}:${t.to}`, t.timestamp);
    }

    for (const [tokenId, holders] of c.balances) {
      for (const [address, qty] of holders) {
        if (!isKeeperAddress(address, i.artist)) continue;
        const d = get(address);
        d.pieces += Number(qty);
        d.works += 1;
        d.codes.add(c.cfg.code);
        d.holdings.push({ slug: c.cfg.slug, tokenId, quantity: Number(qty) });
        const since = lastInbound.get(`${tokenId}:${address}`);
        if (since && (!d.longest || since < d.longest.since)) d.longest = { slug: c.cfg.slug, tokenId, since };
      }
    }

    const paidMint = new Map(c.tokens.map((t) => [t.id, t.mint && !t.mint.primary ? t.mint.priceWei : null]));
    for (const e of c.events) {
      if (!e.to || !isKeeperAddress(e.to, i.artist)) continue;
      if (e.kind === 'sale' && e.from === i.artist && e.priceWei) {
        const d = get(e.to);
        d.fromArtistPieces += e.quantity;
        d.fromArtistPaid += BigInt(e.priceWei);
      } else if (e.kind === 'mint') {
        const price = paidMint.get(e.tokenId);
        if (!price) continue;
        const d = get(e.to);
        d.fromArtistPieces += e.quantity;
        d.fromArtistPaid += BigInt(price) * BigInt(e.quantity);
      }
    }
  }

  const order = new Map(i.indexOrder.map((code, idx) => [code, idx]));
  return [...drafts.values()]
    .filter((d) => d.pieces > 0)
    .sort((a, b) => b.pieces - a.pieces || b.works - a.works || (a.first ?? '').localeCompare(b.first ?? ''))
    .map((d) => ({
      address: d.address,
      ens: i.ens.get(d.address) ?? null,
      pieces: d.pieces,
      works: d.works,
      collections: [...d.codes].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)),
      mask: i.indexOrder.map((code) => (d.codes.has(code) ? '1' : '0')).join(''),
      firstAcquired: d.first,
      lastAcquired: d.last,
      fromArtist: { pieces: d.fromArtistPieces, paidWei: d.fromArtistPaid.toString() },
      longestHeld: d.longest,
      holdings: d.holdings,
    }));
}
```

- [ ] **Step 4: Write `indexer/aggregate/timeline.ts`**

```ts
import { buildBalances } from '../ledger';
import type { RawTransfer } from '../types';
import { isKeeperAddress } from './exclusions';

export interface TimelineMonth {
  month: string;
  collections: { code: string; works: number }[];
  holders: number;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - 1).toISOString();
}

export function buildTimeline(i: { artist: string; from: string; to: string; collections: { code: string; transfers: RawTransfer[] }[] }): TimelineMonth[] {
  return monthRange(i.from, i.to).map((month) => {
    const end = monthEnd(month);
    const holders = new Set<string>();
    const collections: TimelineMonth['collections'] = [];
    for (const c of i.collections) {
      let works = 0;
      for (const [, h] of buildBalances(c.transfers, end)) {
        if (h.size > 0) works++;
        for (const a of h.keys()) if (isKeeperAddress(a, i.artist)) holders.add(a);
      }
      if (works > 0) collections.push({ code: c.code, works });
    }
    return { month, collections, holders: holders.size };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/indexer/aggregate-people.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add indexer/aggregate/keepers.ts indexer/aggregate/timeline.ts tests/indexer/aggregate-people.test.ts
git commit -m "feat(indexer): keepers ranking and monthly timeline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Store, validation, pipeline and CLI — first real inventory

**Files:**
- Create: `indexer/store.ts`, `indexer/validate.ts`, `indexer/prices.ts`, `indexer/pipeline/collection.ts`, `indexer/run.ts`
- Test: `tests/indexer/validate.test.ts`, `tests/indexer/store.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `store.ts`: `readJson<T>(path: string, fallback: T): T`; `writeJsonAtomic(path: string, data: unknown): void`.
  - `validate.ts`: `validateSnapshot(prev: CollectionOut[] | null, next: CollectionOut[], prevTokens: Record<string, TokenOut[]>, nextTokens: Record<string, TokenOut[]>): { errors: string[]; missingMedia: string[] }`.
  - `prices.ts`: `ethUsd(fetchJson: FetchJson): Promise<number | null>`.
  - `pipeline/collection.ts`: `interface PipelineContext`, `interface CollectionState`, `processCollection(cfg, ctx): Promise<CollectionState>`.
  - CLI: `npm run index -- [--only CODE[,CODE]] [--out DIR]`. Writes `<out>/collections.json`, `<out>/tokens/<slug>.json`, `<out>/keepers.json`, `<out>/timeline.json`, `<out>/activity/latest.json`, `<out>/activity/<yyyy-mm>.json`, `<out>/meta.json` (`{ lastInventory, ethUsd, sources: { blockscout, opensea }, missingMedia, partial }`). Exit code 1 and no catalog writes when validation fails.

- [ ] **Step 1: Write the failing tests**

`tests/indexer/store.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJson, writeJsonAtomic } from '../../indexer/store';

describe('store', () => {
  it('round-trips json and falls back when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-'));
    expect(readJson(join(dir, 'nope.json'), { a: 1 })).toEqual({ a: 1 });
    writeJsonAtomic(join(dir, 'deep', 'x.json'), { b: 2 });
    expect(readJson(join(dir, 'deep', 'x.json'), null)).toEqual({ b: 2 });
  });
});
```

`tests/indexer/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CollectionOut } from '../../indexer/aggregate/collections';
import type { TokenOut } from '../../indexer/aggregate/tokens';
import { validateSnapshot } from '../../indexer/validate';

const col = (slug: string, works: number) => ({ slug, works }) as unknown as CollectionOut;
const tok = (id: string, withImage: boolean) =>
  ({ id, image: withImage ? { kind: 'image', thumb: '/media/x-t.webp', large: '/media/x-l.webp', file: null } : null, animation: null }) as unknown as TokenOut;

describe('validateSnapshot', () => {
  it('accepts a first run and lists tokens without media as missing', () => {
    const r = validateSnapshot(null, [col('a', 2)], {}, { a: [tok('1', true), tok('2', false)] });
    expect(r.errors).toEqual([]);
    expect(r.missingMedia).toEqual(['a #2']);
  });

  it('rejects a drop of more than 10% of works', () => {
    expect(validateSnapshot([col('a', 100)], [col('a', 89)], {}, { a: [] }).errors[0]).toMatch(/a: works dropped from 100 to 89/);
  });

  it('rejects a disappeared collection and lost media', () => {
    const r = validateSnapshot([col('a', 1), col('b', 1)], [col('a', 1)], { a: [tok('1', true)] }, { a: [tok('1', false)] });
    expect(r.errors).toEqual(['b: collection disappeared', 'a #1: lost its media']);
  });

  it('rejects duplicate slugs', () => {
    expect(validateSnapshot(null, [col('a', 1), col('a', 1)], {}, {}).errors).toContain('a: duplicate slug');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/indexer/store.test.ts tests/indexer/validate.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `indexer/store.ts`**

```ts
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, path);
}
```

- [ ] **Step 4: Write `indexer/validate.ts`**

```ts
import type { CollectionOut } from './aggregate/collections';
import type { TokenOut } from './aggregate/tokens';

const hasMedia = (t: TokenOut) => !!(t.image || t.animation);

export function validateSnapshot(
  prev: CollectionOut[] | null,
  next: CollectionOut[],
  prevTokens: Record<string, TokenOut[]>,
  nextTokens: Record<string, TokenOut[]>,
): { errors: string[]; missingMedia: string[] } {
  const errors: string[] = [];
  const missingMedia: string[] = [];

  const seen = new Set<string>();
  for (const c of next) {
    if (seen.has(c.slug)) errors.push(`${c.slug}: duplicate slug`);
    seen.add(c.slug);
  }

  for (const p of prev ?? []) {
    const n = next.find((c) => c.slug === p.slug);
    if (!n) errors.push(`${p.slug}: collection disappeared`);
    else if (n.works < Math.floor(p.works * 0.9)) errors.push(`${p.slug}: works dropped from ${p.works} to ${n.works}`);
  }

  for (const [slug, tokens] of Object.entries(nextTokens)) {
    const hadMedia = new Set((prevTokens[slug] ?? []).filter(hasMedia).map((t) => t.id));
    for (const t of tokens) {
      if (hasMedia(t)) continue;
      if (hadMedia.has(t.id)) errors.push(`${slug} #${t.id}: lost its media`);
      else missingMedia.push(`${slug} #${t.id}`);
    }
  }
  return { errors, missingMedia };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/indexer/store.test.ts tests/indexer/validate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write `indexer/prices.ts`**

```ts
import type { FetchJson } from './http';

export async function ethUsd(fetchJson: FetchJson): Promise<number | null> {
  try {
    const r = await fetchJson<{ ethereum?: { usd?: number } }>('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    return r.ethereum?.usd ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Write `indexer/pipeline/collection.ts`**

```ts
import { join } from 'node:path';
import { instanceUrl, instancesUrl, paginate, toRawTransfer, toTokenMeta, transfersUrl, txValueWei, type BsInstance, type BsTransfer } from '../blockscout';
import type { FetchJson } from '../http';
import { buildBalances, chainEvents, ensMap, type Balances } from '../ledger';
import { storeMedia, type ManifestEntry, type MediaDeps, type StoredMedia } from '../media';
import { mergeEvents } from '../merge-events';
import { mintInfo } from '../mint-prices';
import { bestListings, normalizeListing, normalizeOsEvent, type OpenSea } from '../opensea';
import { readJson, writeJsonAtomic } from '../store';
import { compareChrono, syncTransfers } from '../sync-transfers';
import type { ArchiveEvent, CollectionConfig, Listing, MintInfo, RawTransfer, TokenMeta } from '../types';

export interface PipelineContext {
  fetchJson: FetchJson;
  os: OpenSea | null;
  mediaDeps: MediaDeps;
  manifest: Record<string, ManifestEntry>;
  txValues: Record<string, string>;
  rawDir: string;
  log: (msg: string) => void;
}

export interface CollectionState {
  cfg: CollectionConfig;
  transfers: RawTransfer[];
  metas: Map<string, TokenMeta>;
  balances: Balances;
  events: ArchiveEvent[];
  mints: Map<string, MintInfo>;
  listings: Map<string, Listing>;
  floorWei: string | null;
  osDescription: string | null;
  media: Map<string, { image: StoredMedia | null; animation: StoredMedia | null }>;
  ens: Map<string, string>;
  osStatus: 'ok' | 'skipped' | 'error';
}

async function* transferStream(fetchJson: FetchJson, cfg: CollectionConfig, tokenId?: string): AsyncGenerator<RawTransfer> {
  for await (const t of paginate<BsTransfer>(fetchJson, transfersUrl(cfg.contract, tokenId))) {
    const raw = toRawTransfer(cfg.contract, t);
    if (raw) yield raw;
  }
}

async function loadTransfers(cfg: CollectionConfig, ctx: PipelineContext): Promise<RawTransfer[]> {
  const path = join(ctx.rawDir, 'transfers', `${cfg.slug}.json`);
  const existing = readJson<RawTransfer[]>(path, []);
  let transfers: RawTransfer[];
  if (cfg.tokenIds) {
    transfers = [];
    for (const id of cfg.tokenIds) {
      const r = await syncTransfers(
        existing.filter((t) => t.tokenId === id),
        transferStream(ctx.fetchJson, cfg, id),
      );
      transfers.push(...r.transfers);
    }
    transfers.sort(compareChrono);
  } else {
    transfers = (await syncTransfers(existing, transferStream(ctx.fetchJson, cfg))).transfers;
  }
  writeJsonAtomic(path, transfers);
  ctx.log(`  transfers: ${transfers.length} (+${transfers.length - existing.length})`);
  return transfers;
}

async function loadMetas(cfg: CollectionConfig, ctx: PipelineContext): Promise<Map<string, TokenMeta>> {
  const path = join(ctx.rawDir, 'metas', `${cfg.slug}.json`);
  try {
    const list: TokenMeta[] = [];
    if (cfg.tokenIds) for (const id of cfg.tokenIds) list.push(toTokenMeta(await ctx.fetchJson<BsInstance>(instanceUrl(cfg.contract, id))));
    else for await (const i of paginate<BsInstance>(ctx.fetchJson, instancesUrl(cfg.contract))) list.push(toTokenMeta(i));
    writeJsonAtomic(path, list);
    return new Map(list.map((m) => [m.tokenId, m]));
  } catch (err) {
    ctx.log(`  metas failed (${(err as Error).message}), using cache`);
    return new Map(readJson<TokenMeta[]>(path, []).map((m) => [m.tokenId, m]));
  }
}

interface OsResult {
  status: CollectionState['osStatus'];
  events: ArchiveEvent[];
  listings: Map<string, Listing>;
  floorWei: string | null;
  description: string | null;
}

async function loadOpenSea(cfg: CollectionConfig, ctx: PipelineContext): Promise<OsResult> {
  const evPath = join(ctx.rawDir, 'os-events', `${cfg.slug}.json`);
  const lsPath = join(ctx.rawDir, 'os-listings', `${cfg.slug}.json`);
  const metaPath = join(ctx.rawDir, 'os-meta', `${cfg.slug}.json`);
  const cachedEvents = readJson<ArchiveEvent[]>(evPath, []);
  const cachedListings = new Map(readJson<Listing[]>(lsPath, []).map((l) => [l.tokenId, l]));
  const cachedMeta = readJson<{ floorWei: string | null; description: string | null }>(metaPath, { floorWei: null, description: null });
  const cached = (status: OsResult['status']): OsResult => ({ status, events: cachedEvents, listings: cachedListings, ...cachedMeta });
  if (!ctx.os) return cached('skipped');

  try {
    const os = ctx.os;
    const slug = await os.slug(cfg.contract);
    if (!slug) throw new Error('no OpenSea collection for contract');
    const lastTs = cachedEvents.reduce((m, e) => Math.max(m, Math.floor(Date.parse(e.timestamp) / 1000)), 0);
    const after = Math.max(0, lastTs - 86_400);
    const byId = new Map(cachedEvents.map((e) => [e.id, e]));
    const listingList: Listing[] = [];
    let floorWei: string | null;

    if (cfg.tokenIds) {
      for (const id of cfg.tokenIds) {
        for await (const raw of os.nftEvents(cfg.contract, id, after)) {
          const e = normalizeOsEvent(raw, cfg.contract);
          if (e) byId.set(e.id, e);
        }
        const best = await os.bestListing(slug, id);
        const n = best && normalizeListing(best, cfg.contract);
        if (n) listingList.push(n);
      }
      floorWei = listingList.length ? listingList.map((l) => BigInt(l.priceWei)).reduce((a, b) => (a < b ? a : b)).toString() : null;
    } else {
      for await (const raw of os.events(slug, after)) {
        const e = normalizeOsEvent(raw, cfg.contract);
        if (e) byId.set(e.id, e);
      }
      for await (const raw of os.listings(slug)) {
        const n = normalizeListing(raw, cfg.contract);
        if (n) listingList.push(n);
      }
      floorWei = await os.floorWei(slug);
    }
    const { description } = await os.collection(slug);
    const events = [...byId.values()];
    const listings = bestListings(listingList);
    writeJsonAtomic(evPath, events);
    writeJsonAtomic(lsPath, [...listings.values()]);
    writeJsonAtomic(metaPath, { floorWei, description });
    ctx.log(`  opensea: ${events.length} events, ${listings.size} listed`);
    return { status: 'ok', events, listings, floorWei, description };
  } catch (err) {
    ctx.log(`  opensea failed (${(err as Error).message}), using cache`);
    return cached('error');
  }
}

const isHtmlAnimation = (src: string) => /^data:text\/html|\.html?(\?|$)/i.test(src);

async function loadMedia(cfg: CollectionConfig, metas: Map<string, TokenMeta>, ctx: PipelineContext): Promise<CollectionState['media']> {
  const media: CollectionState['media'] = new Map();
  const safe = async (src: string) => {
    try {
      return await storeMedia(src, ctx.mediaDeps, ctx.manifest);
    } catch (err) {
      ctx.log(`  media failed for ${src.slice(0, 80)}: ${(err as Error).message}`);
      return null;
    }
  };
  for (const [id, m] of metas) {
    if (cfg.tokenIds && !cfg.tokenIds.includes(id)) continue;
    let image = m.image ? await safe(m.image) : null;
    if (!image && ctx.os) {
      const fallback = await ctx.os.nftImageUrl(cfg.contract, id).catch(() => null);
      if (fallback) image = await safe(fallback);
    }
    const animation = m.animation && isHtmlAnimation(m.animation) ? await safe(m.animation) : null;
    media.set(id, { image, animation });
  }
  return media;
}

export async function processCollection(cfg: CollectionConfig, ctx: PipelineContext): Promise<CollectionState> {
  const transfers = await loadTransfers(cfg, ctx);
  const metas = await loadMetas(cfg, ctx);
  const balances = buildBalances(transfers);
  const getTxValue = async (hash: string) => (ctx.txValues[hash] ??= await txValueWei(ctx.fetchJson, hash));
  const mints = await mintInfo(transfers, getTxValue);
  const os = await loadOpenSea(cfg, ctx);
  const events = mergeEvents(chainEvents(transfers), os.events);
  const media = await loadMedia(cfg, metas, ctx);
  return {
    cfg,
    transfers,
    metas,
    balances,
    events,
    mints,
    listings: os.listings,
    floorWei: os.floorWei,
    osDescription: os.description,
    media,
    ens: ensMap(transfers),
    osStatus: os.status,
  };
}
```

- [ ] **Step 8: Write `indexer/run.ts`**

```ts
import { join } from 'node:path';
import { buildActivity } from './aggregate/activity';
import { buildCollection, collectionYear, type CollectionOut } from './aggregate/collections';
import { buildKeepers } from './aggregate/keepers';
import { buildTimeline } from './aggregate/timeline';
import { buildTokens, carryOverMedia, type TokenOut } from './aggregate/tokens';
import { loadConfig } from './config';
import { createFetchJson } from './http';
import { createDownloader, gcMedia, type ManifestEntry } from './media';
import { createOpenSea } from './opensea';
import { processCollection, type CollectionState } from './pipeline/collection';
import { ethUsd } from './prices';
import { readJson, writeJsonAtomic } from './store';
import { validateSnapshot } from './validate';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);

async function main() {
  const config = loadConfig();
  const only = arg('only')?.split(',').map((s) => s.trim().toUpperCase()) ?? null;
  const outDir = arg('out') ?? 'data/catalog';
  const rawDir = 'data/raw';
  const mediaDir = 'public/media';
  const log = (m: string) => console.log(`[inventory] ${m}`);

  const fetchJson = createFetchJson();
  const apiKey = process.env.OPENSEA_API_KEY;
  const os = apiKey ? createOpenSea(createFetchJson({ minIntervalMs: 500 }), apiKey) : null;
  const download = createDownloader();
  const manifestPath = join(rawDir, 'media-manifest.json');
  const txValuesPath = join(rawDir, 'tx-values.json');
  const manifest = readJson<Record<string, ManifestEntry>>(manifestPath, {});
  const txValues = readJson<Record<string, string>>(txValuesPath, {});

  const selected = config.collections.filter((c) => !only || only.includes(c.code));
  const prevCollectionsAll = readJson<CollectionOut[] | null>(join(outDir, 'collections.json'), null);
  const prevCollections = prevCollectionsAll?.filter((p) => selected.some((c) => c.slug === p.slug)) ?? null;
  const prevTokens: Record<string, TokenOut[]> = {};
  for (const c of selected) prevTokens[c.slug] = readJson<TokenOut[]>(join(outDir, 'tokens', `${c.slug}.json`), []);

  const states: CollectionState[] = [];
  const collections: CollectionOut[] = [];
  const tokensBySlug: Record<string, TokenOut[]> = {};
  const ens = new Map<string, string>();

  for (const cfg of selected) {
    log(`${cfg.code} ${cfg.title}`);
    const st = await processCollection(cfg, {
      fetchJson,
      os,
      mediaDeps: { download, outDir: mediaDir, publicPrefix: '/media' },
      manifest,
      txValues,
      rawDir,
      log,
    });
    writeJsonAtomic(manifestPath, manifest);
    writeJsonAtomic(txValuesPath, txValues);
    for (const [a, n] of st.ens) ens.set(a, n);

    const year = collectionYear(st.mints);
    const tokens = carryOverMedia(
      buildTokens({ cfg, artist: config.artist, year, metas: st.metas, balances: st.balances, mints: st.mints, events: st.events, listings: st.listings, media: st.media, ens: st.ens }),
      prevTokens[cfg.slug],
    );
    const prev = prevCollectionsAll?.find((p) => p.slug === cfg.slug);
    const staleSince = st.osStatus === 'error' ? (prev?.staleSince ?? new Date().toISOString()) : null;
    collections.push(buildCollection({ cfg, artist: config.artist, year, tokens, balances: st.balances, floorWei: st.floorWei, osDescription: st.osDescription, staleSince }));
    tokensBySlug[cfg.slug] = tokens;
    states.push(st);
  }

  const { errors, missingMedia } = validateSnapshot(prevCollections, collections, prevTokens, tokensBySlug);
  if (errors.length) {
    for (const e of errors) console.error(`[inventory] ✗ ${e}`);
    process.exitCode = 1;
    return;
  }

  const indexOrder = collections
    .filter((c) => c.section === 'index')
    .sort((a, b) => (a.firstMint ?? '9999').localeCompare(b.firstMint ?? '9999'))
    .map((c) => c.code);
  const keepers = buildKeepers({
    artist: config.artist,
    ens,
    indexOrder,
    collections: states.map((s) => ({ cfg: s.cfg, transfers: s.transfers, balances: s.balances, events: s.events, tokens: tokensBySlug[s.cfg.slug] })),
  });
  const now = new Date();
  const timeline = buildTimeline({
    artist: config.artist,
    from: '2023-01',
    to: now.toISOString().slice(0, 7),
    collections: states.map((s) => ({ code: s.cfg.code, transfers: s.transfers })),
  });
  const activity = buildActivity(states.map((s) => ({ slug: s.cfg.slug, code: s.cfg.code, events: s.events, tokens: tokensBySlug[s.cfg.slug], ens })));

  writeJsonAtomic(join(outDir, 'collections.json'), collections);
  for (const [slug, tokens] of Object.entries(tokensBySlug)) writeJsonAtomic(join(outDir, 'tokens', `${slug}.json`), tokens);
  writeJsonAtomic(join(outDir, 'keepers.json'), keepers);
  writeJsonAtomic(join(outDir, 'timeline.json'), timeline);
  writeJsonAtomic(join(outDir, 'activity', 'latest.json'), activity.latest);
  for (const [month, rows] of Object.entries(activity.months)) writeJsonAtomic(join(outDir, 'activity', `${month}.json`), rows);
  writeJsonAtomic(join(outDir, 'meta.json'), {
    lastInventory: now.toISOString(),
    ethUsd: await ethUsd(fetchJson),
    sources: { blockscout: 'ok', opensea: !os ? 'skipped' : states.some((s) => s.osStatus === 'error') ? 'partial' : 'ok' },
    missingMedia,
    partial: Boolean(only),
  });

  if (!only) {
    const referenced = new Set<string>();
    for (const tokens of Object.values(tokensBySlug))
      for (const t of tokens) for (const p of [t.image?.thumb, t.image?.large, t.image?.file, t.animation?.file]) if (p) referenced.add(basename(p));
    const removed = gcMedia(mediaDir, referenced, manifest);
    writeJsonAtomic(manifestPath, manifest);
    log(`media gc removed ${removed} files`);
  }
  log(`done: ${collections.length} collections, ${keepers.length} keepers, ${missingMedia.length} tokens without media`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 9: Typecheck everything**

Run: `npm run typecheck`
Expected: exits 0. (If `indexer/.keep.ts` exists from Task 1, delete it now.)

- [ ] **Step 10: Smoke run against the real chain (no OpenSea key)**

Run: `npm run index -- --only SLV,366 --out tmp/catalog-smoke`
Expected:
- logs `SLV SILVER SURFER`, `366 WORTHLESS`, `done: 2 collections, ... keepers`
- `tmp/catalog-smoke/tokens/silver-surfer.json` has 3 tokens whose accessions are `GRF.23.SLV.001`–`GRF.23.SLV.003`
- `tmp/catalog-smoke/tokens/worthless.json` has 1 token with accession `GRF.25.366` and `supply` ≥ 300
- `tmp/catalog-smoke/meta.json` has `"opensea":"skipped"` and `"partial":true`
- `public/media/` contains `*-t.webp` and `*-l.webp` files

Check with:

```bash
node -e "const t=require('./tmp/catalog-smoke/tokens/silver-surfer.json');console.log(t.map(x=>x.accession),t.map(x=>!!x.image))"
node -e "const t=require('./tmp/catalog-smoke/tokens/worthless.json');console.log(t[0].accession,t[0].supply,t[0].holderCount)"
```

Expected: `[ 'GRF.23.SLV.001', 'GRF.23.SLV.002', 'GRF.23.SLV.003' ] [ true, true, true ]` and `GRF.25.366 <≥300> <holders>`.

- [ ] **Step 11: Full first inventory**

Run (takes a while the first time — full history plus media; later runs are incremental):

```bash
npm run index
```

Expected: `done: 17 collections, <N> keepers, <M> tokens without media`. Phigures and Gruffters may appear in `missingMedia` until an OpenSea key is configured (their original image hosts are offline); that is expected and does not fail the run. Open `data/catalog/meta.json` and `data/catalog/keepers.json` and sanity-check a few values against what you saw earlier (FACETS ≈ 2,222 supply, Vibes & Times ≈ 500 holders).

- [ ] **Step 12: Run all tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 13: Commit (code, then data)**

```bash
git add indexer tests
git commit -m "feat(indexer): pipeline, validation and inventory CLI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add data public/media
git commit -m "data: first inventory

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Scheduled inventory on GitHub Actions

**Files:**
- Create: `.github/workflows/inventory.yml`
- Test: `tests/indexer/workflow.test.ts`

**Interfaces:**
- Consumes: `npm test`, `npm run index`, repository secret `OPENSEA_API_KEY` (set by the user).
- Produces: a commit `inventory: <UTC timestamp>` every 6 hours when data changed.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

describe('inventory workflow', () => {
  const wf = parse(readFileSync('.github/workflows/inventory.yml', 'utf8'));

  it('runs every 6 hours and on demand', () => {
    expect(wf.on.schedule[0].cron).toBe('17 */6 * * *');
    expect(wf.on).toHaveProperty('workflow_dispatch');
  });

  it('tests before indexing and passes the OpenSea key', () => {
    const steps = wf.jobs.inventory.steps.map((s: { run?: string }) => s.run ?? '');
    expect(steps.indexOf('npm test')).toBeLessThan(steps.indexOf('npm run index'));
    const indexStep = wf.jobs.inventory.steps.find((s: { run?: string }) => s.run === 'npm run index');
    expect(indexStep.env.OPENSEA_API_KEY).toBe('${{ secrets.OPENSEA_API_KEY }}');
  });

  it('can push its commit', () => {
    expect(wf.permissions.contents).toBe('write');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/indexer/workflow.test.ts`
Expected: FAIL — ENOENT for `.github/workflows/inventory.yml`.

- [ ] **Step 3: Write `.github/workflows/inventory.yml`**

```yaml
name: inventory

on:
  schedule:
    - cron: '17 */6 * * *'
  workflow_dispatch: {}

permissions:
  contents: write

concurrency:
  group: inventory
  cancel-in-progress: false

jobs:
  inventory:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run index
        env:
          OPENSEA_API_KEY: ${{ secrets.OPENSEA_API_KEY }}
      - name: Commit snapshot
        run: |
          git config user.name "gruff-archive-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data public/media
          if git diff --cached --quiet; then echo "no changes"; exit 0; fi
          git commit -m "inventory: $(date -u +%Y-%m-%dT%H:%MZ)"
          git push
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/indexer/workflow.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/inventory.yml tests/indexer/workflow.test.ts
git commit -m "ci: inventory every 6 hours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand-off to the user (no code)**

The schedule only starts once the repo is on GitHub. Tell the user, in Turkish, the exact steps they do themselves (Claude never enters keys):
1. Create an empty GitHub repository (private is fine — the 6-hour job fits inside the free Actions minutes).
2. `git remote add origin <their repo url>` and `git push -u origin main` (Claude may run these two once the user gives the URL).
3. Get a free OpenSea API key from the OpenSea developer portal and add it in the repo under **Settings → Secrets and variables → Actions → New repository secret**, name `OPENSEA_API_KEY`.
4. Open **Actions → inventory → Run workflow** once and confirm it finishes green.

---

## Self-Review Notes

- Spec §2 catalog and codes → Task 2 config. §4.2 outputs → Tasks 9–11. §4.3 sources → Tasks 3, 6, 7, 11 (6529 API dropped: OpenSea per-NFT events/listing cover #366; spec updated). §4.4 media incl. gateway chain, OpenSea fallback, hash names, on-chain SVG/HTML, size caps → Task 8 + pipeline. §4.5 failure handling → validate (Task 11), cached fallbacks (pipeline), `staleSince`. Activity shards, keepers, timeline → Tasks 9–10. 6-hour schedule → Task 12.
- Live listing function, all pages, print label, scrubber UI, deploy → plan 2. Visitors' book / verified / back room → plan 3. Experiments → plan 4.
