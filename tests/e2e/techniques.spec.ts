import { expect, test } from '@playwright/test';
import { isGenerative, isOnChain } from '../../indexer/tags';
import { collections } from '../../src/lib/data';
import { summary } from '../../src/lib/techniques';
import { checkPage } from './helpers';

test('techniques page draws one chart of the four techniques, and tells the tools in the notes', async ({ page }) => {
  await checkPage(page, '/techniques/');
  const dashes = await page.locator('path.ln').evaluateAll((els) => els.map((e) => e.getAttribute('stroke-dasharray') ?? ''));
  expect(dashes).toHaveLength(4);
  expect(new Set(dashes).size).toBe(4);
  // the tools are not rows under the chart any more (the artist, 2026-11-06): each line is one smooth piece
  await expect(page.locator('.tchart .cells, .tchart .tool')).toHaveCount(0);
  for (const d of await page.locator('path.ln').evaluateAll((els) => els.map((e) => e.getAttribute('d') ?? ''))) expect(d.match(/M/g)?.length ?? 0).toBeLessThanOrEqual(2);
  await expect(page.locator('article.note[data-key="photoshop"] .label')).toContainText(/photoshop · 20\d\d–20\d\d/);
  await expect(page.locator('article.note')).toHaveCount(8);
  await expect(page.locator('article.note[data-key="ai"] img')).toHaveCount(0);
  await expect(page.locator('article.note[data-key="ai"] a')).toHaveCount(0);
  const imgs = page.locator('article.note img');
  for (let i = 0; i < (await imgs.count()); i++) {
    await imgs.nth(i).scrollIntoViewIfNeeded();
    await expect.poll(() => imgs.nth(i).evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  const s = summary(collections());
  await expect(page.locator('.sum')).toHaveText(`${s.onChainPct}% on-chain · ${s.oneOfOne.toLocaleString('en-US')} 1/1 · ${s.editionPieces.toLocaleString('en-US')} edition pieces`);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('the index generative and on-chain filters match the catalog', async ({ page }) => {
  await checkPage(page, '/');
  const cols = collections().filter((c) => c.section === 'index' || c.section === 'experiments');
  await page.getByRole('button', { name: 'generative' }).click();
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(cols.filter(isGenerative).length);
  await page.getByRole('button', { name: 'on-chain' }).click();
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(cols.filter(isOnChain).length);
});
