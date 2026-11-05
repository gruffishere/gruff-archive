import { countLabel } from '../lib/collections';
import { archiveAt, monthLabel, roomVisibleAt } from '../lib/timeline';
import type { TimelineMonth } from '../../indexer/aggregate/timeline';

const ledger = document.getElementById('ledger');
const rows = Array.from(ledger?.querySelectorAll<HTMLAnchorElement>('a.row') ?? []);
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip[data-filter]'));

export const state = { filter: 'all', hiddenByTime: new Set<string>() };

export function applyVisibility() {
  for (const r of rows) {
    const tags = (r.dataset.filters ?? '').split(' ');
    r.hidden = !tags.includes(state.filter) || state.hiddenByTime.has(r.dataset.code ?? '');
  }
}

for (const chip of chips)
  chip.addEventListener('click', () => {
    state.filter = chip.dataset.filter ?? 'all';
    for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
    applyVisibility();
  });

const pv = document.querySelector<HTMLElement>('.pv');
const img = document.getElementById('pv-img') as HTMLImageElement | null;
const set = (id: string, text: string) => {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
};
for (const r of rows) {
  const show = () => {
    if (!pv || !img || !r.dataset.preview) return;
    img.src = r.dataset.preview;
    set('pv-meta', r.dataset.meta ?? '');
    const title = document.getElementById('pv-title');
    if (title) {
      const artist = document.createElement('span');
      artist.className = 'lower';
      artist.textContent = 'gruff';
      title.replaceChildren(`${r.dataset.title ?? ''} — `, artist, `, ${r.dataset.year ?? ''}`);
    }
    const price = r.dataset.price ?? '';
    set('pv-price', price);
    for (const id of ['pv-listed-label', 'pv-price']) document.getElementById(id)?.toggleAttribute('hidden', !price);
    document.getElementById('pv-unlisted')?.toggleAttribute('hidden', !!price || !!r.dataset.since);
    pv.classList.add('on');
  };
  r.addEventListener('mouseenter', show);
  r.addEventListener('focus', show);
  const hide = () => pv?.classList.remove('on');
  r.addEventListener('mouseleave', hide);
  r.addEventListener('blur', hide);
}

const host = document.getElementById('scrubber');
if (host) {
  const tl = JSON.parse(host.dataset.timeline ?? '[]') as TimelineMonth[];
  const months = JSON.parse(host.dataset.months ?? '[]') as string[];
  if (months.length > 1) {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(months.length - 1);
    input.value = input.max;
    input.step = '1';
    input.setAttribute('aria-label', 'archive through time');
    host.append(input);
    const ticks = document.createElement('div');
    ticks.className = 'ticks';
    for (const [i, m] of months.entries())
      if (m.endsWith('-01')) {
        const s = document.createElement('span');
        s.textContent = m.slice(0, 4);
        const at = i / (months.length - 1);
        s.style.left = `${at * 100}%`;
        if (at < 0.04) s.className = 'first';
        else if (at > 0.96) s.className = 'last';
        ticks.append(s);
      }
    host.append(ticks);
    const originalWorks = new Map(rows.map((r) => [r.dataset.code ?? '', r.querySelector('[data-works]')?.textContent ?? '']));
    const originalKeepers = document.getElementById('count-keepers')?.textContent ?? '';
    const update = () => {
      const i = Number(input.value);
      const isNow = i === months.length - 1;
      const a = archiveAt(tl, months[i]);
      state.hiddenByTime = new Set(isNow ? [] : rows.filter((r) => (r.dataset.since ? !roomVisibleAt(r.dataset.since, months[i]) : !((r.dataset.code ?? '') in a.works))).map((r) => r.dataset.code ?? ''));
      for (const r of rows) {
        const cell = r.querySelector('[data-works]');
        if (cell) cell.textContent = isNow ? (originalWorks.get(r.dataset.code ?? '') ?? '') : String(a.works[r.dataset.code ?? ''] ?? 0);
      }
      const label = document.getElementById('scrub-label');
      if (label) label.textContent = isNow ? 'archive as of: now' : `archive as of: ${monthLabel(months[i])}`;
      const shown = rows.filter((r) => !state.hiddenByTime.has(r.dataset.code ?? ''));
      const nExp = shown.filter((r) => r.dataset.exp === 'true').length;
      const nCol = shown.length - nExp;
      const cc = document.getElementById('count-collections');
      if (cc) cc.textContent = countLabel(nCol, 'collection');
      const ce = document.getElementById('count-experiments');
      if (ce) ce.textContent = countLabel(nExp, 'experiment');
      document.getElementById('exp-count')?.toggleAttribute('hidden', nExp === 0);
      const ck = document.getElementById('count-keepers');
      if (ck) ck.textContent = isNow ? originalKeepers : String(a.holders);
      input.setAttribute('aria-valuetext', isNow ? 'now' : monthLabel(months[i]));
      applyVisibility();
    };
    input.setAttribute('aria-valuetext', 'now');
    input.addEventListener('input', update);
  }
}
