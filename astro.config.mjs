import { defineConfig, envField } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://opensourceeurope.org',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  // Legal text is copied from the live site; keep its quotes as they are.
  markdown: { smartypants: false },
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404/') && !page.endsWith('.html') })],
  env: {
    schema: {
      PUBLIC_CONTACT_ENDPOINT: envField.string({ context: 'client', access: 'public', url: true }),
      PUBLIC_CHAT_ENDPOINT: envField.string({ context: 'client', access: 'public', url: true }),
    },
  },
});
