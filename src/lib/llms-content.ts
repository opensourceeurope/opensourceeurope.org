// The content of /llms.txt, /llms-full.txt and the Markdown copies of the docs pages, read from
// the content collections and the docs sidebar.
import { getCollection } from 'astro:content';
import docsSettingsText from '../content/settings/docs.yaml?raw';
import manifest from '../../.release-please-manifest.json';
import { parseDocsSettings, sidebarPages } from './docs-settings.mjs';
import { docsMarkdown, fillVersion, pageTitle, type DocsPage, type LlmsLink, type LlmsSection } from './llms';
import { loadSettings } from './site';

const VERSION: string = manifest['.'];

/** The title, summary and paragraph at the top of /llms.txt and /llms-full.txt. */
export async function llmsHead() {
  const { seo, llms } = await loadSettings();
  return { title: seo.site_name, summary: llms.summary, details: llms.details };
}

async function websiteLinks(site: URL, siteName: string): Promise<LlmsLink[]> {
  const link = (path: string, seo: { title: string; description: string; noindex?: boolean }) =>
    seo.noindex ? [] : [{ title: pageTitle(seo.title, siteName), url: new URL(path, site).href, description: seo.description }];
  const pages = (await getCollection('pages')).flatMap((entry) =>
    link(entry.id === 'home' ? '/' : `/${entry.id}/`, entry.data.seo),
  );
  const services = (await getCollection('services')).flatMap((entry) => link(`/services/${entry.id}/`, entry.data.seo));
  const legal = (await getCollection('legal')).flatMap((entry) => link(`/${entry.id}/`, entry.data.seo));
  return [...pages, ...services, ...legal].sort((a, b) => a.url.localeCompare(b.url));
}

let docsCache: Promise<DocsPage[]> | undefined;

/** Every docs page in the sidebar, in its order, with its Markdown. Built once per build. */
export function docsPages(site: URL): Promise<DocsPage[]> {
  docsCache ??= (async () => {
    const { llms } = await loadSettings();
    const entries = new Map((await getCollection('docs')).map((entry) => [entry.id, entry]));
    return sidebarPages(parseDocsSettings(docsSettingsText).sidebar).flatMap((id) => {
      const entry = entries.get(id);
      if (!entry) return [];
      const url = new URL(`/${id}/`, site).href;
      const { title, description } = entry.data;
      return [{ title, url, description, markdown: docsMarkdown({ title, url, body: entry.body ?? '' }, site.origin, llms.source_label) }];
    });
  })();
  return docsCache;
}

/** The sections of /llms.txt. */
export async function llmsSections(site: URL): Promise<LlmsSection[]> {
  const { seo, llms } = await loadSettings();
  return [
    { heading: llms.website_heading, links: await websiteLinks(site, seo.site_name) },
    { heading: llms.docs_heading, links: await docsPages(site) },
    {
      heading: llms.tools_heading,
      links: llms.tools.map((tool) => ({ title: tool.label, url: tool.href, description: fillVersion(tool.description, VERSION) })),
    },
    {
      heading: llms.optional_heading,
      links: [{ title: llms.full_label, url: new URL('/llms-full.txt', site).href, description: llms.full_description }],
    },
  ];
}
