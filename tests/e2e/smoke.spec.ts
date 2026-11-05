import { catalogPieces } from '../../src/lib/catalog';
import { loadConfig } from '../../indexer/config';
import { countLabel } from '../../src/lib/collections';
import { collections, tokensOf } from '../../src/lib/data';
import { workPath } from '../../src/lib/links';
import { cardCaption, firstHand } from '../../src/lib/deal';
import { EMBED_ALLOW, ROOMS, roomMeta, roomPath } from '../../src/lib/rooms';
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

// Counts come from the catalog itself, so they hold before and after an inventory moves a collection between sections.
const sections = () => {
  const all = collections();
  const exp = all.filter((c) => c.section === 'experiments');
  const idx = all.filter((c) => c.section === 'index');
  // the rooms are experiments too: the index counts them next to the experiment collections
  const expTotal = exp.length + ROOMS.length;
  return { exp, idx, expTotal, rows: idx.length + expTotal, meta: `${countLabel(idx.length, 'collection')} · ${countLabel(expTotal, 'experiment')}` };
};

test('index lists the collections and filters them', async ({ page }) => {
  await checkPage(page, '/');
  const s = sections();
  const rows = page.locator('#ledger a.row');
  await expect(rows).toHaveCount(s.rows);
  await expect(page.locator('.meta-line')).toContainText(`${s.meta} · `);
  const wm = (await page.locator('header .wm').boundingBox())!;
  const tag = (await page.locator('header .tagline').boundingBox())!;
  expect(tag.y).toBeGreaterThanOrEqual(wm.y + wm.height - 2);
  const yearEdge = async (code: string) => {
    const box = await page.locator(`#ledger a.row[data-code="${code}"] .yr`).boundingBox();
    return box!.x + box!.width;
  };
  expect(Math.abs((await yearEdge('PHG')) - (await yearEdge('FCT')))).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'on-chain' }).click();
  await expect(page.locator('#ledger a.row:visible')).toHaveCount([...s.idx, ...s.exp].filter((c) => c.techniques.includes('on-chain')).length);
  await page.getByRole('button', { name: 'experiments' }).click();
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(s.expTotal);
  expect(await page.locator('#ledger a.row:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.code).sort())).toEqual([...s.exp.map((c) => c.code), ...ROOMS.map((r) => `room:${r.slug}`)].sort());
  await expect(page.locator('#ledger a.row[data-code="OVN"]:visible')).toHaveCount(1);
  await expect(page.locator('#ledger a.row:visible .exp')).toHaveText(Array.from({ length: s.expTotal }, () => 'exp.'));
  // geometric: the marker sits on the title's first line, before it
  const eb = (await page.locator('#ledger a.row:visible .exp').first().boundingBox())!;
  const tb = (await page.locator('#ledger a.row:visible .tt').first().boundingBox())!;
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
  expect(await page.locator('#ledger a.row:visible').count()).toBeLessThan(sections().rows);
  await expect(page.locator('#ledger a.row[data-code="OVN"]')).toBeHidden();
  for (const r of ROOMS) await expect(page.locator(`#ledger a.row[data-code="room:${r.slug}"]`)).toBeHidden();
  await expect(page.locator('#exp-count')).toBeHidden();
  await slider.press('End');
  await expect(page.locator('#scrub-label')).toHaveText('archive as of: now');
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(sections().rows);
  await expect(page.locator('.meta-line')).toContainText(sections().meta);
  await expect(page.locator('#ledger a.row[data-code="OVN"]')).toBeVisible();
  for (const r of ROOMS) await expect(page.locator(`#ledger a.row[data-code="room:${r.slug}"]`)).toBeVisible();
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

test('an erc-721 collection of several works numbers its editions 1/1/<works>', async ({ page }) => {
  const c = collections().find((x) => x.slug === 'silver-surfer')!;
  expect(c.works).toBeGreaterThan(1);
  await checkPage(page, '/w/silver-surfer/1/');
  await expect(page.locator('.label')).toContainText(`1/1/${c.works} · erc-721`);
  const single = collections().find((x) => x.standard === 'erc721' && x.works === 1);
  if (single) {
    await checkPage(page, workPath(single.slug, tokensOf(single.slug).find((t) => t.supply > 0)!.id));
    await expect(page.locator('.label')).toContainText('1/1 · erc-721');
    await expect(page.locator('.label')).not.toContainText('1/1/');
  }
});

// FACETS moving to the experiments section and the collection links reach the catalog only through the indexer, so these
// wait for the inventory run (the committed catalog predates config/collections.yaml) and then hold for good.
test('facets is an experiment with its links', async ({ page }) => {
  const c = collections().find((x) => x.slug === 'facets')!;
  // skips only while the committed catalog is stale relative to the config; once they agree it runs and must pass
  const cfg = loadConfig().collections.find((x) => x.slug === 'facets')!;
  const stale = (cfg.section === 'experiments' && c.section !== 'experiments') || (!!cfg.links?.length && !c.links?.length);
  test.skip(stale, 'pending the inventory run: the committed catalog predates config/collections.yaml');
  expect(c.section).toBe(cfg.section);
  expect(c.links).toEqual(cfg.links ?? []);
  await checkPage(page, '/');
  await expect(page.locator('#ledger a.row[data-code="FCT"]')).toHaveAttribute('data-exp', 'true');
  await expect(page.locator('#ledger a.row[data-code="FCT"] .exp')).toHaveText('exp.');
  await checkPage(page, '/experiments/');
  await expect(page.locator('.room', { hasText: 'FACETS' })).toHaveCount(1);
  await checkPage(page, '/c/facets/');
  const links = page.locator('.clinks a');
  await expect(links).toHaveText(['site ↗', 'x ↗', 'thread ↗']);
  await expect(links.first()).toHaveAttribute('href', 'https://thefacets.art');
  await expect(links.nth(2)).toHaveAttribute('href', 'https://x.com/facetsart/status/2097902091637256575');
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', /noopener/);
    expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }
  await checkPage(page, '/w/facets/1/');
  await expect(page.locator('.label .links a', { hasText: 'thread ↗' })).toHaveAttribute('href', /x\.com\/facetsart\/status\//);
  await checkPage(page, '/c/ovvn/');
  await expect(page.locator('.clinks a')).toHaveText(['site ↗']);
});

// skips only while the committed catalog has no pulverulents collection yet (the inventory adds it)
test('pulverulents is numbered by its supply cap and says it is still minting', async ({ page }) => {
  const c = collections().find((x) => x.slug === 'pulverulents');
  test.skip(!c, 'pending the inventory run: the committed catalog has no pulverulents yet');
  expect(c!.supplyCap).toBe(69);
  await checkPage(page, '/');
  if (c!.minting) await expect(page.locator('#ledger a.row[data-code="PUL"] .mint')).toHaveText('still minting');
  await checkPage(page, '/c/pulverulents/');
  if (c!.minting) {
    await expect(page.locator('p.k', { hasText: 'erc721' }).first()).toContainText('· still minting');
    expect(await page.locator('.mnote').first().evaluate((e) => getComputedStyle(e).textTransform)).toBe('none');
  }
  const first = tokensOf('pulverulents').find((t) => t.supply > 0)!;
  await checkPage(page, workPath('pulverulents', first.id));
  await expect(page.locator('.label')).toContainText('1/1/69 · erc-721');
  if (c!.minting) await expect(page.locator('.label')).toContainText('still minting');
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
  await expect(page.locator('.room')).toHaveCount(sections().expTotal);
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

test('hovering or focusing an animated catalog piece plays its gif, leaving restores the still', async ({ page }) => {
  const cols = collections();
  const gif = catalogPieces(cols, Object.fromEntries(cols.map((c) => [c.slug, tokensOf(c.slug)]))).find((p) => p.hover?.type === 'gif' && p.hover.src.endsWith('.gif'));
  const anyAnimated = cols.some((c) => tokensOf(c.slug).some((t) => t.image?.animated));
  test.skip(!anyAnimated, 'the catalog has no animated piece');
  expect(gif, 'an animated piece in the catalog must hang on the wall').toBeTruthy();
  const gifRequests: string[] = [];
  page.on('request', (r) => /\.gif(\?|$)/i.test(r.url()) && gifRequests.push(r.url()));
  await checkPage(page, '/catalog/');
  await expect(page.locator('#salon.on')).toBeVisible();
  const tile = page.locator(`#salon a.tile[href="${workPath(gif!.slug, gif!.id)}"]`);
  const img = tile.locator('img');
  await tile.scrollIntoViewIfNeeded();
  const still = await img.getAttribute('src');
  expect(still).toMatch(/\.webp$/);
  const stillSrcset = await img.getAttribute('srcset');
  expect(gifRequests, 'no gif before the first hover').toEqual([]);
  const before = (await tile.boundingBox())!;
  await tile.hover();
  await expect(img).toHaveAttribute('src', /\.gif$/);
  await expect.poll(() => gifRequests.length).toBeGreaterThan(0);
  const during = (await tile.boundingBox())!;
  expect([during.x, during.y, during.width, during.height]).toEqual([before.x, before.y, before.width, before.height]);
  expect(await img.evaluate((e) => getComputedStyle(e).objectFit)).toBe('cover');
  await page.mouse.move(0, 0);
  await expect(img).toHaveAttribute('src', still!);
  expect(await img.getAttribute('srcset')).toBe(stillSrcset);
  // keyboard focus plays it too, blur stops it
  await page.keyboard.press('Shift');
  await tile.focus();
  await expect(img).toHaveAttribute('src', /\.gif$/);
  await tile.evaluate((e) => (e as HTMLElement).blur());
  await expect(img).toHaveAttribute('src', still!);
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

// ---- experiment rooms ----
test('experiments lists the collections and the rooms', async ({ page }) => {
  await checkPage(page, '/experiments/');
  await expect(page.locator('.room')).toHaveCount(sections().expTotal);
  for (const r of ROOMS) await expect(page.locator(`.room[href="${roomPath(r.slug)}"]`)).toContainText(r.status);
});

test('the index shows each room as an exp. row that links to its page', async ({ page }) => {
  await checkPage(page, '/');
  for (const r of ROOMS) {
    const row = page.locator(`#ledger a.row[data-code="room:${r.slug}"]`);
    await expect(row).toHaveAttribute('href', roomPath(r.slug));
    await expect(row).toHaveAttribute('data-filters', 'all experiments');
    await expect(row.locator('.exp')).toHaveText('exp.');
    await expect(row.locator('.pl')).toHaveText(r.medium ?? '—');
    await expect(row.locator('.wk')).toHaveText('—');
  }
  await page.getByRole('button', { name: 'experiments' }).click();
  await expect(page.locator('#ledger a.row:visible')).toHaveCount(sections().expTotal);
});

for (const r of ROOMS) {
  test(`room page: ${r.slug}`, async ({ page }) => {
    await checkPage(page, roomPath(r.slug));
    await expect(page.locator('.crumbs a')).toHaveText('← experiments');
    await expect(page.locator('h1')).toHaveText(r.title);
    await expect(page.locator('p.k', { hasText: roomMeta(r).join(' · ') })).toBeVisible();
    await expect(page.locator('p.k .lower', { hasText: 'gruff' })).toHaveCount(1);
    await expect(page.locator('.wall')).toHaveText(r.text);
    await expect(page.locator('iframe')).toHaveCount(0); // click-to-load: nothing live on a visit
    if (r.kind === 'deal') await expect(page.getByRole('button', { name: 'deal', exact: true })).toBeVisible();
    else await expect(page.getByText('enter ↗')).toBeVisible();
    for (const l of r.links) await expect(page.locator('.clinks a', { hasText: `${l.label} ↗` })).toHaveAttribute('href', l.url);
  });
}

for (const slug of ['the-sigils', 'dive-bar', 'pulverulents-trailer']) {
  test(`enter on ${slug} inserts a sandboxed iframe`, async ({ page }) => {
    const room = ROOMS.find((r) => r.slug === slug)!;
    // the real third-party page is not needed to check the frame: serve a stub for its address
    await page.route(room.src!, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>stub</p>' }));
    await checkPage(page, roomPath(slug));
    await page.getByRole('button', { name: 'enter ↗' }).click();
    const frame = page.locator('iframe');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', room.src!);
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-downloads');
    await expect(frame).toHaveAttribute('allow', EMBED_ALLOW);
    await expect(page.getByRole('button', { name: 'enter ↗' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('strung deck deals five live cards, seeded the first time', async ({ page }) => {
  await checkPage(page, roomPath('playing-cards'));
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'deal', exact: true }).click();
  const canvases = page.locator('.hand canvas');
  await expect(canvases).toHaveCount(5, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'deal again' })).toBeEnabled();
  const hand = firstHand();
  await expect(page.locator('.hand figcaption')).toHaveText(hand.map(cardCaption));
  expect(new Set(hand.map((h) => h.deck)).size).toBe(5);
  // really drawn: every canvas holds painted pixels, and the dance changes them from one frame to the next
  const snap = () => canvases.evaluateAll((els) => els.map((el) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) ink++; sum += d[i] + d[i + 1] + d[i + 2]; }
    return { ink, sum, ratio: c.height / c.width };
  }));
  const a = await snap();
  for (const x of a) { expect(x.ink).toBeGreaterThan(1000); expect(x.ratio).toBeCloseTo(1.4, 2); }
  await page.waitForTimeout(1500);
  const b = await snap();
  expect(b.some((x, i) => x.sum !== a[i].sum)).toBe(true);
  // the table never scrolls sideways, and the hand wraps on phones
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const xs = await page.locator('.hand figure').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  if ((page.viewportSize()?.width ?? 0) < 480) expect(new Set(xs).size).toBe(2);
  else expect(new Set(xs).size).toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: 'deal again' }).click();
  await expect(canvases).toHaveCount(5, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'deal again' })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.hand figcaption')).toHaveCount(5);
});

test('i love pure chaos is hosted as a full page with a way back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const res = await page.goto('/exp/i-love-pure-chaos/app/');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/ilovepurechaos/i);
  await expect(page.locator('a.archive-back')).toHaveText('← back to the archive');
  await expect(page.locator('a.archive-back')).toHaveAttribute('href', '/experiments/i-love-pure-chaos/');
  await expect(page.locator('#uploadBtn')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  // the room page's enter is a same-tab link to it, and the app is not iframed
  await page.goto(roomPath('i-love-pure-chaos'));
  await expect(page.locator('a.poster')).toHaveAttribute('href', '/exp/i-love-pure-chaos/app/');
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('pulverulents shows the trailer block on its collection page', async ({ page }) => {
  const c = collections().find((x) => x.slug === 'pulverulents')!;
  const cfg = loadConfig().collections.find((x) => x.slug === 'pulverulents')!;
  // skips only while the committed catalog lacks the trailer link the config has
  test.skip(!!cfg.links?.length && !c.links?.length, 'pending the inventory run: the committed catalog predates the trailer link');
  await page.route('https://platform.twitter.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>stub</p>' }));
  await checkPage(page, '/c/pulverulents/');
  await expect(page.locator('.clinks a', { hasText: 'trailer ↗' })).toHaveAttribute('href', 'https://x.com/gruffwashere/status/1960617797278687687');
  await expect(page.locator('.trailer iframe')).toHaveCount(0);
  const play = page.getByRole('button', { name: 'play ↗' });
  await expect(play).toBeVisible();
  await expect(page.locator('.trailer img')).toHaveAttribute('src', /^\/media\/.+\.(webp|png|jpg)$/);
  await play.click();
  const frame = page.locator('.trailer iframe');
  await expect(frame).toHaveAttribute('src', /^https:\/\/platform\.twitter\.com\/embed\/Tweet\.html\?id=1960617797278687687/);
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-downloads');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

// ---- room details (dates, Playing Cards gallery, dive bar stills and commentary) ----
test('room meta lines show the artist\'s dates', async ({ page }) => {
  await checkPage(page, roomPath('the-sigils'));
  await expect(page.locator('p.k', { hasText: '23.04.2026 · web/6529 · live' })).toBeVisible();
  await expect(page.locator('.clinks a')).toHaveText(['open ↗', 'x ↗']);
  await checkPage(page, roomPath('i-love-pure-chaos'));
  await expect(page.locator('p.k', { hasText: '18.05.2026 · web · live' })).toBeVisible();
  await expect(page.locator('.clinks a')).toHaveText(['x ↗']);
});

test('Playing Cards: title, no medium, a 12 card gallery, and the old address redirects', async ({ page }) => {
  await checkPage(page, roomPath('playing-cards'));
  await expect(page.locator('h1')).toHaveText('Playing Cards');
  await expect(page.locator('p.k', { hasText: '2026 · work in progress' })).toBeVisible();
  const imgs = page.locator('.cards img');
  await expect(imgs).toHaveCount(12);
  await expect(page.locator('.cards li').first()).toContainText('7 ♥ · Marked Cards');
  await page.locator('.cards').scrollIntoViewIfNeeded();
  await expect.poll(() => imgs.evaluateAll((els) => els.filter((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0).length)).toBe(12);
  const per = async () => new Set(await page.locator('.cards li').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)))).size;
  const w = page.viewportSize()?.width ?? 0;
  expect(await per()).toBe(w >= 900 ? 4 : w >= 560 ? 3 : 2);
  const res = await page.goto('/experiments/strung-deck/');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/experiments\/playing-cards\/$/);
});

test('the dive bar room shows stills and the artist\'s commentary', async ({ page }) => {
  await checkPage(page, roomPath('dive-bar'));
  await expect(page.locator('h1')).toHaveText('6529 Dive Bar');
  await expect(page.locator('.stills img')).toHaveCount(5);
  await expect(page.locator('.commentary .label')).toHaveText(['What you can do:', 'How it works:']);
  await expect(page.locator('.commentary li')).toHaveCount(6);
  await expect(page.locator('.commentary .sign')).toContainText('gruff');
  expect(await page.locator('.commentary p:not(.head):not(.label)').first().evaluate((el) => getComputedStyle(el).textTransform)).toBe('none');
  await expect(page.locator('.commentary')).toContainText("Maybe's dive bar is the 6529 Brain wave");
});
