import { expect, type Page } from '@playwright/test';

// Shared by every spec: Playwright refuses a spec file that imports another spec file.
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
