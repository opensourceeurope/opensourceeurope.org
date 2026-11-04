import type { APIRoute } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import AskDialog from '../../components/chat/AskDialog.astro';
import { loadSettings } from '../../lib/site';

// The dialog of the Ask panel, with the chat markup, built once. The panel fetches it on the first open,
// so no page carries it. It is a fragment, not a page: it is not in the sitemap.
export const GET: APIRoute = async () => {
  const { chat } = await loadSettings();
  const container = await AstroContainer.create();
  const html = await container.renderToString(AskDialog, { props: { texts: chat } });
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
