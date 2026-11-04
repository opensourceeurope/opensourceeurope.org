import type { Submission } from './fields';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The subject goes into a mail header, so CR and LF must never survive.
const stripControl = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '');

/** The visitor's address goes into Reply-To, so a reply in the mailbox reaches them. It is never CC'd. */
export function buildEmail(s: Submission): { subject: string; text: string; html: string; replyTo: string } {
  const subject = stripControl(`Website contact: ${s.interest} - ${s.name}`);
  const rows: [string, string][] = [
    ['Name', s.name],
    ['Email', s.email],
    ['Interested in', s.interest],
  ];
  if (s.interestOther) rows.push(['Other interest', s.interestOther]);
  if (s.link) rows.push(['Link', s.link]);

  const text = [...rows.map(([k, v]) => `${k}: ${v}`), '', 'Message:', s.message].join('\n');
  const html =
    '<table>' +
    rows.map(([k, v]) => `<tr><th align="left">${k}</th><td>${escapeHtml(v)}</td></tr>`).join('') +
    '</table>' +
    `<p>Message:</p><p style="white-space:pre-wrap">${escapeHtml(s.message)}</p>`;
  return { subject, text, html, replyTo: stripControl(s.email) };
}
