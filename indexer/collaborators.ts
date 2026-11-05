/** Names after "collab w/", "collab with" or "collaboration with" in a token description. */
export function parseCollaborators(description: string | null): string[] {
  if (!description) return [];
  const m = description.match(/\bcollab(?:oration)?\s+(?:w\/\s*|with\s+)([^\r\n.;]*)/i);
  if (!m) return [];
  const names = m[1]
    .split(/\s*,\s*|\s+&\s+|\s+and\s+|\s+x\s+/i)
    .map((n) => n.trim().replace(/^@+/, '').trim())
    .filter(Boolean);
  return [...new Set(names)];
}
