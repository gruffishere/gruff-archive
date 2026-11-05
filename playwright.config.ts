import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  // Every spec but notes.spec starts as a visitor who already closed the note card, so it never covers what a test clicks.
  use: { baseURL: 'http://localhost:4321', storageState: { cookies: [], origins: [{ origin: 'http://localhost:4321', localStorage: [{ name: 'gruff-note-done', value: '1' }] }] } },
  webServer: { command: 'npm run build && npm run preview', port: 4321, reuseExistingServer: false, timeout: 600_000 },
  projects: [
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
