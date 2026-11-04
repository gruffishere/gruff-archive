export function accession(code: string, year: number, tokenId?: string, maxTokenId?: string, width?: number): string {
  const yy = String(year % 100).padStart(2, '0');
  const base = `GRF.${yy}.${code}`;
  if (tokenId === undefined) return base;
  const w = width ?? Math.max(3, (maxTokenId ?? tokenId).length);
  return `${base}.${tokenId.padStart(w, '0')}`;
}
