/** Earliest failure time while either source is failing, otherwise null. */
export function nextStaleSince(bs: 'ok' | 'error', os: 'ok' | 'skipped' | 'error', prev: string | null | undefined, now: Date): string | null {
  return bs === 'error' || os === 'error' ? (prev ?? now.toISOString()) : null;
}
