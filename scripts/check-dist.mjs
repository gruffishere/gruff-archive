import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_FILES = 19_000;
const WARN_FILES = 15_000;
const MAX_BYTES = 25 * 1024 * 1024;
let files = 0;
let largest = { p: '', size: 0 };
const tooBig = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else {
      files++;
      if (s.size > largest.size) largest = { p, size: s.size };
      if (s.size > MAX_BYTES) tooBig.push(`${p} (${(s.size / 1048576).toFixed(1)} MiB)`);
    }
  }
};
walk('dist');
console.log(`[check-dist] ${files} files, largest ${largest.p} (${(largest.size / 1048576).toFixed(2)} MiB)`);
if (files > WARN_FILES) console.warn(`[check-dist] ⚠ ${files} files: past ${WARN_FILES}, the hard limit is ${MAX_FILES} (Cloudflare allows 20,000). Plan the single-template + _redirects fallback for the largest collection.`);
if (files > MAX_FILES) {
  console.error(`[check-dist] ✗ more than ${MAX_FILES} files`);
  process.exit(1);
}
if (tooBig.length) {
  console.error(`[check-dist] ✗ files over 25 MiB:\n${tooBig.join('\n')}`);
  process.exit(1);
}
