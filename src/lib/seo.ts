export type Seo = {
  title: string;
  description: string;
  ogImage?: string;
  noindex?: boolean;
};

/** The `seo` block of `src/content/settings/site.yaml`. */
export type SiteSeo = {
  site_name: string;
  alternate_name?: string;
  description?: string;
  logo: string;
  default_og_image: string;
  email?: string;
  founding_date?: string;
  address?: { locality: string; country: string };
  same_as?: string[];
};

/** The `@id` of the organisation, so other JSON-LD nodes can point to it. */
export function organizationId(site: URL): string {
  return new URL('/#organization', site).href;
}

export function organizationJsonLd(site: URL, seo: SiteSeo): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    '@id': organizationId(site),
    name: seo.site_name,
    ...(seo.alternate_name && { alternateName: seo.alternate_name }),
    ...(seo.description && { description: seo.description }),
    url: new URL('/', site).href,
    logo: {
      '@type': 'ImageObject',
      url: new URL(seo.logo, site).href,
    },
    ...(seo.email && { email: seo.email }),
    ...(seo.founding_date && { foundingDate: seo.founding_date }),
    ...(seo.address && {
      address: { '@type': 'PostalAddress', addressLocality: seo.address.locality, addressCountry: seo.address.country },
    }),
    ...(seo.same_as?.length && { sameAs: seo.same_as }),
  };
}

export function websiteJsonLd(site: URL, seo: SiteSeo): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: seo.site_name,
    url: new URL('/', site).href,
    inLanguage: 'en',
    publisher: { '@id': organizationId(site) },
  };
}

/** A FAQPage from the question and answer pairs of a FAQ section. */
export function faqJsonLd(items: { question: string; answer: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

/** A Service that the organisation provides, for a page under /services/. */
export function serviceJsonLd(site: URL, url: string, seo: Seo): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: seo.title.replace(/\s*\|.*$/, ''),
    description: seo.description,
    url,
    provider: { '@id': organizationId(site) },
    areaServed: { '@type': 'Place', name: 'Europe' },
  };
}

export type PostMeta = {
  title: string;
  description: string;
  date: Date;
  updated?: Date;
  author?: string;
};

/** A BlogPosting for a post under /blog/. */
export function blogPostingJsonLd(site: URL, url: string, image: string, post: PostMeta): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: url,
    image: new URL(image, site).href,
    datePublished: post.date.toISOString(),
    dateModified: (post.updated ?? post.date).toISOString(),
    inLanguage: 'en',
    author: post.author ? { '@type': 'Person', name: post.author } : { '@id': organizationId(site) },
    publisher: { '@id': organizationId(site) },
  };
}
