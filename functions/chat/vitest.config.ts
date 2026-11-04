import { defineConfig } from 'vitest/config';

// Own config, so the root site config is not picked up from the parent folder.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
