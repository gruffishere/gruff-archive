import { describe, expect, it } from 'vitest';
import { nextStaleSince } from '../../indexer/pipeline/status';

const now = new Date('2026-11-05T00:00:00Z');

describe('nextStaleSince', () => {
  it('is null when both sources are fine or skipped', () => {
    expect(nextStaleSince('ok', 'ok', '2026-01-01T00:00:00Z', now)).toBeNull();
    expect(nextStaleSince('ok', 'skipped', null, now)).toBeNull();
  });
  it('is set when either source failed, keeping the earliest value', () => {
    expect(nextStaleSince('error', 'ok', null, now)).toBe(now.toISOString());
    expect(nextStaleSince('ok', 'error', null, now)).toBe(now.toISOString());
    expect(nextStaleSince('error', 'error', '2026-10-01T00:00:00Z', now)).toBe('2026-10-01T00:00:00Z');
  });
});
