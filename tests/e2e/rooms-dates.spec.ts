import { expect, test } from '@playwright/test';
import { ROOMS, roomDateLabel, roomPath } from '../../src/lib/rooms';
import { checkPage } from './smoke.spec';

test('index rows show each room date in the no column', async ({ page }) => {
  await checkPage(page, '/');
  const no = (slug: string) => page.locator(`#ledger a.row[data-code="room:${slug}"] .no`);
  await expect(no('the-sigils')).toHaveText('23.04.2026');
  await expect(no('i-love-pure-chaos')).toHaveText('18.05.2026');
  for (const r of ROOMS) await expect(no(r.slug)).toHaveText(roomDateLabel(r));
});

test('experiments cards show the date on the first line and the medium on the meta line', async ({ page }) => {
  await checkPage(page, '/experiments/');
  await expect(page.locator('.room')).toHaveCount(6);
  const sigils = page.locator(`.room[href="${roomPath('the-sigils')}"]`);
  await expect(sigils.locator('.k').first()).toHaveText('23.04.2026');
  await expect(sigils.locator('.k').last()).toHaveText('23.04.2026 · web/6529 · live');
  await expect(page.locator('a.room', { hasText: 'trailer' })).toHaveCount(0);
});

test('the old trailer room address goes to Pulverulents, which keeps the trailer block', async ({ page }) => {
  await page.goto('/experiments/pulverulents-trailer/');
  await expect(page).toHaveURL(/\/c\/pulverulents\/$/);
  await expect(page.locator('.trailer')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'play ↗' })).toBeVisible();
  await expect(page.locator('.clinks a', { hasText: 'trailer ↗' })).toHaveCount(1);
});
