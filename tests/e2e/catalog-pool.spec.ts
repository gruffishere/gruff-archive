import { expect, test, type Page } from '@playwright/test';
import { checkPage } from './helpers';

// The catalog deals a fresh wall from /catalog/pool.json on every visit (src/scripts/catalog.ts).
async function open(page: Page, query = '') {
  await checkPage(page, `/catalog/${query}`);
  await expect(page.locator('#salon.on')).toBeVisible();
  await expect(page.locator('#salon.pending')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}
const ids = (page: Page) => page.locator('#salon a.tile').evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.slug}/${(e as HTMLElement).dataset.id}`));
const boxes = (page: Page) =>
  page.locator('#salon a.tile').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; }));

test('the pool is shipped as json', async ({ request }) => {
  const res = await request.get('/catalog/pool.json');
  expect(res.status()).toBe(200);
  const pool = (await res.json()) as { slug: string; id: string; href: string; w: number; h: number; kind: string; generative: boolean }[];
  expect(pool.length).toBeGreaterThan(80);
  for (const p of pool) {
    expect(p.href).toBe(`/w/${p.slug}/${p.id}/`);
    expect(p.w).toBeGreaterThan(0);
    expect(p.h).toBeGreaterThan(0);
  }
  const perGen = new Map<string, number>();
  for (const p of pool) if (p.generative) perGen.set(p.slug, (perGen.get(p.slug) ?? 0) + 1);
  for (const n of perGen.values()) expect(n).toBeLessThanOrEqual(60);
});

test('two visits deal different walls, each with no overlaps and no repeated piece', async ({ page, browser }) => {
  await open(page);
  const a = await ids(page);
  expect(a.length).toBeGreaterThan(40);
  expect(a.length).toBeLessThanOrEqual(80);
  expect(new Set(a).size).toBe(a.length);
  const bx = await boxes(page);
  for (let i = 0; i < bx.length; i++)
    for (let j = 0; j < i; j++) {
      const p = bx[i]!, q = bx[j]!;
      expect(p.x < q.x + q.w - 0.5 && q.x < p.x + p.w - 0.5 && p.y < q.y + q.h - 0.5 && q.y < p.y + p.h - 0.5).toBe(false);
    }
  const ctx = await browser.newContext({ viewport: page.viewportSize()! });
  const page2 = await ctx.newPage();
  await open(page2);
  const b = await ids(page2);
  expect(b.join()).not.toBe(a.join());
  expect(new Set(b).size).not.toBe(0);
  expect(b.filter((x) => !a.includes(x)).length).toBeGreaterThan(0);
  await ctx.close();
});

test('the same seed and width hang the same wall', async ({ page, browser }) => {
  await open(page, '?seed=4242');
  const a = await ids(page);
  const ba = await boxes(page);
  const ctx = await browser.newContext({ viewport: page.viewportSize()! });
  const page2 = await ctx.newPage();
  await open(page2, '?seed=4242');
  expect(await ids(page2)).toEqual(a);
  expect(await boxes(page2)).toEqual(ba);
  await ctx.close();
});

test('resizing re-hangs the same draw', async ({ page }) => {
  await open(page);
  const before = await ids(page);
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.width === 390 ? 700 : 1100, height: vp.height });
  await page.waitForTimeout(600);
  expect(await ids(page)).toEqual(before);
  await expect(page.locator('#salon.on')).toBeVisible();
});

test('a dealt tile opens its work, and live pieces stay sandboxed and inert', async ({ page }) => {
  await open(page);
  expect(await page.locator('#salon iframe:not([sandbox="allow-scripts"])').count()).toBe(0);
  expect(await page.locator('#salon iframe').evaluateAll((els) => els.every((e) => getComputedStyle(e).pointerEvents === 'none'))).toBe(true);
  const first = page.locator('#salon a.tile').first();
  const href = await first.getAttribute('href');
  await first.scrollIntoViewIfNeeded();
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});
