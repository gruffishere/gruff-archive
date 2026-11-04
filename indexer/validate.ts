import type { CollectionOut } from './aggregate/collections';
import { isPlaceholderMedia, type TokenOut } from './aggregate/tokens';

const hasMedia = (t: TokenOut) => !!(t.image || t.animation);

/** `--accept-drop a,b` / `ACCEPT_DROP=a,b`: comma separated collection slugs. */
export const parseAcceptDrop = (value: string | null | undefined): Set<string> =>
  new Set((value ?? '').split(',').map((s) => s.trim()).filter(Boolean));

/**
 * `skip`: placeholder-stripped token ids per slug. With `placeholderFiles` a skipped token is only exempt when its
 * previous media WAS the placeholder; without them every skipped token is exempt.
 * `accept`: slugs whose works-drop / disappeared / lost-media errors become warnings (the escape hatch for legitimate drops).
 */
export function validateSnapshot(
  prev: CollectionOut[] | null,
  next: CollectionOut[],
  prevTokens: Record<string, TokenOut[]>,
  nextTokens: Record<string, TokenOut[]>,
  skip: Record<string, Set<string>> = {},
  placeholderFiles: Record<string, Set<string>> = {},
  accept: ReadonlySet<string> = new Set(),
): { errors: string[]; warnings: string[]; accepted: string[]; missingMedia: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const accepted = new Set<string>();
  const missingMedia: string[] = [];
  const drop = (slug: string, msg: string) => {
    if (accept.has(slug)) {
      warnings.push(msg);
      accepted.add(slug);
    } else errors.push(msg);
  };

  const seen = new Set<string>();
  for (const c of next) {
    if (seen.has(c.slug)) errors.push(`${c.slug}: duplicate slug`);
    seen.add(c.slug);
  }

  for (const p of prev ?? []) {
    const n = next.find((c) => c.slug === p.slug);
    if (!n) drop(p.slug, `${p.slug}: collection disappeared`);
    else if (n.works < Math.floor(p.works * 0.9)) drop(p.slug, `${p.slug}: works dropped from ${p.works} to ${n.works}`);
  }

  for (const [slug, tokens] of Object.entries(nextTokens)) {
    const skipped = skip[slug];
    const files = placeholderFiles[slug];
    // A skipped token only counts as "had media" when that media is not the placeholder itself.
    const hadReal = (t: TokenOut) => {
      if (!hasMedia(t)) return false;
      if (!skipped?.has(t.id)) return true;
      if (!files) return false;
      return (!!t.image && !isPlaceholderMedia(t.image, files)) || (!!t.animation && !isPlaceholderMedia(t.animation, files));
    };
    const hadMedia = new Set((prevTokens[slug] ?? []).filter(hadReal).map((t) => t.id));
    const present = new Set(tokens.map((t) => t.id));
    for (const id of hadMedia) if (!present.has(id)) drop(slug, `${slug} #${id}: disappeared`);
    for (const t of tokens) {
      if (hasMedia(t)) continue;
      if (hadMedia.has(t.id)) drop(slug, `${slug} #${t.id}: lost its media`);
      else missingMedia.push(`${slug} #${t.id}`);
    }
  }
  return { errors, warnings, accepted: [...accepted], missingMedia };
}
