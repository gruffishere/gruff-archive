import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJson, recoverDir, swapDir, writeJsonAtomic } from '../../indexer/store';

describe('store', () => {
  it('round-trips json and falls back when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-'));
    expect(readJson(join(dir, 'nope.json'), { a: 1 })).toEqual({ a: 1 });
    writeJsonAtomic(join(dir, 'deep', 'x.json'), { b: 2 });
    expect(readJson(join(dir, 'deep', 'x.json'), null)).toEqual({ b: 2 });
  });

  it('swapDir replaces the target with the staged dir and leaves no leftovers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swap-'));
    const out = join(dir, 'catalog');
    mkdirSync(out);
    writeFileSync(join(out, 'old.txt'), 'old');
    mkdirSync(join(dir, 'catalog.tmp'));
    writeFileSync(join(dir, 'catalog.tmp', 'new.txt'), 'new');
    swapDir(join(dir, 'catalog.tmp'), out);
    expect(readFileSync(join(out, 'new.txt'), 'utf8')).toBe('new');
    expect(existsSync(join(out, 'old.txt'))).toBe(false);
    expect(existsSync(join(dir, 'catalog.tmp'))).toBe(false);
    expect(existsSync(join(dir, 'catalog.old'))).toBe(false);
  });

  it('swapDir works when the target does not exist yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swap-'));
    mkdirSync(join(dir, 'c.tmp'));
    swapDir(join(dir, 'c.tmp'), join(dir, 'c'));
    expect(existsSync(join(dir, 'c'))).toBe(true);
  });

  it('swapDir restores <target>.old when the target is missing (crash recovery)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swap-'));
    const out = join(dir, 'catalog');
    mkdirSync(`${out}.old`);
    writeFileSync(join(`${out}.old`, 'keep.txt'), 'keep');
    // staged dir missing (crash before it was written): the old content must survive
    expect(() => swapDir(join(dir, 'catalog.tmp'), out)).toThrow();
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe('keep');
  });

  it('recoverDir restores <target>.old when the target is missing, and is a no-op otherwise', () => {
    const dir = mkdtempSync(join(tmpdir(), 'swap-'));
    const out = join(dir, 'catalog');
    mkdirSync(`${out}.old`);
    writeFileSync(join(`${out}.old`, 'keep.txt'), 'keep');
    recoverDir(out);
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe('keep');
    expect(existsSync(`${out}.old`)).toBe(false);
    mkdirSync(`${out}.old`);
    recoverDir(out);
    expect(existsSync(`${out}.old`)).toBe(true);
  });
});

describe('writeJsonIfChanged (I4)', () => {
  it('writes only when the serialised content differs', async () => {
    const { writeJsonIfChanged } = await import('../../indexer/store');
    const { statSync, utimesSync } = await import('node:fs');
    const dir = mkdtempSync(join(tmpdir(), 'store-'));
    const p = join(dir, 'x.json');
    expect(writeJsonIfChanged(p, { a: 1 })).toBe(true);
    utimesSync(p, new Date(1000), new Date(1000));
    expect(writeJsonIfChanged(p, { a: 1 })).toBe(false);
    expect(statSync(p).mtimeMs).toBe(1000);
    expect(writeJsonIfChanged(p, { a: 2 })).toBe(true);
    expect(readJson(p, null)).toEqual({ a: 2 });
  });
});
