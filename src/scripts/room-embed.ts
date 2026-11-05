import { EMBED_ALLOW, embedSandbox } from '../lib/rooms';

for (const host of document.querySelectorAll<HTMLElement>('[data-embed]')) {
  const poster = host.querySelector<HTMLButtonElement>('button.poster');
  const src = host.dataset.src;
  if (!poster || !src) continue;
  poster.addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.className = 'frame';
    frame.title = host.dataset.title ?? 'experiment';
    // third-party origin (arweave.net, github.io): allow-same-origin only gives the framed page its own origin back,
    // it can never reach ours. embedSandbox drops it for any frame that would sit on our own origin.
    frame.setAttribute('sandbox', embedSandbox(src, location.origin));
    frame.setAttribute('allow', EMBED_ALLOW);
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.src = src;
    host.replaceChildren(frame);
    frame.focus();
  });
}
