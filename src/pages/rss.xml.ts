// The blog's RSS feed at /rss.xml, with the full text of each post.
// Every page links to it, so feed readers and Bridgy Fed find it.
import type { APIRoute } from 'astro';
import { loadPosts, postPath } from '../lib/blog';
import { buildRss } from '../lib/rss';
import { loadSettings } from '../lib/site';

export const GET: APIRoute = async ({ site }) => {
  const { blog } = await loadSettings();
  const posts = await loadPosts();
  const xml = buildRss({
    title: blog.title,
    description: blog.description,
    link: new URL('/blog/', site).href,
    self: new URL('/rss.xml', site).href,
    items: posts.map((post) => ({
      title: post.data.title,
      link: new URL(postPath(post), site).href,
      description: post.data.description,
      date: post.data.date,
      author: post.data.author,
      html: post.rendered?.html,
    })),
  });
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
