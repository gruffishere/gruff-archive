// Checks that gruffarchive.art is healthy and says so only when something changes (a new problem, or a fix).
// Run: node scripts/site-watch.mjs
// Checks: the home page, the live price function, the catalog pool, and the scheduled inventory on GitHub (its last
// run failed, or no run succeeded for over 13 hours). State lives in .superpowers/watch-state.json (git-ignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://gruffarchive.art';
const REPO = 'gruffishere/gruff-archive';
const STATE = '.superpowers/watch-state.json';
const PUL = '0x29457b2b50d3da1ca6c356f82212f65d283c09e6';

const get = async (url, init) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
};

const problems = {};
const check = async (name, fn) => {
  try {
    const issue = await fn();
    if (issue) problems[name] = issue;
  } catch (err) {
    problems[name] = `unreachable (${err.name === 'AbortError' ? 'timed out' : err.message})`;
  }
};

await check('home page', async () => {
  const r = await get(`${SITE}/`);
  if (!r.ok) return `answered ${r.status}`;
  if (!(await r.text()).includes('gruff')) return 'answered, but without the site in it';
});
await check('live price', async () => {
  const r = await get(`${SITE}/api/listing?contract=${PUL}&id=1`);
  if (!r.ok) return `answered ${r.status}`;
  const j = await r.json();
  if (!('listing' in j)) return 'answered without a listing field';
});
await check('catalog pool', async () => {
  const r = await get(`${SITE}/catalog/pool.json`);
  if (!r.ok) return `answered ${r.status}`;
});
await check('scheduled inventory', async () => {
  const r = await get(`https://api.github.com/repos/${REPO}/actions/runs?per_page=10`, { headers: { accept: 'application/vnd.github+json' } });
  if (!r.ok) return null; // GitHub's own hiccup or rate limit: not a site problem
  const runs = (await r.json()).workflow_runs ?? [];
  const done = runs.filter((x) => x.status === 'completed');
  const last = done[0];
  if (last && last.conclusion !== 'success') return `last run ${last.conclusion} (${last.created_at}): ${last.html_url}`;
  const ok = done.find((x) => x.conclusion === 'success');
  if (ok && Date.now() - Date.parse(ok.created_at) > 13 * 3600_000) return `no successful run since ${ok.created_at}`;
});

const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { problems: {} };
const lines = [];
for (const [name, issue] of Object.entries(problems)) if (prev.problems[name] !== issue) lines.push(`PROBLEM · ${name}: ${issue}`);
for (const name of Object.keys(prev.problems)) if (!problems[name]) lines.push(`FIXED · ${name} is fine again`);
mkdirSync('.superpowers', { recursive: true });
writeFileSync(STATE, JSON.stringify({ problems, at: new Date().toISOString() }, null, 2) + '\n');
console.log(lines.length ? lines.join('\n') : Object.keys(problems).length ? 'no change (known problems still open)' : 'site ok');
