import { describe, expect, it } from 'vitest';
import { archiveAt, monthLabel } from '../../src/lib/timeline';

const tl = [
  { month: '2023-01', collections: [{ code: 'VBS', works: 2 }], holders: 10 },
  { month: '2023-02', collections: [{ code: 'VBS', works: 3 }, { code: 'ONE', works: 1 }], holders: 25 },
];

describe('archiveAt', () => {
  it('returns the archive at a month', () => {
    expect(archiveAt(tl, '2023-02')).toEqual({ month: '2023-02', works: { VBS: 3, ONE: 1 }, holders: 25 });
  });
  it('uses the latest month not after the requested one', () => {
    expect(archiveAt(tl, '2023-05').holders).toBe(25);
  });
  it('is empty before the archive began', () => {
    expect(archiveAt(tl, '2022-12')).toEqual({ month: '2022-12', works: {}, holders: 0 });
  });
  it('labels months', () => {
    expect(monthLabel('2023-02')).toBe('02.2023');
  });
});
