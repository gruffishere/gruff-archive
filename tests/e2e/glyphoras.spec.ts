import { expect, test } from '@playwright/test';
import { collections, tokensOf } from '../../src/lib/data';
import { workPath } from '../../src/lib/links';
import { checkPage } from './helpers';

// Glyphoras joined the archive on 2026-11-22: a garden window onto glyphoras.art on the collection page, and the live
// work read from the contract on each work page.
const gly = () => collections().find((c) => c.slug === 'glyphoras');
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const abiString = (s: string) => {
  const hex = Buffer.from(s, 'utf8').toString('hex');
  const word = (n: number) => n.toString(16).padStart(64, '0');
  return `0x${word(32)}${word(hex.length / 2)}${hex.padEnd(Math.ceil(hex.length / 64) * 64, '0')}`;
};
const RPC = /ethereum-rpc\.publicnode\.com|eth\.drpc\.org/;

test.beforeEach(() => {
  test.skip(!gly(), 'pending the inventory run that adds Glyphoras');
});

test('the collection page opens the artist garden in place, and a holder garden from the field', async ({ page }) => {
  // never load the real garden in a test
  await page.route('https://glyphoras.art/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>garden</title>' }));
  await checkPage(page, '/c/glyphoras/');
  const win = page.locator('[data-garden]');
  await expect(win.locator('button.poster img')).toHaveAttribute('src', '/c/glyphoras/garden.webp');
  await expect(win.locator('iframe')).toHaveCount(0);
  const enter = win.locator('.enter');
  await expect(enter).toHaveText('enter the garden ↗');
  expect((await win.locator('button.poster').boundingBox())!.height).toBeGreaterThan(200);

  await win.locator('input').fill('not a wallet');
  await win.locator('form button').click();
  await expect(win.locator('.hint')).toHaveText(/address .* or an ens name/);
  await expect(win.locator('iframe')).toHaveCount(0);

  await win.locator('button.poster').click();
  const frame = win.locator('iframe.frame');
  await expect(frame).toHaveAttribute('src', 'https://glyphoras.art/garden/gruffdzn.eth');
  await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);

  await win.locator('input').fill('  Vitalik.ETH ');
  await win.locator('form button').click();
  await expect(win.locator('.hint')).toHaveText('');
  await expect(frame).toHaveAttribute('src', 'https://glyphoras.art/garden/vitalik.eth');
  expect(await page.locator('.works a.work').count()).toBeGreaterThan(0);
});

test('a work plays live from its contract, and says so when the chain cannot be reached', async ({ page }) => {
  const t = tokensOf('glyphoras')[0]!;
  const html = '<!doctype html><title>live</title><body style="background:#000;color:#0f0">glyphora live</body>';
  const uri = `data:application/json;base64,${b64(JSON.stringify({ name: t.name, animation_url: `data:text/html;base64,${b64(html)}` }))}`;
  let up = false;
  await page.route(RPC, (r) => (up ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: abiString(uri) }) }) : r.abort()));
  await checkPage(page, workPath('glyphoras', t.id));
  const live = page.locator('[data-live]');
  await expect(live.locator('.screen img, .screen iframe')).toHaveCount(1);
  const play = live.locator('button.play');
  await expect(play).toHaveText('play ▶');
  expect((await play.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);

  await play.click();
  await expect(live.locator('.note')).toHaveText('the chain could not be reached. try again.');
  await expect(play).toHaveText('play ▶');
  await expect(live.locator('iframe.livef')).toHaveCount(0);

  up = true;
  await play.click();
  const frame = live.locator('iframe.livef');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(page.frameLocator('iframe.livef').locator('body')).toHaveText('glyphora live');
  await expect(play).toBeHidden();
});

test('a work label links its garden and its record on glyphoras.art', async ({ page }) => {
  const t = tokensOf('glyphoras').find((x) => x.owners.length === 1)!;
  await checkPage(page, workPath('glyphoras', t.id));
  const links = page.locator('.label .links');
  await expect(links.locator('a', { hasText: 'its garden' })).toHaveAttribute('href', `https://glyphoras.art/garden/${t.owners[0]!.address}`);
  await expect(links.locator('a', { hasText: 'record' })).toHaveAttribute('href', `https://glyphoras.art/record/${t.id}`);
});

test('no other collection grows a garden window or a play button', async ({ page }) => {
  await checkPage(page, '/c/facets/');
  await expect(page.locator('[data-garden]')).toHaveCount(0);
  await checkPage(page, '/w/phigures/1/');
  await expect(page.locator('[data-live]')).toHaveCount(0);
});
