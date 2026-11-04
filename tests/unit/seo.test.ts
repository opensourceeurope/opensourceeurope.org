import { describe, expect, it } from 'vitest';
import { organizationJsonLd, websiteJsonLd } from '../../src/lib/seo';

const site = new URL('https://opensourceeurope.org');
const siteSeo = {
  site_name: 'Open Source Europe',
  logo: '/app/uploads/2026/01/cropped-ose.png',
  default_og_image: '/app/uploads/2026/01/cropped-ose.png',
};

describe('organizationJsonLd', () => {
  const org = organizationJsonLd(site, siteSeo) as Record<string, any>;

  it('describes Open Source Europe as an Organization', () => {
    expect(org['@type']).toBe('Organization');
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
