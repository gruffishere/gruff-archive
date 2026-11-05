export type CommentaryBlock =
  | { type: 'p'; text: string }
  | { type: 'label'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'sign'; text: string };

/** Splits the artist's commentary (plain text: paragraphs, "Label:" lines, "- " lists, a final "- name" signature)
 *  into blocks. It never rewrites a word. */
export function parseCommentary(md: string): CommentaryBlock[] {
  const chunks = md.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const blocks: CommentaryBlock[] = [];
  chunks.forEach((chunk, i) => {
    const lines = chunk.split('\n');
    if (lines.every((l) => l.startsWith('- '))) {
      const items = lines.map((l) => l.slice(2).trim());
      if (i === chunks.length - 1 && items.length === 1) blocks.push({ type: 'sign', text: items[0] });
      else blocks.push({ type: 'list', items });
    } else if (lines.length === 1 && /^[A-Za-z][A-Za-z ]{0,40}:$/.test(lines[0])) blocks.push({ type: 'label', text: lines[0] });
    else blocks.push({ type: 'p', text: lines.join(' ') });
  });
  return blocks;
}
