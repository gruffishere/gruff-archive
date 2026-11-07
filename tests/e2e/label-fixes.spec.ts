import { expect, test } from '@playwright/test';
import { collections, tokensOf } from '../../src/lib/data';
import { workNav } from '../../src/lib/collections';
import { workPath } from '../../src/lib/links';
import { checkPage } from './helpers';

// The artist's review of the live site, 2026-11-07.

test('the work count carries arrows to the next and previous work, right where it is', async ({ page }) => {
  const toks = tokensOf('subsimulated');
  const nav = workNav(toks).map((x, i) => ({ ...x, id: toks[i]!.id }));
  const first = nav.find((x) => x.prev === null && x.next)!;
  await checkPage(page, workPath('subsimulated', first.id));
  await expect(page.locator('.crumbs a[aria-label="previous work"]')).toHaveCount(0);
  const next = page.locator('.crumbs a[aria-label="next work"]');
  await expect(next).toHaveAttribute('href', workPath('subsimulated', first.next!));
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await next.click();
  await expect(page).toHaveURL(new RegExp(`${workPath('subsimulated', first.next!)}$`));
  await expect(page.locator('.crumbs a[aria-label="previous work"]')).toHaveAttribute('href', workPath('subsimulated', first.id));
});

test('separate one-of-ones read 1/1, never 1/1/<works>', async ({ page }) => {
  await checkPage(page, '/w/oversimulated/22/');
  await expect(page.locator('.label .lr', { hasText: 'edition' }).locator('.v')).toHaveText(/^1\/1 · erc-721/);
});

test('an erc721 edition reads as an edition and files under editions', async ({ page }) => {
  const lso = collections().find((c) => c.slug === 'last-selfie-or')!;
  test.skip(lso.format !== 'editions', 'pending the inventory run that writes the format');
  await checkPage(page, workPath('last-selfie-or', tokensOf('last-selfie-or')[0]!.id));
  await expect(page.locator('.label .lr', { hasText: 'edition' }).locator('.v')).toHaveText(`edition of ${lso.works} · erc-721`);
  await checkPage(page, '/');
  await expect(page.locator('#ledger a.row[data-code="LSO"]')).toHaveAttribute('data-filters', /\beditions\b/);
  await expect(page.locator('#ledger a.row[data-code="LSO"]')).not.toHaveAttribute('data-filters', /one-of-one/);
});

test('a listed work shows its dollar value, quiet beside the eth', async ({ page }) => {
  let found: { slug: string; id: string } | null = null;
  for (const c of collections()) {
    const t = tokensOf(c.slug).find((x) => x.listing && x.supply > 0);
    if (t) { found = { slug: c.slug, id: t.id }; break; }
  }
  test.skip(!found, 'nothing listed in the catalog');
  // keep the snapshot: the preview has no live price function
  await page.route('**/api/listing**', (r) => r.fulfill({ status: 404, body: '' }));
  await checkPage(page, workPath(found!.slug, found!.id));
  const usd = page.locator('#live-usd');
  await expect(usd).toHaveText(/^\$[\d,]+$/);
  const [u, e] = await Promise.all([usd.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), page.locator('#live-price').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))]);
  expect(u).toBeLessThan(e);
});

test('an auctioned work shows its bid war, the winning bid on top', async ({ page }) => {
  let found: { slug: string; id: string; bids: number; price: string } | null = null;
  for (const c of collections()) {
    const t = tokensOf(c.slug).find((x) => x.auctions?.some((a) => a.bids.length > 1));
    if (t) { const a = t.auctions!.find((x) => x.bids.length > 0)!; found = { slug: c.slug, id: t.id, bids: a.bids.length, price: a.priceWei }; break; }
  }
  test.skip(!found, 'pending the inventory run that reads the auction houses');
  await checkPage(page, workPath(found!.slug, found!.id));
  const bids = page.locator('.label details.bids');
  await expect(bids.locator('summary')).toContainText(String(found!.bids));
  await bids.locator('summary').click();
  await expect(bids.locator('li')).toHaveCount(found!.bids);
  await expect(bids.locator('li').first()).toContainText('won');
  await expect(page.locator('.label .lr', { hasText: 'last sale' }).locator('.v')).not.toHaveText('none');
});

test('an unlisted work that sold shows its last sale in the price spot, labelled and muted', async ({ page }) => {
  let found: { slug: string; id: string } | null = null;
  for (const c of collections()) {
    const t = tokensOf(c.slug).find((x) => !x.listing && x.lastSale && x.supply > 0);
    if (t) { found = { slug: c.slug, id: t.id }; break; }
  }
  test.skip(!found, 'no unlisted work with a sale in the catalog');
  await page.route('**/api/listing**', (r) => r.fulfill({ status: 404, body: '' }));
  await checkPage(page, workPath(found!.slug, found!.id));
  await expect(page.locator('#price-label')).toHaveText(/^last sale · \d{2}\.\d{2}\.\d{4}$/);
  await expect(page.locator('#live-price')).toHaveClass(/sold/);
  await expect(page.locator('#live-price')).toHaveText(/Ξ$/);
  await expect(page.locator('#live-usd')).toBeEmpty();
  // the row below would only repeat it
  await expect(page.locator('.label .lr.ls')).toBeHidden();
});
