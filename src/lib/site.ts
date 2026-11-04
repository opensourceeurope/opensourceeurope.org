import { getEntry } from 'astro:content';

/** The site settings from `src/content/settings/site.yaml`. */
export async function loadSettings() {
  const entry = await getEntry('settings', 'site');
  if (!entry) throw new Error('Missing src/content/settings/site.yaml');
  return entry.data;
}
