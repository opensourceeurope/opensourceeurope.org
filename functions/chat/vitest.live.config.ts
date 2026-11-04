import { defineConfig } from 'vitest/config';

// Live checks against a running chat function (CHAT_LIVE_URL). Kept out of
// `npm test`: the default config only picks up test/**/*.test.ts.
export default defineConfig({
  test: {
    include: ['test/live/**/*.live.ts'],
    testTimeout: 180_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
