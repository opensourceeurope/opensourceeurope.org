// Parses src/content/settings/docs.yaml. Plain JavaScript, because
// astro.config.mjs imports it before Vite runs. The config reads the file from
// disk; components import it with `?raw`, so the bundle carries the text.
import { parse } from 'yaml';

/**
 * @typedef {{ label: string; href: string }} Link
 * @typedef {{ page: string } | { label: string; link: string } | { label: string; items: SidebarEntry[] }} SidebarEntry
 * @typedef {{ title: string; header_links: Link[]; apply_label: string; sidebar: SidebarEntry[] }} DocsSettings
 */

/** @param {any} entry @param {string} where */
function checkEntry(entry, where) {
  const kinds = ['page', 'link', 'items'].filter((key) => entry?.[key] !== undefined);
  if (kinds.length !== 1) throw new Error(`docs.yaml: sidebar entry ${where} needs exactly one of page, link or items`);
  if (kinds[0] !== 'page' && !entry.label) throw new Error(`docs.yaml: sidebar entry ${where} needs a label`);
  if (entry.items) entry.items.forEach((child, i) => checkEntry(child, `${where} > ${entry.label}[${i}]`));
}

/**
 * @param {string} text the contents of docs.yaml
 * @returns {DocsSettings}
 */
export function parseDocsSettings(text) {
  const data = parse(text);
  for (const key of ['title', 'apply_label']) {
    if (typeof data?.[key] !== 'string' || !data[key]) throw new Error(`docs.yaml: ${key} is required`);
  }
  if (!Array.isArray(data.sidebar)) throw new Error('docs.yaml: sidebar is required');
  data.sidebar.forEach((entry, i) => checkEntry(entry, `[${i}]`));
  for (const link of data.header_links ?? []) {
    if (!link.label || !link.href) throw new Error('docs.yaml: every header link needs a label and an href');
  }
  return data;
}

/** Every page slug the sidebar lists, in order. @param {SidebarEntry[]} entries @returns {string[]} */
export function sidebarPages(entries) {
  return entries.flatMap((entry) => ('page' in entry ? [entry.page] : 'items' in entry ? sidebarPages(entry.items) : []));
}

/** The sidebar in the shape Starlight expects. @param {SidebarEntry[]} entries */
export function starlightSidebar(entries) {
  return entries.map((entry) =>
    'page' in entry
      ? entry.page
      : 'items' in entry
        ? { label: entry.label, items: starlightSidebar(entry.items) }
        : { label: entry.label, link: entry.link },
  );
}
