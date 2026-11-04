export type Seo = {
  title: string;
  description: string;
  ogImage?: string;
  noindex?: boolean;
};

/** The `seo` block of `src/content/settings/site.yaml`. */
export type SiteSeo = {
  site_name: string;
  logo: string;
  default_og_image: string;
};

export function organizationJsonLd(site: URL, seo: SiteSeo): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: seo.site_name,
    url: new URL('/', site).href,
    logo: {
      '@type': 'ImageObject',
      url: new URL(seo.logo, site).href,
    },
  };
}

export function websiteJsonLd(site: URL, seo: SiteSeo): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: seo.site_name,
    url: new URL('/', site).href,
  };
}
