import { expect, test } from '@playwright/test';
import { isGenerative, isOnChain } from '../../indexer/tags';
import { collections, tokensOf } from '../../src/lib/data';
import { laneLayout, laneMarks, summary } from '../../src/lib/techniques';
import { checkPage } from './helpers';

const marks = () => {
  const cols = collections();
  return laneMarks(cols, Object.fromEntries(cols.map((c) => [c.slug, tokensOf(c.slug)])));
};

test('techniques page hangs every collection in its technique lanes, and tells the tools in the notes', async ({ page }, info) => {
  await checkPage(page, '/techniques/');
  // the artist chose lanes (2026-11-06): quarters on a wide screen, years on a phone
  const unit = info.project.name === 'phone' ? 'year' : 'quarter';
  const lanes = page.locator(`.lanes.${unit}`);
  await expect(lanes).toBeVisible();
  await expect(page.locator(`.lanes.${unit === 'year' ? 'quarter' : 'year'}`)).toBeHidden();
  await expect(lanes.locator('.lname')).toHaveText([/^vector illustration/, /^glitch art/, /^generative art/, /^code art/]);
  const ms = marks();
  const l = laneLayout(ms, unit);
  await expect(lanes.locator('.mark')).toHaveCount(ms.reduce((s, m) => s + m.techniques.length, 0));
  await expect(lanes.locator('.links path')).toHaveCount(l.links.length);
  // every connector runs in the gutter beside the squares (never across a mark) and ends level with the two it joins
  const loose = await lanes.evaluate((root) => {
    const sq = [...root.querySelectorAll('.mark i')].map((i) => i.getBoundingClientRect());
    return [...root.querySelectorAll('.links path')].filter((p) => {
      const b = p.getBoundingClientRect();
      const beside = sq.filter((s) => s.left >= b.right - 0.5 && s.left - b.right < 4);
      const level = (y: number) => beside.some((s) => Math.abs(s.top + s.height / 2 - y) < 1.5);
      return !(level(b.top) && level(b.bottom));
    }).length;
  });
  expect(loose).toBe(0);
  // marks never overlap each other
  const boxes = await lanes.locator('.mark').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height })));
  for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    expect(a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5, 'marks overlap').toBe(false);
  }
  // methods sit behind the lane they fed (the artist, 2026-11-06); ai stands apart, with no picture and no link
  await expect(page.locator('section.behind')).toHaveCount(4);
  await expect(page.locator('section.behind .bh .ln')).toHaveText(['vector illustration', 'glitch art', 'generative art', 'code art']);
  await expect(page.locator('section.behind .method')).toHaveCount(7);
  // no word said twice and no years (the artist, 2026-11-06): the heading names the lane once, a method named like
  // its lane carries no label, and a tool's label is its name alone
  await expect(page.locator('section.behind .bh')).toHaveText(['vector illustration', 'glitch art', 'generative art', 'code art']);
  await expect(page.locator('.method[data-key="vector"] .ml')).toHaveCount(0);
  await expect(page.locator('.method[data-key="photoshop"] .ml')).toHaveText('photoshop');
  // the svg excerpt keeps its own namespace url (w3.org/2000/svg), so only the words are checked for years
  for (const t of await page.locator('.behind-all .bh, .behind-all .method, .behind-all figcaption, .behind-all .ai').allInnerTexts()) expect(t).not.toMatch(/20\d\d/);
  // no "→ collection" lists under the notes: the only links in the methods are the pictures opening full size
  await expect(page.locator('.behind-all a:not(.sq)')).toHaveCount(0);
  await expect(page.locator('.ai[data-key="ai"]')).toHaveCount(1);
  await expect(page.locator('.ai img, .ai a')).toHaveCount(0);
  // every picture opens full size in a new tab
  for (const a of await page.locator('.strip a.sq').all()) {
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('href', /^\/(techniques|exp)\//);
  }
  const imgs = page.locator('.strip img');
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
