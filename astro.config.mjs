import { defineConfig, envField } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { readFileSync } from 'node:fs';
import { parseDocsSettings, starlightSidebar } from './src/lib/docs-settings.mjs';
import { docsGitInfo } from './src/lib/docs-git-dates.mjs';

const docs = parseDocsSettings(readFileSync(new URL('./src/content/settings/docs.yaml', import.meta.url), 'utf8'));

// Starlight keeps the sidebar's open groups and scroll position in
// sessionStorage. The site stores nothing but the consent choice, so the
// script that writes that state is replaced with an empty module.
const SIDEBAR_STATE = /@astrojs\/starlight\/dist\/components-internals\/SidebarPersistState\.js/;
const noSidebarStorage = {
  name: 'ose:no-sidebar-storage',
  enforce: 'pre',
  load(id) {
    return SIDEBAR_STATE.test(id) ? 'export {};' : undefined;
  },
};

// Starlight sets scopedStyleStrategy to 'where' and turns on prefetch for every
// link, for the whole site. With 'where', the site's component styles lose
// specificity and layouts break (the services rows stack). This integration runs
// after Starlight, turns prefetch off and uses 'class'. 'class' has the same
// specificity as Astro's default 'attribute', but Astro also passes the scope
// class to child components such as Starlight's <Icon>. With 'attribute', the
// Starlight rules that style those children match nothing: the sidebar carets
// stop turning and the mobile menu button shows both of its icons.
const keepSiteDefaults = {
  name: 'ose:keep-site-defaults',
  hooks: {
    'astro:config:setup': ({ updateConfig }) => {
      updateConfig({ scopedStyleStrategy: 'class', prefetch: false });
    },
  },
};

export default defineConfig({
  site: 'https://opensourceeurope.org',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  // Legal text is copied from the live site; keep its quotes as they are.
  markdown: { smartypants: false },
  integrations: [
    sitemap({ filter: (page) => !page.endsWith('/404/') && !page.endsWith('.html') }),
    starlight({
      title: docs.title,
      // The site has its own 404 page.
      disable404Route: true,
      sidebar: starlightSidebar(docs.sidebar),
      customCss: ['./src/styles/docs.css'],
      editLink: { baseUrl: 'https://github.com/opensourceeurope/opensourceeurope.org/edit/main/' },
      lastUpdated: true,
      favicon: '/app/uploads/2026/01/cropped-ose-32x32.png',
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/app/uploads/2026/01/cropped-ose-192x192.png', sizes: '192x192' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/app/uploads/2026/01/cropped-ose-180x180.png' } },
        // The Latin subset of the Manrope variable font, preloaded as on the rest of the site.
        { tag: 'link', attrs: { rel: 'preload', href: '/fonts/manrope/Manrope-latin.woff2', as: 'font', type: 'font/woff2', crossorigin: true } },
      ],
      components: {
        Head: './src/components/docs/Head.astro',
        Header: './src/components/docs/Header.astro',
        SocialIcons: './src/components/docs/SocialIcons.astro',
        ThemeProvider: './src/components/docs/ThemeProvider.astro',
        ThemeSelect: './src/components/docs/ThemeSelect.astro',
        Sidebar: './src/components/docs/Sidebar.astro',
        MobileMenuToggle: './src/components/docs/MobileMenuToggle.astro',
        SkipLink: './src/components/docs/SkipLink.astro',
        Footer: './src/components/docs/Footer.astro',
      },
    }),
    keepSiteDefaults,
  ],
  vite: { plugins: [noSidebarStorage, docsGitInfo] },
  env: {
    schema: {
      PUBLIC_CONTACT_ENDPOINT: envField.string({ context: 'client', access: 'public', url: true }),
      PUBLIC_CHAT_ENDPOINT: envField.string({ context: 'client', access: 'public', url: true }),
    },
  },
});
