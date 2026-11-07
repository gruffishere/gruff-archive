import type { EventKind } from '../../indexer/types';

const WEI = 10n ** 18n;
const pad = (n: number) => String(n).padStart(2, '0');

export function formatEth(wei: string | null | undefined): string | null {
  if (wei == null) return null;
  const v = BigInt(wei);
  if (v === 0n) return '0 Ξ';
  const units = (v * 10_000n) / WEI;
  if (units === 0n) return '<0.0001 Ξ';
  const whole = units / 10_000n;
  const frac = (units % 10_000n).toString().padStart(4, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''} Ξ`;
}

export function formatUsd(wei: string | null | undefined, ethUsd: number | null | undefined): string | null {
  if (wei == null || ethUsd == null) return null;
  const eth = Number((BigInt(wei) * 1_000_000n) / WEI) / 1_000_000;
  const usd = eth * ethUsd;
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString('en-US')}`;
}

export const shortAddress = (a: string) => `${a.slice(0, 5)}…${a.slice(-3)}`;
export const displayName = (address: string, ens: string | null | undefined) => ens || shortAddress(address);

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}
export function formatMonth(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function timeAgo(iso: string, now: Date): string {
  const s = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function heldFor(sinceIso: string, now: Date): string {
  const a = new Date(sinceIso);
  let months = (now.getUTCFullYear() - a.getUTCFullYear()) * 12 + (now.getUTCMonth() - a.getUTCMonth());
  if (now.getUTCDate() < a.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}

export const eventLabel = (kind: EventKind, quantity: number) => (quantity > 1 ? `${kind} ×${quantity}` : kind);

export function mintValue(mint: { priceWei: string | null; primary: boolean }): string {
  if (mint.priceWei && mint.priceWei !== '0') return formatEth(mint.priceWei) ?? '—';
  return mint.primary ? 'free' : '—';
}

/** Absolute UTC stamp, the no-JS fallback for relative times: "05.11.2026 14:02". */
export function formatStamp(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)} utc`;
}
