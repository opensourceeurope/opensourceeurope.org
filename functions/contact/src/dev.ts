import { serveHandler } from '@scaleway/serverless-functions';
import { createHandler } from './handler';

// The dev server writes to the outbox and never sends real mail, even when the
// shell exports SMTP credentials. DEV_ALLOW_SMTP=1 lets it send on purpose.
if (process.env.DEV_ALLOW_SMTP !== '1') {
  delete process.env.SMTP_TOKEN;
  delete process.env.SMTP_USER;
}

process.env.ALLOWED_ORIGINS ??= 'http://localhost:4321';
process.env.SITE_URL ??= 'http://localhost:4321';
process.env.OUTBOX_FILE ??= 'test-results/outbox.jsonl';
process.env.MAIL_FROM ??= 'website@localhost';
process.env.MAIL_TO ??= 'contact@localhost';

const parsed = Number(process.env.MIN_DELAY_MS);
const minDelayMs = process.env.MIN_DELAY_MS && Number.isFinite(parsed) && parsed >= 0 ? parsed : 3000;

const port = Number(process.env.PORT) || 8081;

serveHandler(createHandler({ minDelayMs }) as never, port);
