import { expect, test } from '@playwright/test';
import { checkPage } from './helpers';

// a real visitor: the config's default state turns the card off for every other spec
test.use({ storageState: { cookies: [], origins: [] } });

const card = '#note';

// the artist wants the card on every page load (2026-11-07): closing it only hides it until the next page or refresh
test('the note card appears after the delay, x hides it, and it comes back on the next load', async ({ page }) => {
  await checkPage(page, '/');
  await expect(page.locator(card)).toBeHidden();
  await expect(page.locator(card)).toBeVisible({ timeout: 8000 });
  await expect(page.locator(card).getByText('leave gruff a note')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'close' }).click();
  await expect(page.locator(card)).toBeHidden();
  await page.reload();
  await expect(page.locator(card)).toBeVisible({ timeout: 8000 });
});

test('sending posts the note and shows the thank-you', async ({ page }) => {
  let body: Record<string, unknown> | undefined;
  await page.route('**/api/note', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
  });
  await checkPage(page, '/about/');
  await expect(page.locator(card)).toBeVisible({ timeout: 8000 });
  await page.getByPlaceholder('a word, a thought, a hello').fill('a hello from the test');
  await page.getByPlaceholder('name or @handle').fill('@tester');
  await page.getByRole('button', { name: 'send' }).click();
  await expect(page.getByText('thank you. gruff will read it.')).toBeVisible();
  expect(body).toMatchObject({ text: 'a hello from the test', name: '@tester', hp: '', page: '/about/' });
});

test('a failed send says so and keeps the card', async ({ page }) => {
  await page.route('**/api/note', (route) => route.fulfill({ status: 503, body: '{}' }));
  await checkPage(page, '/about/');
  await expect(page.locator(card)).toBeVisible({ timeout: 8000 });
  await page.getByPlaceholder('a word, a thought, a hello').fill('hello');
  await page.getByRole('button', { name: 'send' }).click();
  await expect(page.getByText('could not send right now')).toBeVisible();
});

test('the card never appears on /notes/, and that page is noindex', async ({ page }) => {
  await checkPage(page, '/notes/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.waitForTimeout(5500);
  await expect(page.locator(card)).toBeHidden();
  await expect(page.locator('header nav a[href="/notes/"]')).toHaveCount(0);
});

test('the notes page renders notes as text, never as html', async ({ page }) => {
  await page.route('**/api/notes', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [{ text: '<img src=x onerror=window.__x=1>hi', name: '<b>n</b>', page: '/', at: '2026-11-06T10:00:00.000Z', country: 'TR' }] }) }),
  );
  await checkPage(page, '/notes/');
  await page.getByLabel('key').fill('some-key');
  await page.getByRole('button', { name: 'open' }).click();
  await expect(page.locator('#ledger li')).toHaveCount(1);
  await expect(page.locator('#ledger')).toContainText('<img src=x');
  await expect(page.locator('#ledger img, #ledger b')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'forget key' })).toBeVisible();
});

test('the card shows again on every page, even after a note was sent', async ({ page }) => {
  await page.route('**/api/note', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' }));
  await checkPage(page, '/');
  await expect(page.locator(card)).toBeVisible({ timeout: 8000 });
  await page.getByPlaceholder('a word, a thought, a hello').fill('hello');
  await page.getByRole('button', { name: 'send' }).click();
  await expect(page.getByText('thank you. gruff will read it.')).toBeVisible();
  await page.goto('/about/');
  await expect(page.locator(card)).toBeVisible({ timeout: 8000 });
});
