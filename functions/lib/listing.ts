export function parseQuery(url: URL): { contract: string; id: string } | null {
  const contract = (url.searchParams.get('contract') ?? '').toLowerCase();
  const id = url.searchParams.get('id') ?? '';
  if (!/^0x[0-9a-f]{40}$/.test(contract) || !/^\d{1,78}$/.test(id)) return null;
  return { contract, id };
}
