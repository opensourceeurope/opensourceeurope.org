import type { ImageMetadata } from 'astro';
import { z } from 'astro/zod';

const DECORS = ['underscore', 'chevron', 'chevron-underscore', 'parens'] as const;
export type Decor = (typeof DECORS)[number];

// The glyphs the live theme writes into heading text. The rebuild renders them
// as aria-hidden decoration, so the text itself holds the words alone.
const GLYPHS = /<|_|\(\)/;

// One highlighted phrase, or several (the home quote marks two words).
const Highlight = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

export const Heading = z
  .object({
    text: z.string().min(1),
    highlight: Highlight.optional(),
    decor: z.enum(DECORS).optional(),
    decorAfter: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((heading, ctx) => {
    if (GLYPHS.test(heading.text)) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'Heading text must not contain decorative glyphs; use decor' });
    }
    const highlights = heading.highlight === undefined ? [] : [heading.highlight].flat();
    if (highlights.some((h) => !heading.text.includes(h))) {
      ctx.addIssue({ code: 'custom', path: ['highlight'], message: 'highlight must appear in text' });
    }
    if (heading.decorAfter) {
      if (!heading.decor) {
        ctx.addIssue({ code: 'custom', path: ['decorAfter'], message: 'decorAfter needs decor' });
      }
      if (!heading.text.includes(heading.decorAfter)) {
        ctx.addIssue({ code: 'custom', path: ['decorAfter'], message: 'decorAfter must appear in text' });
      }
    }
  });

const Cta = z
  .object({
    label: z.string().min(1),
    href: z.string().min(1),
    variant: z.enum(['primary', 'secondary', 'text']).default('primary'),
  })
  .strict();

// The contact form's text. A label ending in `*` marks a required field, and
// the star is drawn in the accent colour. The interest options are also the
// values the contact function accepts (functions/contact/src/fields.ts), so a
// changed option must change there too.
const Field = z.object({ label: z.string().min(1), placeholder: z.string().optional(), description: z.string().optional() }).strict();
const ContactFormText = z
  .object({
    name: Field,
    email: Field,
    interest: z
      .object({
        legend: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
        checked: z.string().min(1),
        // The option that shows the text field, and that field's accessible name.
        other: z.string().min(1),
        otherLabel: z.string().min(1),
      })
      .strict()
      .superRefine((interest, ctx) => {
        for (const key of ['checked', 'other'] as const) {
          if (!interest.options.includes(interest[key])) {
            ctx.addIssue({ code: 'custom', path: [key], message: `${key} must be one of the options` });
          }
        }
      }),
    message: Field,
    link: Field,
    honeypotLabel: z.string().min(1),
    submit: z.string().min(1),
    // Shown at #form-sent, #form-invalid and #form-error after a post without
    // JavaScript, and announced in the live region with JavaScript.
    status: z.object({ sent: z.string().min(1), invalid: z.string().min(1), error: z.string().min(1) }).strict(),
  })
  .strict();

/**
 * Builds the section schema. Astro passes its `image()` helper, which turns
 * a path in YAML into an imported asset and fails the build when the file is
 * missing. Tests pass `() => z.string()`.
 */
export function makeImageSchema<I extends z.ZodType>(image: () => I) {
  return z
    .object({
      src: image(),
      alt: z.string(),
      decorative: z.boolean().optional(),
    })
    .strict()
    .superRefine((img, ctx) => {
      if (img.alt.trim() === '' && !img.decorative) {
        ctx.addIssue({ code: 'custom', path: ['alt'], message: 'alt is required unless the image is decorative' });
      }
    });
}

export function makeSectionSchema<I extends z.ZodType>(image: () => I) {
  const Image = makeImageSchema(image);

  // A decorative image layer behind a section: how it fills the section,
  // where it sits, and at which widths it shows (small: below 1024 px).
  const Layer = z
    .object({
      image: Image,
      fit: z.enum(['cover', 'contain', 'natural']).default('cover'),
      position: z.enum(['top', 'center', 'bottom']).default('center'),
      show: z.enum(['all', 'small', 'large']).default('all'),
    })
    .strict();

  const Circle = z.union([
    z.enum(['empty', 'ring', 'white', 'blue', 'orange']),
    z.object({ logo: Image }).strict(),
    z.object({ photo: Image }).strict(),
    z.object({ center: Image }).strict(),
  ]);

  const common = { id: z.string().min(1).optional() };
  const eyebrow = z.string().optional();
  const paragraphs = z.array(z.string());

  return z.discriminatedUnion('type', [
    z
      .object({
        ...common,
        type: z.literal('hero'),
        // full: full-screen home hero. title: a centred page title over a
        // short gradient banner.
        variant: z.enum(['full', 'title']).default('full'),
        eyebrow,
        heading: Heading,
        body: z.string().optional(),
        ctas: z.array(Cta).default([]),
        image: Image.optional(),
        // Full-bleed image behind the hero.
        background: Image.optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('intro'),
        // stack: one column. mission: eyebrow, heading and text in three
        // columns with a wide image below. split: text beside the image.
        // split-reverse: the image on the left from 1024 px. story: eyebrow
        // beside the heading, then a large image beside the text and a
        // second image (`images`). vision: split over a full-width
        // `background`, the image above the text on small screens.
        variant: z.enum(['stack', 'mission', 'split', 'split-reverse', 'story', 'vision']).default('stack'),
        eyebrow,
        heading: Heading.optional(),
        body: paragraphs.default([]),
        quote: z.object({ text: z.string(), author: z.string(), role: z.string().optional() }).strict().optional(),
        image: Image.optional(),
        images: z.array(Image).default([]),
        background: Image.optional(),
        cta: Cta.optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('quote'),
        // Rendered as an h3, as on the live site.
        quote: Heading,
        author: z.string().min(1),
        role: z.string().optional(),
        avatar: Image.optional(),
        // Rows of round holders below the quote (E2 on the home page). Each
        // holder is an empty or filled circle, a ringed logo, a photo, or the
        // `center` image that grows into the large circle.
        circles: z.array(z.array(Circle)).optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('steps'),
        // numbered: numbered cards. spotlight: centred heading and image cards
        // over a large round background (the settled state of the home page
        // pinned section). stacked: wide cards with a numbered heading, the
        // text beside the image, listed one after another (the settled state
        // of the service pages' pinned section, E10).
        variant: z.enum(['numbered', 'spotlight', 'stacked']).default('numbered'),
        background: Image.optional(),
        eyebrow,
        heading: Heading,
        items: z.array(z.object({ title: z.string(), body: z.string().optional(), image: Image.optional() }).strict()),
        // A button centred below the cards.
        cta: Cta.optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('features'),
        // cards: titled items. list: one line per item beside the image.
        variant: z.enum(['cards', 'list']).default('cards'),
        eyebrow,
        heading: Heading,
        body: z.string().optional(),
        items: z.array(z.object({ title: z.string(), body: z.string().optional() }).strict()),
        // A paragraph after the items.
        closing: z.string().optional(),
        image: Image.optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('logos'),
        eyebrow,
        heading: Heading.optional(),
        body: z.string().optional(),
        items: z.array(
          z.object({ image: Image, name: z.string().optional(), href: z.string().optional() }).strict(),
        ),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('cards'),
        // grid: cards with h3 titles. carousel: photo cards in one row whose
        // titles are plain text, as on the live site.
        variant: z.enum(['grid', 'carousel']).default('grid'),
        eyebrow,
        heading: Heading,
        body: z.string().optional(),
        items: z.array(
          z
            .object({
              title: z.string(),
              body: z.string().optional(),
              image: Image.optional(),
              logo: Image.optional(),
              cta: Cta.optional(),
            })
            .strict(),
        ),
        cta: Cta.optional(),
      })
      .strict(),
    z
      .object({
        ...common,
        // A row of value cards that scrolls sideways (the settled state of E9).
        type: z.literal('values'),
        eyebrow,
        heading: Heading,
        // The panel image behind every card.
        cardBackground: Image.optional(),
        items: z.array(
          z.object({ label: z.string().min(1), title: z.string().min(1), body: z.string().min(1), icon: Image.optional() }).strict(),
        ),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('team'),
        eyebrow,
        heading: Heading,
        items: z.array(
          z
            .object({
              name: z.string().min(1),
              role: z.string().optional(),
              bio: z.string().optional(),
              photo: Image,
              // An icon link: `label` is its accessible name.
              link: z.object({ label: z.string().min(1), href: z.string().min(1) }).strict().optional(),
            })
            .strict(),
        ),
      })
      .strict(),
    z
      .object({
        ...common,
        // Link cards with an icon, a heading and a text link.
        type: z.literal('resources'),
        eyebrow,
        heading: Heading,
        items: z.array(z.object({ icon: Image.optional(), heading: Heading, cta: Cta }).strict()),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('faq'),
        eyebrow,
        heading: Heading,
        items: z.array(z.object({ question: z.string(), answer: z.string() }).strict()),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('cta'),
        // plain: left-aligned. funders: centred over a field of circles.
        // banner: centred in a framed gradient panel.
        variant: z.enum(['plain', 'funders', 'banner']).default('plain'),
        // banner: the image inside the panel.
        background: Image.optional(),
        // Image layers behind the whole section, in paint order.
        layers: z.array(Layer).default([]),
        eyebrow,
        heading: Heading,
        body: z.string().optional(),
        ctas: z.array(Cta).default([]),
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('richText'),
        eyebrow,
        heading: Heading.optional(),
        body: paragraphs,
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal('contactForm'),
        eyebrow,
        heading: Heading.optional(),
        body: z.string().optional(),
        // The column beside the form: a title, then labelled links.
        details: z
          .object({
            title: z.string().min(1),
            items: z.array(z.object({ label: z.string().min(1), text: z.string().min(1), href: z.string().min(1) }).strict()),
          })
          .strict()
          .optional(),
        form: ContactFormText,
      })
      .strict(),
    z
      .object({
        ...common,
        // One row per entry of the `services` collection, in `order`. The
        // heading, text and image come from the entry; `linkLabel` names the
        // link to its page.
        type: z.literal('serviceList'),
        eyebrow,
        linkLabel: z.string().min(1),
      })
      .strict(),
    z
      .object({
        ...common,
        // The 404 page: the heading is the page's h1, over image layers
        // that fill the screen.
        type: z.literal('notFound'),
        heading: Heading,
        lead: z.string().min(1),
        body: z.string().min(1),
        cta: Cta,
        layers: z.array(Layer).default([]),
      })
      .strict(),
    z
      .object({
        ...common,
        // The chat of the /ask/ page. Its texts come from `settings.chat`.
        type: z.literal('chat'),
      })
      .strict(),
    z
      .object({
        ...common,
        // Copyable code blocks. The "Copy" and "Copied" labels come from `settings.ui`.
        type: z.literal('snippets'),
        eyebrow,
        heading: Heading,
        intro: z.string().optional(),
        items: z.array(z.object({ title: z.string().min(1), code: z.string().min(1), hint: z.string().optional() }).strict()).min(1),
      })
      .strict(),
    z.object({ ...common, type: z.literal('shared'), ref: z.string().min(1) }).strict(),
  ]);
}

export type SectionSchema<I extends z.ZodType = z.ZodType<ImageMetadata>> = ReturnType<typeof makeSectionSchema<I>>;
export type Section = z.infer<SectionSchema>;
export type SectionType = Section['type'];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;
export type HeadingData = z.infer<typeof Heading>;
export type CtaData = z.infer<typeof Cta>;
export type ImageData = Exclude<Extract<Section, { type: 'hero' }>['image'], undefined>;
export type LayerData = Extract<Section, { type: 'cta' | 'notFound' }>['layers'][number];
