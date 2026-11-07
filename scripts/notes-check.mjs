// Prints the visitor notes ("leave gruff a note") that arrived since the last check, oldest first.
// Run: node --env-file=.env scripts/notes-check.mjs
// NOTES_KEY comes from .env (the artist writes it there; it is the same phrase as the Cloudflare secret). It is sent
// only to the site's own /api/notes and never printed. What was already reported is kept in
// .superpowers/notes-seen.json (git-ignored), so each note is reported once.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const STATE = '.superpowers/notes-seen.json';
const API = 'https://gruffarchive.art/api/notes';

const key = process.env.NOTES_KEY?.trim();
if (!key) {
  console.log('NOTES_KEY is not in .env yet: add the line NOTES_KEY=<the phrase set in Cloudflare> to read notes.');
  process.exit(2);
}

const seen = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { lastAt: '' };
let res;
try {
  res = await fetch(API, { headers: { authorization: `Bearer ${encodeURIComponent(key)}` }, cache: 'no-store' });
} catch (err) {
  console.log(`could not reach the notes (${err.message}); will try again next time.`);
  process.exit(1);
}
if (res.status === 401) {
  console.log('the site did not accept NOTES_KEY: the phrase in .env differs from the Cloudflare secret.');
  process.exit(1);
}
if (!res.ok) {
  console.log(`the notes answered ${res.status}; will try again next time.`);
  process.exit(1);
}
const { notes = [] } = await res.json();
const fresh = notes.filter((n) => String(n.at ?? '') > seen.lastAt).sort((a, b) => String(a.at).localeCompare(String(b.at)));
if (!fresh.length) {
  console.log(`no new notes (${notes.length} in total).`);
  process.exit(0);
}
console.log(`${fresh.length} new note${fresh.length === 1 ? '' : 's'} (${notes.length} in total):`);
for (const n of fresh) {
  const when = new Date(n.at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const who = n.name ? n.name : 'anonymous';
  console.log(`\n· ${when} · ${who}${n.country ? ` · ${n.country}` : ''} · page ${n.page ?? '/'}`);
  console.log(`  "${String(n.text).replace(/\s+/g, ' ').trim()}"`);
}
mkdirSync('.superpowers', { recursive: true });
writeFileSync(STATE, JSON.stringify({ lastAt: fresh.at(-1).at }, null, 2) + '\n');
