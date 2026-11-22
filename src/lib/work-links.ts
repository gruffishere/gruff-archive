/** A collection's per-work links with {id} and {owner} filled; a link that needs an owner is left out when the work
 *  has no single owner. */
export function fillWorkLinks(links: { label: string; url: string }[], w: { id: string; owner: string | null }): { label: string; url: string }[] {
  return links.flatMap((l) => {
    if (l.url.includes('{owner}') && !w.owner) return [];
    return [{ label: l.label, url: l.url.replaceAll('{id}', encodeURIComponent(w.id)).replaceAll('{owner}', encodeURIComponent(w.owner ?? '')) }];
  });
}
