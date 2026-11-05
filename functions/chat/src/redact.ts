// A fixed filter for text that goes into the analytics log. It runs on the
// conversation before the summary model sees it and again on the summary, so
// a detail the model keeps by mistake is still replaced. It cannot catch a
// name or a free-text description of a person: the summary prompt asks the
// model to leave those out.

const OWN_HOSTS = /^(?:[a-z0-9-]+\.)*opensourceeurope\.org$/i;

const RULES: Array<[RegExp, string | ((m: string) => string)]> = [
  // "Bearer <token>" as in an Authorization header.
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [secret]"],
  // A key, password or token after its label: "password: hunter2", "api_key=abc".
  [
    /\b(pass(?:word|wd|phrase)?|pwd|secret|token|api[ _-]?key|access[ _-]?key|client[ _-]?secret|authorization)(\s*[:=]\s*)(?!bearer\b|\[)["']?[^\s"',;]{4,}/gi,
    "$1$2[secret]",
  ],
  // Email addresses.
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  // Links, except to this website. A link can hold a token or a personal page.
  [
    /\bhttps?:\/\/[^\s<>"')\]]+/gi,
    (m) => {
      try {
        return OWN_HOSTS.test(new URL(m).hostname) ? m : "[link]";
      } catch {
        return "[link]";
      }
    },
  ],
  // IBANs: two letters, two digits, then 10 to 30 letters and digits, spaces allowed.
  [/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/g, "[account]"],
  // Long strings of letters and digits mixed, as keys and tokens are.
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{20,}\b/g, "[secret]"],
  // Phone, card and ID numbers: 9 or more digits, with spaces, dots, dashes or brackets between.
  [/\+?\d(?:[\s().-]*\d){8,}/g, "[number]"],
];

/** Replaces credentials, contact details and account numbers in `text`. */
export function redact(text: string): string {
  let out = text;
  for (const [re, by] of RULES) out = out.replace(re, by as any);
  return out;
}
