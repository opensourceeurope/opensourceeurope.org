import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** The posts, newest first. Drafts show only in `npm run dev`. */
export async function loadPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', (post) => import.meta.env.DEV || !post.data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export const postPath = (post: Post) => `/blog/${post.id}/`;

/** The sidebar of the blog pages: the list page, then every post, newest first. */
export function blogSidebar(posts: Post[], labels: { all_posts_label: string; posts_label: string }) {
  return [
    { label: labels.all_posts_label, link: '/blog/' },
    { label: labels.posts_label, items: posts.map((post) => ({ label: post.data.title, link: postPath(post) })) },
  ];
}
