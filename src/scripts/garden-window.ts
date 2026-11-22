import { gardenTarget, gardenUrl } from '../lib/garden';
import { EMBED_ALLOW, embedSandbox } from '../lib/rooms';

for (const host of document.querySelectorAll<HTMLElement>('[data-garden]')) {
  const stage = host.querySelector<HTMLElement>('.stage');
  const poster = host.querySelector<HTMLButtonElement>('button.poster');
  const form = host.querySelector<HTMLFormElement>('form.visit');
  const input = form?.querySelector<HTMLInputElement>('input');
  const hint = form?.querySelector<HTMLElement>('.hint');
  const base = host.dataset.base;
  const start = host.dataset.start;
  if (!stage || !poster || !form || !input || !hint || !base || !start) continue;

  const open = (who: string) => {
    const src = gardenUrl(base, who);
    let frame = stage.querySelector<HTMLIFrameElement>('iframe.frame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'frame';
      // glyphoras.art is another origin: allow-same-origin only gives it its own origin back, never ours
      frame.setAttribute('sandbox', embedSandbox(src, location.origin));
      frame.setAttribute('allow', EMBED_ALLOW);
      frame.setAttribute('referrerpolicy', 'no-referrer');
      stage.replaceChildren(frame);
    }
    frame.title = `${host.dataset.title ?? 'garden'}: ${who}`;
    frame.src = src;
    frame.focus();
  };

  poster.addEventListener('click', () => open(start));
  input.addEventListener('input', () => (hint.textContent = ''));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const who = gardenTarget(input.value);
    if (!who) {
      hint.textContent = 'an address (0x…) or an ens name (name.eth)';
      input.focus();
      return;
    }
    hint.textContent = '';
    open(who);
    stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
