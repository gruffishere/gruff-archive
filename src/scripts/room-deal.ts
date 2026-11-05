import { cardCaption, dealHand, firstHand, mulberry32, settlePending, type Card } from '../lib/deal';

// player.js (the project's canvas player) is a classic script that defines runMachine as a global.
interface Machine { loop: number }
interface Player { drawAt(t: number): void; stop(): void }
type RunMachine = (canvas: HTMLCanvasElement, machine: Machine, opt: { width: number; play: boolean }) => Promise<Player>;
interface Live { player: Player; slot: HTMLElement; visible: boolean; t0: number }

const GEN = '/exp/strung-deck/gen.js';
const PLAYER = '/exp/strung-deck/player.js';
const root = document.querySelector<HTMLElement>('[data-deal]');
const table = root?.querySelector<HTMLElement>('[data-table]');
const status = root?.querySelector<HTMLElement>('[data-status]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let worker: Worker | null = null;
let playerReady: Promise<void> | null = null;
let generation = 0;
let live: Live[] = [];
let raf = 0;
let dealt = 0;
let nextId = 1;
const pending = new Map<number, (m: { machine?: Machine; error?: string }) => void>();

function startWorker() {
  if (worker) return worker;
  const w = new Worker(GEN);
  worker = w;
  // a worker that dies never answers: settle everything waiting on it so the deal ends instead of hanging
  w.onerror = () => resetWorker('worker');
  w.onmessageerror = () => resetWorker('worker');
  w.onmessage = (e: MessageEvent<{ id: number; machine?: Machine; error?: string }>) => {
    const done = pending.get(e.data.id);
    if (done) {
      pending.delete(e.data.id);
      done(e.data);
    }
  };
  return w;
}
function resetWorker(error: string) {
  worker?.terminate();
  worker = null;
  settlePending(pending, error);
}
const render = (c: Card) =>
  new Promise<{ machine?: Machine; error?: string }>((res) => {
    const id = nextId++;
    pending.set(id, res);
    startWorker().postMessage({ id, seed: c.seed, opts: { deck: c.deck, rank: c.rank, suit: c.suit, eyes: true, machine: true, motion: 'caustic' } });
  });
function loadPlayer() {
  playerReady ??= new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = PLAYER;
    s.onload = () => res();
    s.onerror = () => rej(new Error('player'));
    document.head.append(s);
  });
  return playerReady;
}

// One clock for every card; a card draws only while it is on screen and the tab is visible.
const running = () => !document.hidden && !reduced.matches && live.some((l) => l.visible);
function frame(now: number) {
  raf = 0;
  for (const l of live) if (l.visible) l.player.drawAt((now - l.t0) / 1000);
  if (running()) raf = requestAnimationFrame(frame);
}
const wake = () => {
  if (!raf && running()) raf = requestAnimationFrame(frame);
};
document.addEventListener('visibilitychange', wake);
reduced.addEventListener('change', wake);
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const l = live.find((x) => x.slot === e.target);
    if (l) l.visible = e.isIntersecting;
  }
  wake();
});

function clearHand() {
  generation++;
  resetWorker('superseded'); // a re-deal must not keep rendering the previous hand
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  for (const l of live) {
    l.player.stop();
    seen.unobserve(l.slot);
  }
  live = [];
}

async function deal() {
  if (!table) return;
  clearHand();
  const mine = generation;
  const hand = dealt === 0 ? firstHand() : dealHand(mulberry32((Math.random() * 2 ** 32) >>> 0));
  dealt++;

  const grid = document.createElement('div');
  grid.className = 'hand';
  const slots = hand.map((c) => {
    const fig = document.createElement('figure');
    const slot = document.createElement('div');
    slot.className = 'slot';
    const cap = document.createElement('figcaption');
    cap.textContent = cardCaption(c);
    fig.append(slot, cap);
    grid.append(fig);
    return slot;
  });
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'again';
  again.textContent = 'deal again';
  // aria-disabled (not disabled) so the button can take focus right away: the deal button it replaces is gone
  again.setAttribute('aria-disabled', 'true');
  again.addEventListener('click', () => {
    if (again.getAttribute('aria-disabled') !== 'true') void deal();
  });
  table.replaceChildren(grid, again);
  again.focus();
  if (status) status.textContent = 'dealing…';

  try {
    await loadPlayer();
    const run = (window as unknown as { runMachine: RunMachine }).runMachine;
    const width = Math.max(120, Math.round(slots[0].getBoundingClientRect().width));
    const rendered = hand.map((c) => render(c));
    let failed = 0;
    const fail = (slot: HTMLElement) => {
      failed++;
      slot.classList.add('failed');
      slot.textContent = 'could not be drawn';
    };
    for (const [i, c] of hand.entries()) {
      const out = await rendered[i];
      if (mine !== generation) return;
      if (out.error || !out.machine) {
        fail(slots[i]);
        continue;
      }
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${cardCaption(c)}, caustic dance`);
      let player: Player;
      try {
        player = await run(canvas, out.machine, { width, play: false });
      } catch {
        if (mine === generation) fail(slots[i]);
        continue;
      }
      if (mine !== generation) {
        player.stop();
        return;
      }
      player.drawAt(0);
      slots[i].append(canvas);
      const l: Live = { player, slot: slots[i], visible: true, t0: performance.now() };
      live.push(l);
      seen.observe(slots[i]);
    }
    if (mine !== generation) return;
    again.setAttribute('aria-disabled', 'false');
    if (status) status.textContent = failed === hand.length ? 'the deck could not be dealt — try again' : failed ? 'some cards could not be drawn — deal again' : '';
    wake();
  } catch {
    if (mine === generation) {
      again.setAttribute('aria-disabled', 'false');
      if (status) status.textContent = 'the deck could not be dealt — try again';
    }
  }
}

root?.querySelector('[data-deal-btn]')?.addEventListener('click', () => void deal());
window.addEventListener('pagehide', clearHand);
