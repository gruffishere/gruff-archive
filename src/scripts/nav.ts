// nav.ts — the MENU toggle on narrow screens.
const button = document.querySelector<HTMLButtonElement>('header .menu');
const list = document.getElementById('nav-list');
button?.addEventListener('click', () => {
  const open = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(open));
  list?.classList.toggle('open', open);
});
