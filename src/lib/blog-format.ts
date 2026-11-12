// Formatting for the blog. Plain functions, so unit tests can call them without Astro.

/** "9 November 2026". Dates in front matter have no time, so they are read as UTC. */
export const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2026-11-09", for the datetime attribute of <time>. */
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

