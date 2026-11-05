# gruff archive: Site follow-ups 3 (plan 2.3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Write the failing test first for every pure function.

**Goal:** the artist's third review (2026-11-06):
- the trailer lives only inside Pulverulents;
- room dates show in the index's left column;
- the catalog wall is a random pool on every visit;
- visitors can leave gruff a short note, which the artist reads privately.

## Global Constraints

Everything in `docs/superpowers/plans/2026-11-05-gruff-site-followups.md` → "Global Constraints" still applies:
- `gruff` is always lowercase;
- big price only for real listings;
- relative times through `[data-ago]`;
- `:global` for runtime DOM;
- untrusted HTML only in `sandbox="allow-scripts"` iframes;
- 44 px targets;
- no horizontal scroll from 360 px;
- the site never writes `public/media/` or `data/`;
- no secrets in git.

Free tier only (Cloudflare Pages, Functions, KV). No paid service, no tracking, no third-party scripts.

---

### Task 1: Trailer only inside Pulverulents; room dates on the left

1. **Remove the `pulverulents-trailer` room** from `src/lib/rooms.ts`, /experiments, the index and the e2e expectations.
   - Delete its page and `public/exp/pulverulents-trailer/`.
   - Keep the trailer block on `/c/pulverulents/` and the `trailer ↗` link on Pulverulents work labels.
   - Make the old URL `/experiments/pulverulents-trailer/` redirect to `/c/pulverulents/`, using the same static meta-refresh pattern as the strung-deck redirect.
2. **Room dates in the left column.**
   - On the index ledger, room rows show their date in the `no` column, the one collections use for their accession, instead of `—`. Format it `DD.MM.YYYY` when the room has a `date`, `MM.YYYY` when it only has `since`, and `—` when it has neither.
   - On /experiments room cards, the first line, where collections show their accession, shows the same date. The medium moves to the meta line, e.g. `2026 · web/6529 · live`, or with a date `23.04.2026 · web/6529 · live`, without repeating the year.
   - Set the dive bar room's `date: 2026-10-30`. That is the date it was submitted to The Memes, per the project's own notes.
   - Playing Cards keeps no date for now.
3. **Tests:**
   - Unit-test the date-label helper: full date, month only, none.
   - e2e: the index rows for The Sigils and I LOVE PURE CHAOS show `23.04.2026` and `18.05.2026` in the `.no` cell; /experiments lists 6 items; the trailer room URL redirects to `/c/pulverulents/`; the Pulverulents collection page still shows the trailer block.

### Task 2: The catalog wall is a random pool

The artist wants the wall to draw random pieces and hang them in a random order on every visit, so it feels like a pool.

1. **Pool at build.**
   - Emit `public` data for the catalog page, as a JSON file such as `/catalog/pool.json` written by the page build, or inline only if small. Each pool item carries what a tile needs: `slug`, `id`, `title`, `collection`, `thumb`, `large`, `w`, `h`, `kind`, `hover`, `pixelated`, `iframe src`, and `href`.
   - The pool contains every displayable non-generative work, plus up to 60 displayable works per generative collection, spread evenly across ids.
   - Keep the existing dedupe (no repeated image) and the measured dimensions (unmeasurable pieces are dropped).
   - Report the pool size and the JSON size, gzip included.
2. **Each visit.** The client draws a fresh wall:
   - 5 random pieces from each generative collection's pool;
   - a random sample of the non-generative pool, so the wall holds about 80 pieces in total, or all of them if fewer exist;
   - a random shuffle;
   - then the existing `salonLayout`.
   - Use `crypto.getRandomValues` for the seed.
   - Within one visit, resizing keeps the same draw and only re-hangs it.
   - Layout determinism stays: same seed, same width, same wall.
3. **No-JS fallback.** The server-rendered fallback keeps today's deterministic selection, so the page works without scripts. The client replaces it with the random draw.
4. **Hover GIFs, iframes (sandboxed, `pointer-events: none`) and lazy images** keep working for drawn pieces.
5. **Tests.**
   - Unit: the draw function (pure, seeded) gives 5 per generative collection when available, the right total, no duplicates, and different seeds give different draws.
   - e2e: two page loads give different piece sets (compare `data-slug`/id lists), no overlaps, and clicking a tile opens its work page.

### Task 3: "leave gruff a note"

A short, quiet note box that invites visitors to leave the artist a note. Notes are kept server-side and read by the artist on a private page.

1. **UI** (`src/components/NoteBox.astro` + `src/scripts/note.ts`, included from `Base.astro`).
   - About 4 s after a page loads, a small card slides in at the bottom right (on phones, a bottom sheet). It is non-modal, so focus is not stolen.
   - Copy, lowercase and quiet:
     - title: `leave gruff a note`
     - textarea placeholder: `a word, a thought, a hello`
     - optional input: `name or @handle`
     - buttons: `send` and `×` (aria-label `close`)
   - After sending, the card reads `thank you. gruff will read it.` and fades out after a few seconds.
   - It appears at most once per visitor. Once dismissed or sent, it never comes back (`localStorage`, wrapped in try/catch). If the visitor ignores it, it may come back on a later visit, but never twice in one session (`sessionStorage`).
   - It never shows on `/notes/`, on room app pages (`/exp/…`), or when `prefers-reduced-motion` is set (it then appears without sliding).
   - Text limit: 500 characters, with a quiet counter near the limit. Name limit: 40.
   - Add a hidden honeypot field.
   - The card has its own `role="dialog"` with `aria-label`, `.hit` targets, and works at 360 px.
   - Never send any data until the visitor presses `send`.
2. **Function `functions/api/note.ts`.**
   - `POST` with `{ text, name, hp, page }`.
   - Validate:
     - `text` is 1–500 chars after trim;
     - `name` is at most 40 chars;
     - `hp` must be empty;
     - `page` is a same-site path of at most 200 chars.
   - Rate limit: at most 3 notes per hour per visitor, keyed by a SHA-256 of the IP plus a daily salt, stored in KV with a TTL. Never store the raw IP.
   - Store in the KV binding `NOTES` under key `note:<ISO time>:<random>`. The value is JSON `{ text, name, page, at, country }`, where `country` comes from `request.cf?.country` and is optional.
   - Responses:
     - 201 on success;
     - 400 for invalid input;
     - 429 when rate limited;
     - 503 when the `NOTES` binding is missing (before the artist sets it up, and in local preview).
   - The client shows `could not send right now` on any non-201.
3. **Reading notes.**
   - `GET functions/api/notes.ts` requires `Authorization: Bearer <NOTES_KEY>` (env secret set by the artist in Cloudflare, never committed). The comparison is constant-time.
   - It returns the newest 200 notes, sorted newest first.
   - The page `/notes/` is static, with `noindex` and no nav link. It asks for the key once, keeps it in `localStorage` after a successful fetch, shows the notes as a quiet ledger (date, name, page, text, rendered as text and never as HTML), and has a `forget key` button.
4. **Deploy guide** (`docs/deploy.md`, Turkish, plain): a new step after the OpenSea step.
   - In Cloudflare → Storage → KV, create a namespace `gruff-notes`.
   - In the Pages project → Settings → Bindings, add a KV binding named `NOTES`.
   - Add a secret `NOTES_KEY`, a long random phrase the artist chooses.
   - Then open `/notes/` and enter the key once.
   - Mention that the notes stay in the artist's Cloudflare account, are free up to generous limits, and store no IP addresses.
5. **Tests.**
   - Unit (`tests/site/note-fn.test.ts`), with a fake KV that supports `put`/`get`/`list`/TTL:
     - validation;
     - honeypot;
     - rate limit;
     - 503 without a binding;
     - the auth check (missing or wrong key → 401);
     - ordering;
     - that no raw IP is stored.
   - e2e:
     - the card appears after the delay on `/`;
     - `×` hides it, and it doesn't reappear on reload;
     - sending against a mocked `/api/note` (`page.route` → 201) shows the thank-you;
     - it never appears on `/notes/`.

   The `checkPage` console-error rule must still hold.

### Task 4: one "keepers" row that opens the list (work pages)

The artist: rows like "holds 4 · x", "holds 3 · y" on edition work pages are confusing and tiring to read. Show one tab instead: `keepers` with the count, which opens the current keepers list below.

1. In `src/components/WallLabel.astro`, edition tokens (erc1155) with more than one holder replace the `holds N` owner rows with one row: `keepers ……… 51 ▾`. It is a native `<details><summary>` so it works without JS, with a `.hit` target.
2. Opening it reveals the full current owner list for that token (`t.owners`), sorted by quantity then name. Each line shows the display name (ENS or `0x7a3…e91`, lowercase) on the left and the quantity on the right, with a dotted leader, in the same ledger style. Each name links to Etherscan's address page (`target="_blank" rel="noopener"`). Escrowed owners keep any existing marker.
3. A single-owner token keeps the current `owner ……… name` row. A 721 keeps its owner row.
4. Long lists (more than 30) scroll inside the panel (max-height plus overflow) rather than stretching the label. Use the global `.lower` class for names.
5. The print label keeps its current `keepers N` line.
6. Tests:
   - Unit-test the owner-sort helper.
   - e2e: `/w/collabs/1/` shows one `keepers` summary; opening it shows as many rows as the token has owners; no `holds` rows remain.
