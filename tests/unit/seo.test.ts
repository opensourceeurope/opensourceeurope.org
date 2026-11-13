import { describe, expect, it } from 'vitest';
import { blogPostingJsonLd, faqJsonLd, organizationJsonLd, serviceJsonLd, websiteJsonLd } from '../../src/lib/seo';

const site = new URL('https://opensourceeurope.org');
const siteSeo = {
  site_name: 'Open Source Europe',
  logo: '/app/uploads/2026/01/cropped-ose.png',
  default_og_image: '/app/uploads/2026/01/cropped-ose.png',
};

describe('organizationJsonLd', () => {
  const org = organizationJsonLd(site, siteSeo) as Record<string, any>;

  it('describes Open Source Europe as an NGO', () => {
    expect(org['@type']).toBe('NGO');
    expect(org.name).toBe('Open Source Europe');
  });

  it('points the logo at the uploaded OSE logo', () => {
    expect(org.logo.url.endsWith('/app/uploads/2026/01/cropped-ose.png')).toBe(true);
  });
});

describe('websiteJsonLd', () => {
  it('has no search action, because site search is gone', () => {
    expect(websiteJsonLd(site, siteSeo)).not.toHaveProperty('potentialAction');
  });
});

describe('organizationJsonLd with the optional fields', () => {
  const org = organizationJsonLd(site, {
    ...siteSeo,
    email: 'home@opensourceeurope.org',
    address: { locality: 'Brussels', country: 'BE' },
    same_as: ['https://github.com/opensourceeurope'],
  }) as Record<string, any>;

  it('adds the contact, the address and the other profiles', () => {
    expect(org.email).toBe('home@opensourceeurope.org');
    expect(org.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Brussels', addressCountry: 'BE' });
    expect(org.sameAs).toEqual(['https://github.com/opensourceeurope']);
  });

  it('leaves out the fields that are not set', () => {
    expect(organizationJsonLd(site, siteSeo)).not.toHaveProperty('sameAs');
  });
});

describe('faqJsonLd', () => {
  it('turns each item into a question with an accepted answer', () => {
    const faq = faqJsonLd([{ question: 'Q?', answer: 'A.' }]) as Record<string, any>;
    expect(faq['@type']).toBe('FAQPage');
    expect(faq.mainEntity[0]).toEqual({ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } });
  });
});

describe('serviceJsonLd', () => {
  it('names the service without the site suffix and points to the organisation', () => {
    const service = serviceJsonLd(site, 'https://opensourceeurope.org/services/x/', { title: 'Fiscal hosting | Open Source Europe', description: 'D' }) as Record<string, any>;
    expect(service.name).toBe('Fiscal hosting');
    expect(service.provider['@id']).toBe('https://opensourceeurope.org/#organization');
  });
});

describe('blogPostingJsonLd', () => {
  const base = { title: 'T', description: 'D', date: new Date('2026-11-09') };
  it('uses the publication date when the post has no update', () => {
    const post = blogPostingJsonLd(site, 'https://opensourceeurope.org/blog/t/', '/img.png', base) as Record<string, any>;
    expect(post.dateModified).toBe(post.datePublished);
    expect(post.author['@id']).toBe('https://opensourceeurope.org/#organization');
  });
  it('names the author as a person', () => {
    const post = blogPostingJsonLd(site, 'u', '/img.png', { ...base, author: 'A' }) as Record<string, any>;
    expect(post.author).toEqual({ '@type': 'Person', name: 'A' });
  });
});
