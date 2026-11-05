import { collections, tokensOf } from '../../src/lib/data';
import { expect, test } from '@playwright/test';
import { checkPage } from './helpers';

// the list holds keepers only: the artist's own copies and excluded holders are not keepers
const keepersOf = (t: { owners: { notKeeper?: true }[] }) => t.owners.filter((o) => !o.notKeeper);

// an edition with several keepers shows one "keepers" tab instead of "holds N" rows
const multi = () => {
  for (const c of collections().filter((x) => x.standard === 'erc1155'))
    for (const t of tokensOf(c.slug)) if (keepersOf(t).length > 1) return { slug: c.slug, t };
  return null;
};

test('an edition shows one keepers tab that opens the current keepers', async ({ page }) => {
  const found = multi();
  test.skip(!found, 'no edition with several owners in the catalog');
  const { slug, t } = found!;
  await checkPage(page, `/w/${slug}/${t.id}/`);
  const summary = page.locator('.label details.keepers > summary');
  await expect(summary).toHaveCount(1);
  await expect(summary).toContainText('keepers');
  await expect(page.locator('.label .l', { hasText: /^holds/ })).toHaveCount(0);
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await expect(page.locator('.label .klist')).toBeHidden();
  await summary.click();
  const rows = page.locator('.label .klist li');
  await expect(rows).toHaveCount(keepersOf(t).length);
  await expect(summary).toContainText(String(t.holderCount));
  const first = rows.first().locator('a');
  await expect(first).toHaveAttribute('href', /^https:\/\/etherscan\.io\/address\/0x/);
  await expect(first).toHaveAttribute('target', '_blank');
  await expect(first).toHaveAttribute('rel', /noopener/);
  // quantities run from most copies down
  const qty = (await rows.locator('.v').allTextContents()).map(Number);
  expect([...qty].sort((a, b) => b - a)).toEqual(qty);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('/w/collabs/1/ has one keepers summary and no holds rows', async ({ page }) => {
  const t = tokensOf('collabs').find((x) => x.id === '1')!;
  test.skip(keepersOf(t).length < 2, 'collabs/1 has a single keeper');
  await checkPage(page, '/w/collabs/1/');
  await expect(page.locator('.label summary', { hasText: 'keepers' })).toHaveCount(1);
  await page.locator('.label summary').click();
  await expect(page.locator('.label .klist li')).toHaveCount(keepersOf(t).length);
  await expect(page.locator('.label', { hasText: /\bholds\b/ })).toHaveCount(0);
});
