/** What the garden window accepts: a wallet address or an ENS name, lowercased; anything else is null. */
export function gardenTarget(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(v)) return v;
  if (/^([a-z0-9-]+\.)+eth$/.test(v)) return v;
  return null;
}

export const gardenUrl = (base: string, who: string) => base + encodeURIComponent(who);
