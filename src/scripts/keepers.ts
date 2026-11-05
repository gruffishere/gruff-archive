import { compareKeepers, KEEPERS_SHOWN, matchesKeeper, type KeeperShape, type KeeperSort } from '../lib/keepers';

const list = document.getElementById('keepers');
const items = Array.from(list?.querySelectorAll<HTMLLIElement>('li.keeper') ?? []);
const note = document.getElementById('cap-note');
const showAllBtn = document.getElementById('show-all');
let showAll = false;
let query = '';

const shape = (li: HTMLLIElement): KeeperShape => ({
  name: li.dataset.name ?? '',
  pieces: Number(li.dataset.pieces ?? 0),
  works: Number(li.dataset.works ?? 0),
  collections: Number(li.dataset.collections ?? 0),
  since: li.dataset.since ?? '9999',
});

const render = () => {
  let visible = 0;
  let matches = 0;
  for (const li of items) {
    const match = matchesKeeper({ name: li.dataset.name ?? '' }, query);
    if (match) matches++;
    const show = match && (showAll || visible < KEEPERS_SHOWN);
    li.hidden = !show;
    if (show) visible++;
  }
  const capped = !showAll && matches > KEEPERS_SHOWN;
  if (note) {
    note.hidden = !capped || query === '';
    const count = note.querySelector('.count');
    if (count) count.textContent = `showing ${KEEPERS_SHOWN} of ${matches.toLocaleString('en-US')} matches`;
  }
  if (showAllBtn) showAllBtn.hidden = !capped || query !== '';
};

const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip[data-sort]'));
for (const chip of chips)
  chip.addEventListener('click', () => {
    for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
    const cmp = compareKeepers((chip.dataset.sort ?? 'pieces') as KeeperSort);
    const keyed = items.map((li) => [li, shape(li)] as const).sort((a, b) => cmp(a[1], b[1]));
    const frag = document.createDocumentFragment();
    keyed.forEach(([li], i) => {
      items[i] = li;
      const rank = li.querySelector('.rank');
      if (rank) rank.textContent = String(i + 1).padStart(2, '0');
      frag.append(li);
    });
    list?.append(frag);
    render();
  });

let timer: number | undefined;
document.getElementById('find')?.addEventListener('input', (e) => {
  const v = (e.target as HTMLInputElement).value;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    query = v.trim();
    render();
  }, 120);
});
const revealAll = () => {
  showAll = true;
  showAllBtn?.remove();
  if (note) note.hidden = true;
  render();
};
showAllBtn?.addEventListener('click', revealAll);
note?.querySelector('button')?.addEventListener('click', revealAll);
