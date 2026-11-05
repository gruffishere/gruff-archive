import { timeAgo } from '../lib/format';

const els = Array.from(document.querySelectorAll<HTMLElement>('[data-ago]'));

function refresh() {
  const now = new Date();
  for (const el of els) if (el.dataset.ago && !Number.isNaN(Date.parse(el.dataset.ago))) el.textContent = timeAgo(el.dataset.ago, now);
}

if (els.length) {
  refresh();
  setInterval(refresh, 60_000);
}
