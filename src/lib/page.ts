import { getEntry } from 'astro:content';
import type { Seo } from './seo';
import type { Section } from './sections';

export async function loadPage(
  collection: 'pages' | 'services',
  id: string,
): Promise<{ seo: Seo; sections: Section[] }> {
  const entry = await getEntry(collection, id);
  if (!entry) throw new Error(`Unknown ${collection} entry "${id}"`);
  return { seo: entry.data.seo, sections: entry.data.sections as Section[] };
}
