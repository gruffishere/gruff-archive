import './print-label';
import { livePrice } from '../lib/live-price';
import { openseaItem } from '../lib/links';
import { formatUsd } from '../lib/format';

const usdOf = (wei: string, rate: number) => formatUsd(wei, rate) ?? '';

window.addEventListener('keydown', (e) => {
  if ((e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  const rel = e.key === 'ArrowLeft' ? 'prev' : e.key === 'ArrowRight' ? 'next' : null;
  const link = rel ? document.querySelector<HTMLAnchorElement>(`a[rel=${rel}]`) : null;
  if (link) window.location.href = link.href;
});

for (const b of document.querySelectorAll<HTMLButtonElement>('button[data-copy]'))
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy ?? '');
      b.dataset.label ??= b.textContent ?? '';
      b.textContent = 'copied';
      window.clearTimeout(Number(b.dataset.timer));
      b.dataset.timer = String(window.setTimeout(() => (b.textContent = b.dataset.label ?? ''), 1200));
    } catch {
      // clipboard blocked — nothing to do
    }
  });

const priceEl = document.getElementById('live-price');
if (priceEl?.dataset.contract) {
  const { contract, id = '', snapshot = '', sold = '', soldAt = '' } = priceEl.dataset;
  fetch(`/api/listing?${new URLSearchParams({ contract, id })}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ listing: { priceWei: string } | null }>) : Promise.reject(new Error(String(r.status)))))
    .then(({ listing }) => {
      const view = livePrice({ snapshot, listing, lastSale: sold ? { priceWei: sold, date: soldAt } : null });
      if (!view) return;
      priceEl.textContent = view.text;
      priceEl.classList.toggle('none', view.none);
      priceEl.classList.toggle('sold', view.sold);
      const usd = document.getElementById('live-usd');
      const rate = Number(usd?.dataset.rate);
      if (usd) usd.textContent = !view.none && !view.sold && listing && rate > 0 ? usdOf(listing.priceWei, rate) : '';
      const label = document.getElementById('price-label');
      if (label) label.textContent = view.label;
      const note = document.getElementById('price-note');
      if (!note) return;
      if (view.note === 'live') note.textContent = 'live';
      else {
        const a = document.createElement('a');
        a.className = 'offer hit';
        a.href = openseaItem(contract, id);
        a.rel = 'noopener';
        a.target = '_blank';
        a.textContent = 'make offer ↗';
        note.replaceChildren(a);
      }
    })
    .catch(() => {
      // keep the snapshot price and its "as of" note
    });
}
