// Parses src/content/settings/docs.yaml. Plain JavaScript, because
// astro.config.mjs imports it before Vite runs. Components import the file
// with `?raw`, so the bundle carries the text.
import { parse } from 'yaml';

/**
 * @typedef {{ page: string } | { label: string; link: string } | { label: string; items: SidebarEntry[] }} SidebarEntry
 * @typedef {{ label: string; manual_label: string; manual_text: string; ai_text: string; clone_command: string; more_label: string; more_href: string }} EditSettings
 * @typedef {{ title: string; menu_label: string; edit: EditSettings; sidebar: SidebarEntry[] }} DocsSettings
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
  for (const key of ['title', 'menu_label']) {
    if (typeof data?.[key] !== 'string' || !data[key]) throw new Error(`docs.yaml: ${key} is required`);
  }
  for (const key of ['label', 'manual_label', 'manual_text', 'ai_text', 'clone_command', 'more_label', 'more_href']) {
    if (typeof data.edit?.[key] !== 'string' || !data.edit[key]) throw new Error(`docs.yaml: edit.${key} is required`);
  }
  if (!Array.isArray(data.sidebar)) throw new Error('docs.yaml: sidebar is required');
  data.sidebar.forEach((entry, i) => checkEntry(entry, `[${i}]`));
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
