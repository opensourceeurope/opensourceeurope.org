import type { Section } from './sections';

/** Replaces each `{ type: 'shared', ref }` section with the shared section it names. */
export function resolveShared(sections: Section[], shared: Map<string, Section>): Section[] {
  return sections.map((section) => {
    if (section.type !== 'shared') return section;
    const target = shared.get(section.ref);
    if (!target) throw new Error(`Unknown shared section "${section.ref}"`);
    if (target.type === 'shared') throw new Error(`Shared section "${section.ref}" must not reference another shared section`);
    return target;
  });
}
