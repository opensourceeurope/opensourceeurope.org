import { describe, expect, it } from 'vitest';
import type { LivePage } from '../../scripts/live/extract';
import { allowedFor, diffPage } from '../../scripts/live/drift';

const base: LivePage = {
  url: 'https://opensourceeurope.org/',
  title: 'Home',
  description: 'Description',
  headings: [
    { level: 1, text: 'We take care of the admin' },
    { level: 2, text: 'Frequently asked questions' },
  ],
  textBlocks: ['First block', 'Second block'],
  images: [],
  links: [],
};

function withHeading(text: string): LivePage {
  return { ...base, headings: [base.headings[0]!, { level: 2, text }] };
}

describe('diffPage', () => {
  it('returns nothing for identical pages', () => {
    expect(diffPage(base, structuredClone(base))).toEqual([]);
  });

  it('ignores whitespace differences', () => {
    const local = { ...base, textBlocks: ['First   block', ' Second\nblock '] };
    expect(diffPage(base, local)).toEqual([]);
  });

  it('returns a changed heading, from both sides', () => {
    expect(diffPage(base, withHeading('FAQ'))).toEqual(['Frequently asked questions', 'FAQ']);
  });

  it('returns a text block present on one side only', () => {
    const local = { ...base, textBlocks: ['First block'] };
    expect(diffPage(base, local)).toEqual(['Second block']);
  });

  it('drops differences listed in allowed', () => {
    expect(diffPage(base, withHeading('FAQ'), ['Frequently asked questions', 'FAQ'])).toEqual([]);
    expect(diffPage(base, withHeading('FAQ'), ['FAQ'])).toEqual(['Frequently asked questions']);
  });
});

describe('allowedFor', () => {
  const allowed = {
    '*': [{ diff: 'Quick links', note: 'MN-001' }],
    '/': [{ diff: 'Home only', note: 'MN-002' }],
  };

  it('combines site-wide and per-route entries', () => {
    expect(allowedFor(allowed, '/')).toEqual(['Quick links', 'Home only']);
  });

  it('applies site-wide entries to a route without its own', () => {
    expect(allowedFor(allowed, '/about/')).toEqual(['Quick links']);
    expect(allowedFor({}, '/about/')).toEqual([]);
  });
});
