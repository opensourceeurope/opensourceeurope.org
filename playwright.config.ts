import { defineConfig, devices } from '@playwright/test';

const SITE = 'http://localhost:4321';

// The contact function for the form tests: one instance without the minimum
// delay, and one with the production 3000 ms for the spam test. Each writes
// its own outbox. They are never reused, so a function started by hand with
// another delay cannot answer the tests.
const contactFunction = (port: number, minDelayMs: string, outbox: string) => ({
  command: 'npm run dev:function',
  port,
  reuseExistingServer: false,
  timeout: 60_000,
  env: { PORT: String(port), MIN_DELAY_MS: minDelayMs, OUTBOX_FILE: outbox, ALLOWED_ORIGINS: SITE, SITE_URL: SITE },
});

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4321',
      url: SITE,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { PUBLIC_CONTACT_ENDPOINT: 'http://localhost:8081', PUBLIC_CHAT_ENDPOINT: 'http://localhost:8090/chat' },
    },
    contactFunction(8081, '0', 'test-results/outbox.jsonl'),
    contactFunction(8082, '3000', 'test-results/outbox-slow.jsonl'),
  ],
  use: { baseURL: SITE },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'no-js',
      testIgnore: /site\.spec\.ts|no-js-a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, javaScriptEnabled: false },
    },
  ],
});
