import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

/** Writes only when the serialised content differs from the file on disk; returns whether it wrote. */
export function writeJsonIfChanged(path: string, data: unknown): boolean {
  const text = JSON.stringify(data);
  try {
    if (readFileSync(path, 'utf8') === text) return false;
  } catch {
    // missing or unreadable: write it
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return true;
}

/** Crash recovery: a swap interrupted between its two renames leaves `<target>.old` and no `<target>`; put the old content back. */
export function recoverDir(target: string): void {
  const old = `${target}.old`;
  if (!existsSync(target) && existsSync(old)) renameSync(old, target);
}

/** Replaces `target` with the fully written `staged` dir; the old content is only dropped after the new one is in place. */
export function swapDir(staged: string, target: string): void {
  recoverDir(target);
  if (!existsSync(staged)) throw new Error(`swapDir: staged dir ${staged} is missing`);
  const old = `${target}.old`;
  rmSync(old, { recursive: true, force: true });
  if (existsSync(target)) renameSync(target, old);
  renameSync(staged, target);
  rmSync(old, { recursive: true, force: true });
}
