import { fetchLiveHtml } from '../lib/live-work';

for (const host of document.querySelectorAll<HTMLElement>('[data-live]')) {
  const screen = host.querySelector<HTMLElement>('.screen');
  const play = host.querySelector<HTMLButtonElement>('button.play');
  const note = host.querySelector<HTMLElement>('.note');
  const { contract, id } = host.dataset;
  if (!screen || !play || !note || !contract || !id) continue;

  play.addEventListener('click', async () => {
    const box = screen.getBoundingClientRect();
    play.disabled = true;
    play.textContent = 'reading the chain…';
    const html = await fetchLiveHtml(contract, id);
    if (!html) {
      play.disabled = false;
      play.textContent = 'play ▶';
      note.textContent = 'the chain could not be reached. try again.';
      return;
    }
    const frame = document.createElement('iframe');
    frame.className = 'livef';
    frame.title = `${host.dataset.title ?? 'work'}, live`;
    // the page runs with scripts only: no same-origin, so it can never reach this site
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.style.aspectRatio = box.width && box.height ? `${box.width} / ${box.height}` : '3 / 4';
    frame.srcdoc = html;
    screen.replaceChildren(frame);
    play.hidden = true;
    note.textContent = 'live from the chain';
    frame.focus();
  });
}
