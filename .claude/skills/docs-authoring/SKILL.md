---
name: docs-authoring
description: Use when adding, editing, moving or reviewing a page of the OSE documentation at /docs/, which means any file under docs/ or src/content/settings/docs.yaml. Covers where pages live, the sidebar, callouts and cards, images, links, the local preview, the checks to run and the commit type that publishes the change.
---

# Docs authoring

The documentation at `https://opensourceeurope.org/docs/` is built by Starlight from Markdown files in this repository. This skill says how to change it and how to show the change to the person you work with before it is committed.

Read `AGENTS.md` first. Its worktree rule, quality gates and AI policy apply here too.

## Where things live

The following table lists the files that make up the docs:

| What | Where |
|---|---|
| Pages | `docs/`. The path is the URL: `docs/faq/general-faqs.md` is `/docs/faq/general-faqs/` |
| A page with child pages | `index.md` in a folder: `docs/how-it-works/expenses/index.md` is `/docs/how-it-works/expenses/` |
| Sidebar order and group names | `src/content/settings/docs.yaml`, under `sidebar` |
| Page title suffix, "Contents" button label (small screens), the "Edit page" note | `src/content/settings/docs.yaml` |
| Images | Next to the page that shows them |
| Theme | `src/styles/docs.css`. Component overrides are in `src/components/docs/` |

Components hold no copy. Text belongs in the Markdown files or in `docs.yaml`.

## Add or change a page

Follow these steps for a new page or a change to an existing one:

1. Start from a worktree: `.claude/scripts/worktree.sh new docs-<topic>`.
2. Create or edit the Markdown file. Every page starts with this frontmatter:

   ```markdown
   ---
   title: "Refunds"
   description: "One sentence that search results and link previews show."
   ---
   ```

   The title becomes the page's only `<h1>`. The description goes only into search results and link previews, and the page does not show it. If the page should open with that sentence, write it as the first paragraph too.

   Name the file in lower case with hyphens, such as `setting-up-github-sponsors.md`. Starlight lower-cases URLs and drops dots, so another name gives a URL that differs from the file name.
3. Add a new page to `sidebar` in `docs.yaml`, in reading order. An entry is `- page: docs/<path>`, which shows the page title, or a group with `label` and `items`. The unit test fails if a page is missing from the sidebar or listed twice.
4. When you move or rename a page, search for links to its old path in `docs/` and update them. External links to the old path break, so say so in the pull request.
5. Run the humanize skill (`.claude/skills/humanize/`) over every sentence you wrote, before you show it.

The page then appears in the sidebar and passes the unit test in `tests/unit/docs-content.test.ts`.

## Markdown that the docs support

The docs support GitHub Markdown and the following Starlight additions:

- Callouts. Use `note` for information, `tip` for a good outcome, `caution` for a risk and `danger` for something that loses money or data:

  ```markdown
  :::caution
  Order confirmations and bank statements are not valid receipts.
  :::
  ```

- Cards and link cards need MDX. Rename the file to `.mdx` and import the components:

  ```mdx
  import { CardGrid, LinkCard } from '@astrojs/starlight/components';

  <CardGrid>
    <LinkCard title="Expenses" href="/docs/how-it-works/expenses/" description="Pay a supplier or get reimbursed." />
  </CardGrid>
  ```

- Tabs also need MDX (`import { Tabs, TabItem } from '@astrojs/starlight/components'`). Never set `syncKey` on them: it stores the choice in `localStorage`, and the site stores nothing but the consent choice.
- Tables, lists, code blocks and footnotes work as in GitHub Markdown.

## Links and headings

- Link to another docs page with its absolute path and a trailing slash: `[Refunds](/docs/how-it-works/financial-contributions-how-to-donate/refunds/)`. Never link to a `.md` file.
- A heading's anchor is its text in lower case with spaces turned into hyphens: `## Submission process` is `#submission-process`.
- Do not start a heading with an emoji. The anchor then starts with a hyphen and links to it break. The unit test checks this.
- Start the body at `##` and do not skip a level: a `####` comes after a `###`, never straight after a `##`. Starlight's "On this page" list shows only `##` and `###`.
- Write headings in sentence case: "How to apply", not "How To Apply".

## Images

Put the image file next to the page and link it with a relative path. Astro optimises it at build time.

```markdown
![The confirmation email, with the amount, IBAN, BIC and order reference](./wire-transfer-2.png)
```

Every image needs alt text that says what the image shows. Leave out "image of" and "screenshot of" unless the type matters. The unit test fails on an empty alt text.

## Show the preview

Show the person the rendered page before you commit, so they review the page and not only the diff. Pull requests get no preview deployment, so use a local server:

1. Start the dev server in the background: `npm run dev`. It reloads when you save a file.
2. Give the person the address of each page you changed, for example `http://localhost:4321/docs/how-it-works/expenses/`.
3. If they cannot open it, or you need to check the layout yourself, take a screenshot with Playwright at 1440 px and at 390 px wide, look at it, and share it.
4. To check search, run `npm run build` and `npm run preview`, then open the same address. The dev server has no search index.

The person sees the page as it will look on the site. Stop the server when you are done (`npx astro preview stop` for a preview), because another worktree may need port 4321.

## Checks before you hand off

Run the docs unit test, the type check and the build:

```bash
npx vitest run tests/unit/docs-content.test.ts   # frontmatter, sidebar, file names, links to docs pages, images, heading levels
npm run check && npm run build
```

Then run the accessibility and quality checks for the pages you changed. `-g` filters by the page path:

```bash
env -u AI_AGENT -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT npx playwright test tests/e2e/site.spec.ts tests/e2e/no-js-a11y.spec.ts -g "/docs/how-it-works/expenses/"
```

Run the full quality gates from `AGENTS.md` when the change touches more than page content, such as `docs.yaml`, `docs.css` or a component.

## Commit so that the change goes live

The docs go live only with a release. Use a `fix:` commit for a correction to a page and a `feat:` commit for a new page or section, for example `fix: correct the refund time frame in the docs`. A `docs:` commit does not cause a release, because in this repository `docs:` means the guides under `dev-guide/` that describe the code, not the published docs.

Add the `Generated-by:` line to the pull request if an agent helped, and never add an agent as a co-author.

## The Ask chat

The Ask chat answers from a knowledge index in `.opencrane/`, built from these Markdown files. When a docs change merges to `main`, the refresh workflow (`refresh.yml`) reads the docs, rebuilds the index and opens a pull request that merges itself. The chat answers from the change with the release that includes that pull request. You do not need to rebuild the index in your own pull request.

The index reads the Markdown as text, so `.opencrane/extensions.py` rewrites the Starlight syntax first: callouts, MDX imports and link cards. If you use another Starlight component, such as tabs, add a rule for it there, or the chat searches the raw markup. Add the same rule to `docsMarkdown` in `src/lib/llms.ts`, which builds `/llms-full.txt` and the `.md` copy of each page. `tests/unit/llms.test.ts` fails until it handles the new syntax.
