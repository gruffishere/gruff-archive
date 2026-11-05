# Task 3 report: leave gruff a note

Built: functions/lib/note.ts (validation, hashing, handlers), functions/api/note.ts (POST), functions/api/notes.ts (GET), src/components/NoteBox.astro + src/scripts/note.ts (card, included from Base.astro), src/pages/notes.astro + src/scripts/notes-page.ts (private ledger, noindex via new `head` slot in Base, no nav link), docs/deploy.md step "6b" (Turkish), tests/site/note-fn.test.ts (18 tests), tests/e2e/notes.spec.ts (5 tests, written not run; imports checkPage from ./helpers).

TDD: test file written first and ran red (module missing), then green after implementation. Full suite: 47 files / 426 tests pass; typecheck clean.

Security: rate limit 3/hour keyed by SHA-256(day|NOTES_KEY|ip), KV TTL 3600, only successful notes count; raw IP never stored (tested). Honeypot nonempty -> 400. GET needs Bearer NOTES_KEY, constant-time compare (hash both, XOR); unset/empty key never matches (401). Page must be a same-site path. Notes rendered with textContent only. All responses no-store.

Deviations/concerns:
- Not atomic rate limit (KV read-then-write); fine for abuse limiting.
- GET lists all note keys (up to 50 pages) then takes newest 200; fine at this scale.
- Base.astro got a `head` slot and NoteBox include (other agents may touch Base.astro; merge-sensitive).
- Card is fixed-position, never overflows. Smoke tests: any that use waitForTimeout (~1500ms at smoke.spec line ~509) finish before 4 s; only long-running tests or screenshots after 4 s could see the card (bottom right, may cover elements for click tests on phone viewport). Not run.

## Round 1 fixes
- Auth: client sends Bearer encodeURIComponent(key); server compares in constant time with encodeURIComponent(NOTES_KEY.trim()); Turkish key test; notes page shows "could not read notes" for unknown errors.
- POST hardening: 415 non-JSON, 403 foreign/missing Origin, 413 over 4096 (header and body), IPv6 /64 bucket, global 150/day counter (KV TTL), every KV call in try/catch giving 503, missing CF-Connecting-IP still works. Unit tests for each.
- Reader: inverted-time keys, one list(limit 200) call, sorted by `at` as a safety net.
- deploy.md IP wording softened; section role=dialog; 44px min-width on send/open/forget; text-transform none on card inputs, placeholders, send.
- e2e: added same-session no-reappear test. Results: vitest 47 files / 435 tests, typecheck clean, build ok, notes.spec 12/12 (phone+desktop).
