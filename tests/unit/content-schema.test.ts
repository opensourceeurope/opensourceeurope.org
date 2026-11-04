import { describe, expect, it } from 'vitest';
import { z } from 'astro/zod';
import { makeSectionSchema } from '../../src/lib/sections';
import { headingParts } from '../../src/lib/heading';
import { inlineParts } from '../../src/lib/inline';
import { resolveShared } from '../../src/lib/shared';
import type { Section } from '../../src/lib/sections';

const schema = makeSectionSchema(() => z.string());

const contactText = (interest: Record<string, unknown> = {}) => ({
  name: { label: 'Full name*', placeholder: 'Your full name' },
  email: { label: 'Email address*', placeholder: 'name@email.com' },
  interest: { legend: 'I am interested in*', options: ['Founding a project', 'Other'], checked: 'Founding a project', other: 'Other', otherLabel: 'Other Choice, please specify', ...interest },
  message: { label: "What's your message*", placeholder: 'Write your message here...', description: 'Details' },
  link: { label: 'Add a link', placeholder: 'https://' },
  honeypotLabel: 'Leave this field empty',
  submit: 'send a message',
  status: { sent: 'Thanks', invalid: 'Check the form', error: 'Not sent' },
});

const hero = (image: unknown) => ({
  type: 'hero',
  heading: { text: 'We take care of the admin', highlight: 'admin', decor: 'underscore' },
  body: 'Hello',
  image,
});

describe('image fields', () => {
  it('rejects an image without alt, with an issue path ending in alt', () => {
    const result = schema.safeParse(hero({ src: 'a.png' }));
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.at(-1) === 'alt')).toBe(true);
  });

  it('rejects an empty alt unless the image is decorative', () => {
    const result = schema.safeParse(hero({ src: 'a.png', alt: '' }));
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.at(-1) === 'alt')).toBe(true);
  });

  it('accepts an empty alt on a decorative image', () => {
    expect(schema.safeParse(hero({ src: 'a.png', alt: '', decorative: true })).success).toBe(true);
  });
});

describe('section union', () => {
  const page = [
    hero({ src: 'a.png', alt: 'A logo' }),
    { type: 'intro', eyebrow: 'Our mission', heading: { text: 'What makes this possible', decor: 'chevron-underscore', decorAfter: 'makes' }, body: ['One', 'Two'] },
    { type: 'steps', heading: { text: 'Getting started' }, items: [{ title: 'Create', body: 'Do it' }] },
    { type: 'features', heading: { text: 'Key benefits' }, items: [{ title: 'Transparency' }] },
    { type: 'logos', heading: { text: 'Partners' }, items: [{ image: { src: 'l.png', alt: 'Logo' }, name: 'Logo' }] },
    { type: 'cards', heading: { text: 'Projects' }, items: [{ title: 'P', cta: { label: 'view project', href: 'https://opencollective.com/' } }] },
    { type: 'faq', heading: { text: 'Frequently asked questions' }, items: [{ question: 'Q?', answer: 'A.' }] },
    { type: 'cta', heading: { text: 'Ready?' }, ctas: [{ label: 'submit a project', href: '/contact/' }] },
    { type: 'richText', body: ['Text'] },
    { type: 'contactForm', heading: { text: 'Contact' }, form: contactText() },
    { type: 'shared', ref: 'faq-home' },
  ];

  it('parses a valid sample page', () => {
    expect(z.array(schema).parse(page)).toHaveLength(page.length);
  });

  it('rejects an unknown type', () => {
    expect(schema.safeParse({ type: 'carousel' }).success).toBe(false);
  });

  it('rejects an unknown decor value and unknown keys', () => {
    expect(schema.safeParse({ type: 'cta', heading: { text: 'x', decor: 'star' }, ctas: [] }).success).toBe(false);
    expect(schema.safeParse({ type: 'cta', heading: { text: 'x' }, ctas: [], extra: 1 }).success).toBe(false);
  });

  it('rejects a decorAfter that is not part of the heading text', () => {
    const bad = { type: 'cta', heading: { text: 'Open source', decor: 'underscore', decorAfter: 'missing' }, ctas: [] };
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it('accepts several highlights and rejects one missing from the text', () => {
    const quote = (highlight: string[]) => ({ type: 'quote', quote: { text: 'serve our communities.', highlight }, author: 'A' });
    expect(schema.safeParse(quote(['serve', 'communities.'])).success).toBe(true);
    expect(schema.safeParse(quote(['serve', 'roads'])).success).toBe(false);
  });

  it('defaults section variants and rejects unknown ones', () => {
    const parsed = schema.parse({ type: 'steps', heading: { text: 'Steps' }, items: [] });
    expect(parsed).toMatchObject({ variant: 'numbered' });
    expect(schema.safeParse({ type: 'steps', variant: 'pinned', heading: { text: 'Steps' }, items: [] }).success).toBe(false);
  });

  it('rejects glyph characters in heading text', () => {
    expect(schema.safeParse({ type: 'cta', heading: { text: 'Open<_' }, ctas: [] }).success).toBe(false);
  });
});

describe('about page sections', () => {
  const img = { src: 'a.png', alt: '', decorative: true };

  it('parses the title hero, the story and vision intros', () => {
    expect(schema.parse({ type: 'hero', variant: 'title', heading: { text: 'About us' }, background: img })).toMatchObject({ variant: 'title' });
    expect(schema.parse({ type: 'hero', heading: { text: 'Home' } })).toMatchObject({ variant: 'full' });
    expect(schema.safeParse({ type: 'intro', variant: 'story', heading: { text: 'Story' }, images: [img, img] }).success).toBe(true);
    expect(schema.safeParse({ type: 'intro', variant: 'vision', heading: { text: 'Vision' }, image: img, background: img }).success).toBe(true);
    expect(schema.safeParse({ type: 'intro', variant: 'split-reverse', heading: { text: 'Pricing' }, image: img }).success).toBe(true);
  });

  it('parses value cards and requires their label, title and body', () => {
    const item = { label: 'Autonomy', title: 'Your project, your rules', body: 'You write the code.', icon: img };
    expect(schema.safeParse({ type: 'values', heading: { text: 'Our values' }, cardBackground: img, items: [item] }).success).toBe(true);
    expect(schema.safeParse({ type: 'values', heading: { text: 'Our values' }, items: [{ ...item, label: undefined }] }).success).toBe(false);
  });

  it('parses team members and requires a link label for the profile link', () => {
    const member = { name: 'Pia Mancini', role: 'Board Member', bio: 'Cofounder', photo: img };
    const team = (m: object) => ({ type: 'team', heading: { text: 'Team' }, items: [m] });
    expect(schema.safeParse(team({ ...member, link: { label: 'Pia Mancini on LinkedIn', href: 'https://www.linkedin.com/in/piamancini/' } })).success).toBe(true);
    expect(schema.safeParse(team({ ...member, link: { href: 'https://www.linkedin.com/in/piamancini/' } })).success).toBe(false);
  });

  it('parses resource cards whose titles are headings with highlights', () => {
    const item = { icon: img, heading: { text: 'Gitbook documentation', highlight: 'documentation' }, cta: { label: 'Read documentation', href: 'https://docs.opencollective.com/oceurope', variant: 'text' } };
    expect(schema.safeParse({ type: 'resources', heading: { text: 'Resources' }, items: [item] }).success).toBe(true);
    expect(schema.safeParse({ type: 'resources', heading: { text: 'Resources' }, items: [{ ...item, heading: { text: 'x', highlight: 'y' } }] }).success).toBe(false);
  });
});

describe('services sections', () => {
  const img = { src: 'a.png', alt: '', decorative: true };

  it('parses a title hero with a lead paragraph', () => {
    const hero = { type: 'hero', variant: 'title', heading: { text: 'Fiscal hosting' }, body: 'Handling donations.', background: img };
    expect(schema.parse(hero)).toMatchObject({ variant: 'title', body: 'Handling donations.' });
  });

  it('parses stacked step cards with an image each', () => {
    const steps = { type: 'steps', variant: 'stacked', background: img, heading: { text: 'How' }, items: [{ title: 'Apply online', body: 'Fill out a form.', image: img }] };
    expect(schema.parse(steps)).toMatchObject({ variant: 'stacked' });
  });

  it('parses the service list and requires its link label', () => {
    expect(schema.safeParse({ type: 'serviceList', eyebrow: '// Services', linkLabel: 'Read more' }).success).toBe(true);
    expect(schema.safeParse({ type: 'serviceList', eyebrow: '// Services' }).success).toBe(false);
  });
});

describe('resolveShared', () => {
  const faq = { type: 'faq', heading: { text: 'FAQ' }, items: [] } as unknown as Section;
  const shared = new Map<string, Section>([['faq-home', faq]]);

  it('replaces a shared ref with the shared section', () => {
    const sections = [{ type: 'richText', body: ['x'] }, { type: 'shared', ref: 'faq-home' }] as unknown as Section[];
    expect(resolveShared(sections, shared)).toEqual([sections[0], faq]);
  });

  it('throws for a missing ref', () => {
    const sections = [{ type: 'shared', ref: 'missing' }] as unknown as Section[];
    expect(() => resolveShared(sections, shared)).toThrow('Unknown shared section "missing"');
  });
});

describe('headingParts', () => {
  const texts = (h: Parameters<typeof headingParts>[0]) => headingParts(h).map((p) => `${p.kind}:${p.text}`);

  it('puts the glyph at the end by default', () => {
    expect(texts({ text: 'Frequently asked questions', decor: 'chevron-underscore' })).toEqual([
      'text:Frequently asked questions',
      'decor:<_',
    ]);
  });

  it('puts the glyph after decorAfter and marks the highlight', () => {
    expect(texts({ text: 'What makes this possible', decor: 'underscore', decorAfter: 'makes', highlight: 'possible' })).toEqual([
      'text:What makes',
      'decor:_',
      'text: this ',
      'highlight:possible',
    ]);
  });

  it('marks every highlight', () => {
    expect(texts({ text: 'powers government services for communities.', highlight: ['government', 'communities.'] })).toEqual([
      'text:powers ',
      'highlight:government',
      'text: services for ',
      'highlight:communities.',
    ]);
  });

  it('adds no glyph without decor', () => {
    expect(texts({ text: 'Plain', highlight: 'Plain' })).toEqual(['highlight:Plain']);
  });
});

describe('inlineParts', () => {
  const texts = (t: string) => inlineParts(t).map((p) => `${p.kind}:${p.text}`);

  it('splits bold and highlighted runs', () => {
    expect(texts('Provide **open source projects** with ==EU law==.')).toEqual([
      'text:Provide ',
      'strong:open source projects',
      'text: with ',
      'mark:EU law',
      'text:.',
    ]);
  });

  it('leaves plain text and stray markers alone', () => {
    expect(texts('No markup * here')).toEqual(['text:No markup * here']);
    expect(texts('<b>x</b>')).toEqual(['text:<b>x</b>']);
  });
});

describe('how to join and 404 sections', () => {
  const img = { src: 'a.png', alt: '', decorative: true };
  const cta = { label: 'submit a project', href: 'https://oceu.typeform.com/apply' };

  it('parses step cards with a button below them', () => {
    const steps = { type: 'steps', variant: 'spotlight', heading: { text: 'For projects' }, items: [{ title: 'Submit', image: img }], cta };
    expect(schema.parse(steps)).toMatchObject({ cta: { label: 'submit a project', variant: 'primary' } });
  });

  it('parses a feature list with a closing paragraph', () => {
    const features = { type: 'features', variant: 'list', heading: { text: 'Conditions' }, body: 'To join:', items: [{ title: 'Open' }], closing: 'Thanks.', image: img };
    expect(schema.parse(features)).toMatchObject({ closing: 'Thanks.' });
  });

  it('parses the not-found section and requires its lead and link', () => {
    const notFound = { type: 'notFound', heading: { text: '404' }, lead: 'Oops', body: 'Gone.', cta: { label: 'return to homepage', href: '/' }, layers: [{ image: img, show: 'large' }] };
    expect(schema.safeParse(notFound).success).toBe(true);
    expect(schema.safeParse({ ...notFound, lead: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...notFound, cta: undefined }).success).toBe(false);
  });
});

describe('contact form section', () => {
  const section = (form: unknown, extra: Record<string, unknown> = {}) => ({ type: 'contactForm', form, ...extra });

  it('parses the form text and the contact details', () => {
    const details = { title: 'Contact detail', items: [{ label: 'Email address', text: 'a@b.c', href: 'mailto:a@b.c' }] };
    expect(schema.safeParse(section(contactText(), { details })).success).toBe(true);
  });

  it('requires the form text', () => {
    expect(schema.safeParse({ type: 'contactForm' }).success).toBe(false);
  });

  it('rejects a checked or other option that is not one of the options', () => {
    for (const bad of [{ checked: 'Missing' }, { other: 'Missing' }]) {
      const result = schema.safeParse(section(contactText(bad)));
      expect(result.success).toBe(false);
      expect(result.error!.issues.some((i) => i.path.at(-1) === Object.keys(bad)[0])).toBe(true);
    }
  });
});
