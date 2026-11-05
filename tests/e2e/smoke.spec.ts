import { catalogPieces } from '../../src/lib/catalog';
import { collections, tokensOf } from '../../src/lib/data';
import { expect, test, type Page } from '@playwright/test';

export async function checkPage(page: Page, path: string, status = 200) {
  const errors: { text: string; url: string }[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push({ text: m.text(), url: m.location().url }));
  page.on('pageerror', (e) => errors.push({ text: e.message, url: '' }));
  const res = await page.goto(path);
  expect(res?.status()).toBe(status);
  await expect(page.locator('header .wm')).toHaveText('gruff');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Chromium logs a console error for the page's own non-200 load; that is expected, nothing else is.
  const own = (e: { text: string; url: string }) => status !== 200 && e.text.includes('Failed to load resource') && e.url === res?.url();
  // The preview server has no Pages Functions, so the live price fetch 404s; the page keeps its snapshot.
  const liveFetch = (e: { text: string; url: string }) => e.text.includes('Failed to load resource') && e.url.includes('/api/listing');
  expect(errors.filter((e) => !liveFetch(e) && !own(e)).map((e) => e.text)).toEqual([]);
}

test('404 is a closed room', async ({ page }) => {
  await checkPage(page, '/no-such-room/', 404);
  await expect(page.getByText('this room is closed')).toBeVisible();
});

test('index lists the collections and filters them', async ({ page }) => {
  await checkPage(page, '/');
  const rows = page.locator('#ledger a.row');
  await expect(rows).toHaveCount(17);
  await expect(page.locator('.meta-line')).toContainText('16 collections · 1 experiment · ');
  const wm = (await page.locator('header .wm').boundingBox())!;
  const tag = (await page.locator('header .tagline').boundingBox())!;
  expect(tag.y).toBeGreaterThanOrEqual(wm.y + wm.height - 2);
  const yearEdge = async (code: string) => {
    const box = await page.locator(`#ledger a.row[data-code="${code}"] .yr`).boundingBox();
    return box!.x + box!.width;
  };
  expect(Math.abs((await yearEdge('PHG')) - (await yearEdge('FCT')))).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'on-chain' }).click();
  // on-chain: 2 collections plus the OVVN experiment
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(3);
  await page.getByRole('button', { name: 'experiments' }).click();
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(1);
  await expect(page.locator('#ledger a.row:visible')).toHaveAttribute('data-code', 'OVN');
  await expect(page.locator('#ledger a.row:visible .exp')).toHaveText('exp.');
  // geometric: the marker sits on the title's first line, before it
  const eb = (await page.locator('#ledger a.row:visible .exp').boundingBox())!;
  const tb = (await page.locator('#ledger a.row:visible .tt').boundingBox())!;
  expect(eb.x + eb.width).toBeLessThanOrEqual(tb.x + 1);
  expect(Math.abs(eb.y + eb.height / 2 - (tb.y + 8))).toBeLessThanOrEqual(8);
  await expect(page.getByText(/last inventory:/i)).toBeVisible();
});

test('time scrubber rewinds the archive', async ({ page }) => {
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'archive through time' });
  const box = (await slider.boundingBox())!;
  const host = (await page.locator('#scrubber').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(host.width * 0.8);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await slider.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
  await slider.focus();
  await slider.press('Home');
  await expect(page.locator('#scrub-label')).toContainText('01.2023');
  expect(await page.locator('#ledger a.row:visible').count()).toBeLessThan(17);
  await expect(page.locator('#ledger a.row[data-code="OVN"]')).toBeHidden();
  await expect(page.locator('#exp-count')).toBeHidden();
  await slider.press('End');
  await expect(page.locator('#scrub-label')).toHaveText('archive as of: now');
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(17);
  await expect(page.locator('.meta-line')).toContainText('16 collections · 1 experiment');
  await expect(page.locator('#ledger a.row[data-code="OVN"]')).toBeVisible();
});

test('collection pages show their works', async ({ page }) => {
  await checkPage(page, '/c/silver-surfer/');
  await expect(page.locator('.works a.work')).toHaveCount(3);
  await expect(page.locator('.works a.work').first()).toHaveAttribute('href', /^\/w\/silver-surfer\/[^/]+\/$/);
  await checkPage(page, '/c/facets/');
  expect(await page.locator('.works a.work').count()).toBeGreaterThan(500);
});

test('work page shows the wall label and navigates with arrows', async ({ page }) => {
  await checkPage(page, '/w/silver-surfer/1/');
  await expect(page.locator('.label .price')).toBeVisible();
  await expect(page.getByRole('link', { name: 'etherscan ↗' }).first()).toHaveAttribute('href', /etherscan\.io\/nft\//);
  await expect(page.locator('h2.act-h')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/w\/silver-surfer\/2\/$/);
});

test('large collection work pages exist', async ({ page }) => {
  await checkPage(page, '/w/facets/1/');
});

test('large html artwork iframe is square and sandboxed', async ({ page }) => {
  await checkPage(page, '/w/phigures/1/');
  const f = page.locator('.art iframe');
  await expect(f).toHaveAttribute('sandbox', 'allow-scripts');
  const box = (await f.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(box.width * 0.9);
});

test('work page keeps the snapshot price when the live price is unavailable', async ({ page }) => {
  await checkPage(page, '/w/silver-surfer/1/');
  await expect(page.locator('#live-price')).not.toBeEmpty();
});

test('work page shows the live price when the function answers', async ({ page }) => {
  await page.route('**/api/listing*', (r) => r.fulfill({ json: { listing: { tokenId: '1', priceWei: '450000000000000000', maker: '0x0', at: '2024-11-05T00:00:00.000Z' } } }));
  await page.goto('/w/silver-surfer/1/');
  await expect(page.locator('#live-price')).toHaveText('0.45 Ξ');
  await expect(page.locator('#live-price')).not.toHaveClass(/none/);
  await expect(page.locator('#price-label')).toHaveText('listed');
  await expect(page.locator('#price-note')).toHaveText('live');
});

test('print label downloads a 1080×1350 png', async ({ page }) => {
  await page.goto('/w/silver-surfer/1/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'print label ↓' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^gruff-GRF\.\d{2}\.SLV\.\d{3}\.png$/);
  const path = await download.path();
  const { default: sharp } = await import('sharp');
  const meta = await sharp(path!).metadata();
  expect([meta.width, meta.height]).toEqual([1080, 1350]);
});

test('artist name stays lowercase in the wall label', async ({ page }) => {
  await page.goto('/w/silver-surfer/1/');
  await expect(page.locator('aside .lower', { hasText: 'gruff' }).first()).toHaveText('gruff');
  expect(await page.locator('aside .lower', { hasText: 'gruff' }).first().evaluate((e) => getComputedStyle(e).textTransform)).toBe('none');
});

test('activity ledger lists events and filters them', async ({ page }) => {
  await checkPage(page, '/activity/');
  expect(await page.locator('.act .ev').count()).toBeGreaterThan(0);
  await expect(page.locator('.sum .k', { hasText: 'last inventory' }).locator('span')).toHaveText(/\d+(m|h|d) ago/);
  await page.getByRole('button', { name: 'mints' }).click();
  expect(await page.locator('.act .ev:visible').count()).toBeGreaterThan(0);
  for (const kind of await page.locator('.act .ev:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))) expect(kind).toBe('mint');
  await page.getByRole('button', { name: 'sales' }).click();
  // no sales exist in the history yet (they arrive with the keyed OpenSea inventory): the empty line shows only because the whole history has none
  if ((await page.locator('.act .ev:visible').count()) === 0) await expect(page.locator('.empty')).toBeVisible();
  else {
    await expect(page.locator('.empty')).toBeHidden();
    for (const kind of await page.locator('.act .ev:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))) expect(kind).toBe('sale');
  }
  await page.getByRole('button', { name: 'listings' }).click();
  if ((await page.locator('.act .ev:visible').count()) === 0) await expect(page.locator('.empty')).toBeVisible();
  else {
    await expect(page.locator('.empty')).toBeHidden();
    for (const kind of await page.locator('.act .ev:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))) expect(kind).toBe('listed');
  }
  await page.getByRole('button', { name: 'all', exact: true }).click();
  await expect(page.locator('.empty')).toBeHidden();
  const firstMonth = page.locator('.months a').first();
  await firstMonth.click();
  await expect(page.locator('.crumbs')).toContainText('entries');
});

test('keepers rank, expand and search', async ({ page }) => {
  await checkPage(page, '/keepers/');
  const first = page.locator('li.keeper').first();
  await first.locator('summary').click();
  await expect(first.locator('.det')).toBeVisible();
  const name = (await first.locator('.name').textContent())!.trim();
  // five characters: a short address reads 0x89c… and the ellipsis is not part of the address
  await page.getByPlaceholder('ens or address').fill(name.slice(0, 5));
  expect(await page.locator('li.keeper:visible').count()).toBeGreaterThan(0);
  // the rank is the place in the sort order, so clear the search before reading it
  await page.getByPlaceholder('ens or address').fill('');
  await page.getByRole('button', { name: 'since' }).click();
  await expect(page.locator('li.keeper:visible .rank').first()).toHaveText('01');
  const [a, b] = await page.locator('li.keeper:visible').evaluateAll((els) => els.slice(0, 2).map((el) => (el as HTMLElement).dataset.since!));
  expect(a <= b).toBe(true);
  expect(await page.locator('li.keeper').first().getAttribute('data-since')).toBe(a);
});

test('keepers: a short query is capped and can be widened', async ({ page }) => {
  await checkPage(page, '/keepers/');
  await page.getByPlaceholder('ens or address').fill('e');
  await expect.poll(() => page.locator('#cap-note .count').textContent()).toMatch(/^showing 300 of [0-9,]+ matches$/);
  expect(await page.locator('li.keeper:visible').count()).toBe(300);
  await page.locator('#cap-note button').click();
  expect(await page.locator('li.keeper:visible').count()).toBeGreaterThan(300);
  await expect(page.locator('#cap-note')).toBeHidden();
});

test('keepers: long names and the show-all button stay inside 360px', async ({ page }) => {
  await checkPage(page, '/keepers/');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByPlaceholder('ens or address').fill('officialnbaclub');
  await expect(page.locator('li.keeper:visible .name').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByPlaceholder('ens or address').fill('');
  await expect(page.locator('#show-all')).toBeVisible();
  for (const loc of [page.getByPlaceholder('ens or address'), page.locator('#show-all'), page.locator('.chip[data-sort]').first()])
    expect((await loc.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.locator('#show-all').click();
  expect(await page.locator('li.keeper:visible').count()).toBeGreaterThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('techniques page draws the catalog', async ({ page }) => {
  await checkPage(page, '/techniques/');
  await expect(page.getByText('technique × year')).toBeVisible();
  expect(await page.locator('.meter').count()).toBeGreaterThan(4);
  expect(await page.locator('body *', { hasText: /[░█]/ }).count()).toBe(0);
  const widths = await page.locator('.meter i').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(widths.some((w) => w > 0)).toBe(true);
  const counts = await page.locator('.cell[data-tech="illustration"] .num').allTextContents();
  expect(counts.length).toBeGreaterThan(0);
  expect(counts.every((t) => /^[1-9][\d,]*$/.test(t.trim()))).toBe(true);
  await expect(page.locator('.cell.f', { hasText: '—' }).first()).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('about lists the socials and experiments lists the rooms', async ({ page }) => {
  await checkPage(page, '/about/');
  await expect(page.getByText('trying to be an experimental artist')).toBeVisible();
  expect(await page.locator('.socials a').count()).toBe(5);
  const taglineStyle = (sel: string) => page.locator(sel).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { w: cs.fontWeight, t: cs.textTransform, bg: cs.backgroundImage, before: getComputedStyle(el, '::before').content };
  });
  for (const sel of ['header .tagline', '.about .tagline']) {
    const st = await taglineStyle(sel);
    expect(st.w).toBe('300');
    expect(st.t).toBe('none');
    expect(st.bg).toContain('linear-gradient');
    expect(st.before).toBe('"— "');
  }
  await checkPage(page, '/experiments/');
  await expect(page.locator('.room')).toHaveCount(1);
});

test('idle fade and the mobile menu', async ({ page }, info) => {
  await page.clock.install();
  await page.goto('/');
  await page.clock.fastForward(61_000);
  await expect(page.locator('body')).toHaveClass(/fading/);
  await page.mouse.move(10, 10);
  await expect(page.locator('body')).not.toHaveClass(/fading/);
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'menu' }).click();
    await expect(page.getByRole('link', { name: 'keepers' })).toBeVisible();
  }
});

test('collection captions keep addresses and "not listed" lowercase', async ({ page }) => {
  await checkPage(page, '/c/silver-surfer/');
  const caps = page.locator('.works .cap');
  expect(await caps.count()).toBeGreaterThan(0);
  for (const text of await caps.allInnerTexts()) expect(text).not.toContain('0X');
  const status = caps.first().locator('span').last();
  expect(await status.evaluate((e) => getComputedStyle(e).textTransform)).toBe('none');
  await expect(status).toContainText('not listed');
});

test('work page links are at least 44px tall on a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch targets are a phone concern');
  await checkPage(page, '/w/silver-surfer/1/');
  const heights = await page.locator('main a').evaluateAll((els) => els.map((e) => ({ t: (e.textContent ?? '').trim().slice(0, 30), h: e.getBoundingClientRect().height })));
  expect(heights.length).toBeGreaterThan(5);
  expect(heights.filter((x) => x.h < 43.5)).toEqual([]);
});

test('print label draws SVG-only artwork (FACETS has a viewBox and no size)', async ({ page }, info) => {
  await checkPage(page, '/w/facets/1/');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'print label ↓' }).click()]);
  const path = await download.path();
  const { default: sharp } = await import('sharp');
  // the art box is 936 x 820 starting at y=72; some pixel in it must not be the black background
  const box = await sharp(path!).extract({ left: 72, top: 72, width: 936, height: 820 }).raw().toBuffer();
  let lit = 0;
  for (let i = 0; i < box.length; i += 3) if (box[i] + box[i + 1] + box[i + 2] > 60) lit++;
  expect(lit).toBeGreaterThan(5000);
  if (process.env.LABEL_OUT && info.project.name === 'desktop') await sharp(path!).toFile(process.env.LABEL_OUT);
});

test('index pulse line keeps its spaces', async ({ page }) => {
  await checkPage(page, '/');
  const text = await page.locator('footer a.hit').first().innerText();
  expect(text.toLowerCase()).toContain('latest: ');
  expect(text).toMatch(/ → ?$/);
});

test('a collab work names its collaborator on the label', async ({ page }) => {
  await checkPage(page, '/w/collabs/1/');
  const label = page.locator('.label');
  await expect(label).toContainText('×');
  await expect(label).toContainText('SuperVillian');
});

test('a work page links to the original on arweave', async ({ page }) => {
  await checkPage(page, '/w/antique/2/');
  const link = page.getByRole('link', { name: 'original ↗' });
  await expect(link).toHaveAttribute('href', /^https:\/\/arweave\.net\//);
});

test('catalog hangs the works on one wall', async ({ page }, info) => {
  await checkPage(page, '/catalog/');
  const isPhone = info.project.name === 'phone';
  if (isPhone) await page.getByRole('button', { name: 'menu' }).click();
  await expect(page.locator('nav a[aria-current="page"]')).toHaveText('catalog');
  const tiles = page.locator('#salon a.tile');
  expect(await tiles.count()).toBeGreaterThan(20);
  const slugs = await tiles.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slug!));
  const per = new Map<string, number>();
  for (const s of slugs) per.set(s, (per.get(s) ?? 0) + 1);
  // expected = exactly the selection the page makes; the build may only drop pieces it cannot measure, so rendered <= expected
  const cols = collections();
  const expected = new Map<string, number>();
  for (const p of catalogPieces(cols, Object.fromEntries(cols.map((c) => [c.slug, tokensOf(c.slug)])))) expected.set(p.slug, (expected.get(p.slug) ?? 0) + 1);
  for (const c of cols) {
    const n = per.get(c.slug) ?? 0;
    const e = expected.get(c.slug) ?? 0;
    expect(n, c.slug).toBeLessThanOrEqual(e);
    if (e >= 1) expect(n, `${c.slug} has works with media`).toBeGreaterThanOrEqual(1);
    if (c.techniques.includes('generative')) expect(n, `${c.slug} is generative`).toBeLessThanOrEqual(5);
  }
  await expect(page.locator('#salon.on')).toBeVisible();
  const boxes = (await tiles.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; })));
  for (let i = 0; i < boxes.length; i++)
    for (let j = 0; j < i; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      expect(a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5).toBe(false);
    }
  await expect(page.locator('#salon iframe[allow-same-origin], #salon iframe[sandbox*="allow-same-origin"]')).toHaveCount(0);
  await tiles.first().scrollIntoViewIfNeeded();
  await tiles.first().click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/[^/]+\/$/);
});
