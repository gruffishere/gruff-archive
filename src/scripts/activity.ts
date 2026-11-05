const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip[data-kind]'));
const days = Array.from(document.querySelectorAll<HTMLElement>('.act .day'));
const empty = document.querySelector<HTMLElement>('.empty');
const rows = Array.from(document.querySelectorAll<HTMLElement>('.act .ev'));
for (const chip of chips)
  chip.addEventListener('click', () => {
    const k = chip.dataset.kind ?? 'all';
    for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
    for (const r of rows) r.hidden = k !== 'all' && r.dataset.kind !== k;
    for (const d of days) {
      let any = false;
      for (let n = d.nextElementSibling; n && !n.classList.contains('day'); n = n.nextElementSibling) if (!(n as HTMLElement).hidden) any = true;
      d.hidden = !any;
    }
    if (empty) empty.hidden = rows.some((r) => !r.hidden);
  });
