import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsSchema } from '@astrojs/starlight/schema';
import { Heading, makeImageSchema, makeSectionSchema } from './lib/sections';

const seo = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  ogImage: z.string().optional(),
  noindex: z.boolean().optional(),
});

const link = z.object({ label: z.string().min(1), href: z.string().min(1) }).strict();

const pages = defineCollection({
  loader: glob({ pattern: '*.yaml', base: 'src/content/pages' }),
  schema: ({ image }) => z.object({ seo, sections: z.array(makeSectionSchema(image)) }).strict(),
});

const services = defineCollection({
  loader: glob({ pattern: '*.yaml', base: 'src/content/services' }),
  schema: ({ image }) =>
    z
      .object({
        seo,
        order: z.number(),
        // The services page lists each service with this heading, summary and image.
        heading: Heading,
        summary: z.string().min(1),
        image: makeImageSchema(image),
        sections: z.array(makeSectionSchema(image)),
      })
      .strict(),
});

const legal = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/content/legal' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string().min(1),
        // The paragraph under the title.
        lead: z.string().optional(),
        // The image behind the title.
        background: makeImageSchema(image),
        seo,
        updated: z.coerce.date(),
        // Sections after the text, such as the shared closing call to action.
        sections: z.array(makeSectionSchema(image)).default([]),
      })
      .strict(),
});

// Blog posts at /blog/<file name>/, newest first. The RSS feed at /rss.xml lists them too.
const blog = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/content/blog' }),
  schema: z
    .object({
      title: z.string().min(1),
      // Shown under the title in the post list, and used by search results, link previews and the feed.
      description: z.string().min(1),
      // The publication date. The list, the feed and the previous and next links follow it.
      date: z.coerce.date(),
      // Set when a post changes after publication. The post shows it as "Last updated".
      updated: z.coerce.date().optional(),
      author: z.string().min(1).optional(),
      // The Open Collective update that announces the post. The post ends with a link to discuss it there.
      discussion: z.url().optional(),
      // A draft shows in `npm run dev` only. The build and the feed leave it out.
      draft: z.boolean().default(false),
    })
    .strict(),
});

const shared = defineCollection({
  loader: glob({ pattern: '*.yaml', base: 'src/content/shared' }),
  schema: ({ image }) => makeSectionSchema(image),
});

const settings = defineCollection({
  loader: glob({ pattern: 'site.yaml', base: 'src/content/settings' }),
  schema: ({ image }) =>
    z
      .object({
        ui: z
          .object({
            logo: z
              .object({ src: z.string().min(1), alt: z.string().min(1), width: z.number(), height: z.number() })
              .strict(),
            apply_label: z.string().min(1),
            menu_label: z.string().min(1),
            skip_link_label: z.string().min(1),
            nav_label: z.string().min(1),
            footer_nav_label: z.string().min(1),
            // Accessible names of the motion controls (E3, E4). The dot label is followed by the card number.
            marquee_pause_label: z.string().min(1),
            carousel_prev_label: z.string().min(1),
            carousel_next_label: z.string().min(1),
            carousel_dot_label: z.string().min(1),
            // The visually hidden word between a CTA label and its context: "Read more" + "about" + "Cloud".
            cta_context_connector: z.string().min(1),
            // Labels of the copy buttons on code snippets and of their confirmation.
            copy_label: z.string().min(1),
            copied_label: z.string().min(1),
          })
          .strict(),
        // Texts of the chat, shared by the /ask/ page and the panel. Keep in step with ChatTexts.
        chat: z
          .object({
            title: z.string().min(1),
            intro: z.string().min(1),
            placeholder: z.string().min(1),
            input_label: z.string().min(1),
            honeypot_label: z.string().min(1),
            send_label: z.string().min(1),
            suggestions_label: z.string().min(1),
            suggestions: z.array(z.string().min(1)).min(1),
            sharing_on: z.string().min(1),
            sharing_off: z.string().min(1),
            sharing_settings: z.string().min(1),
            local_note: z.string().min(1),
            local_link: link,
            demo_note: z.string().min(1),
            memory_note: z.string().min(1),
            sources_label: z.string().min(1),
            you_label: z.string().min(1),
            assistant_label: z.string().min(1),
            loading: z.string().min(1),
            loading_long: z.string().min(1),
            // Before the first search, when the query is not known yet.
            status_searching_start: z.string().min(1),
            // {query} is replaced with the search query.
            status_searching: z.string().includes('{query}'),
            status_writing: z.string().min(1),
            status_ready: z.string().min(1),
            stop_label: z.string().min(1),
            stopped_note: z.string().min(1),
            followups_label: z.string().min(1),
            error: z.string().min(1),
            error_busy: z.string().min(1),
            error_unavailable: z.string().min(1),
            error_timeout: z.string().min(1),
            no_js: z.string().min(1),
            open_label: z.string().min(1),
            close_label: z.string().min(1),
            // The drag handle on the panel's left edge, read by screen readers.
            resize_label: z.string().min(1),
            how_it_works: link,
            shortcut_mac: z.string().min(1),
            shortcut_other: z.string().min(1),
          })
          .strict(),
        // Organisation name and images used in the head and in the JSON-LD. Paths are served from public/.
        seo: z
          .object({
            site_name: z.string().min(1),
            logo: z.string().startsWith('/'),
            default_og_image: z.string().startsWith('/'),
          })
          .strict(),
        nav: z.array(link.extend({ icon: z.literal('ai').optional() }).strict()),
        footer: z
          .object({
            background: image(),
            columns: z.array(
              z
                .object({
                  title: z.string(),
                  links: z.array(link.extend({ prefix: z.string().optional(), external: z.boolean().optional() }).strict()),
                })
                .strict(),
            ),
            // `icon: github` shows the GitHub mark, and the label becomes the link's hidden name.
            social: z.array(link.extend({ icon: z.enum(['github']).optional() }).strict()),
            // `action: cookie-settings` marks the link that reopens the consent banner.
            legal: z.array(link.extend({ action: z.enum(['cookie-settings']).optional() }).strict()),
            copyright: z.string(),
            credit: z.object({ prefix: z.string(), label: z.string(), href: z.string() }).strict().optional(),
          })
          .strict(),
        // Wording of the consent banner. Accepting analytics loads no script. It only lets the chat share questions.
        consent: z
          .object({
            title: z.string().min(1),
            body: z.string().min(1),
            privacy_link: link,
            accept: z.string().min(1),
            reject: z.string().min(1),
            settings: z.string().min(1),
            save: z.string().min(1),
            close_label: z.string().min(1),
            always_on: z.string().min(1),
            necessary: z.object({ name: z.string().min(1), description: z.string().min(1) }).strict(),
            analytics: z.object({ name: z.string().min(1), description: z.string().min(1) }).strict(),
          })
          .strict(),
        apply_url: z.url(),
        // The files for AI tools at /llms.txt and /llms-full.txt. See src/lib/llms.ts.
        llms: z
          .object({
            summary: z.string().min(1),
            details: z.string().min(1),
            website_heading: z.string().min(1),
            docs_heading: z.string().min(1),
            blog_heading: z.string().min(1),
            tools_heading: z.string().min(1),
            tools: z.array(z.object({ label: z.string().min(1), href: z.url(), description: z.string().min(1) }).strict()).min(1),
            optional_heading: z.string().min(1),
            full_label: z.string().min(1),
            full_description: z.string().min(1),
            // Before the address of each page in the Markdown copies, as in "Source: https://...".
            source_label: z.string().min(1),
          })
          .strict(),
        // Texts of the blog at /blog/ and of its RSS feed.
        blog: z
          .object({
            title: z.string().min(1),
            description: z.string().min(1),
            // The page title suffix of a post, as in "Join us in Paris | OSE blog".
            title_suffix: z.string().min(1),
            intro: z.string().min(1),
            all_posts_label: z.string().min(1),
            posts_label: z.string().min(1),
            rss_label: z.string().min(1),
            empty: z.string().min(1),
            // {author} is replaced with the author's name.
            byline: z.string().includes('{author}'),
            // The section at the end of a post that has a `discussion` link.
            discuss: z
              .object({
                heading: z.string().min(1),
                intro: z.string().min(1),
                // The link to the post's `discussion` URL, the Open Collective update about it.
                discussion_label: z.string().min(1),
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
});

// The documentation at /docs/, rendered by Starlight. Pages live in docs/ at the repository root.
// Starlight's docsLoader() only reads docs/, so a glob loader reads docs/ instead and
// prefixes each id with docs/, which keeps the URLs under /docs/. docs/faq/index.md is /docs/faq/.
const docs = defineCollection({
  loader: glob({
    base: './docs',
    // docs/superpowers/ holds local agent plans that git ignores. They are not pages.
    pattern: ['**/[^_]*.{md,mdx}', '!superpowers/**'],
    generateId: ({ entry }) => {
      const path = entry.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
      return path ? `docs/${path}` : 'docs';
    },
  }),
  schema: docsSchema(),
});

export const collections = { pages, services, legal, blog, shared, settings, docs };
