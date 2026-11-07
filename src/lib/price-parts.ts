/**
 * A big price is written as the number, then " Ξ" in a smaller span. The site's type is monospaced, so at 44px a plain
 * space before Ξ reads as a wide gap (the artist, 2026-11-07); inside the smaller span the space shrinks with the symbol.
 * The text stays "0.035 Ξ" for anyone reading or copying it.
 */
export function ethParts(text: string): { num: string; cur: string } | null {
  const m = /^(.*\S)\s+Ξ$/.exec(text);
  return m ? { num: m[1]!, cur: ' Ξ' } : null;
}

/** The same, written into an element at runtime (live price, index preview). */
export function writePrice(el: HTMLElement, text: string): void {
  const p = ethParts(text);
  if (!p) {
    el.textContent = text;
    return;
  }
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = p.num;
  const cur = document.createElement('span');
  cur.className = 'cur';
  cur.textContent = p.cur;
  el.replaceChildren(num, cur);
}
