import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// A stand-in for the browser's WebMCP API that keeps the registered tools.
const fakeModelContext = () => {
  const tools: Record<string, { execute: (input: object) => Promise<unknown> }> = {};
  (window as unknown as { __tools: typeof tools }).__tools = tools;
  Object.defineProperty(document, 'modelContext', {
    value: { registerTool: (tool: { name: string; execute: (input: object) => Promise<unknown> }) => (tools[tool.name] = tool) },
  });
};

for (const path of ['/', '/docs/']) {
  test(`${path} registers the WebMCP tools, and list_pages returns llms.txt`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one browser is enough');
    await page.addInitScript(fakeModelContext);
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => Object.keys((window as any).__tools).sort())).toEqual(['ask_ose', 'list_pages']);
    const result = (await page.evaluate(() => (window as any).__tools.list_pages.execute({}))) as { content: { text: string }[] };
    expect(result.content[0].text).toContain('# Open Source Europe');
  });
}

test('a browser without WebMCP loads the page without errors', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser is enough');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  expect(errors).toEqual([]);
});

test('the discovery files are served', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser is enough');
  const index = await (await request.get('/.well-known/agent-skills/index.json')).json();
  const skill = await request.get(new URL(index.skills[0].url).pathname);
  expect(skill.ok()).toBe(true);
  const catalog = await (await request.get('/.well-known/ai-catalog.json')).json();
  expect(catalog.entries.length).toBeGreaterThan(0);
  // astro preview does not serve a file without an extension under trailingSlash: 'always'. The bucket serves it by its key.
  const apis = JSON.parse(readFileSync('dist/.well-known/api-catalog', 'utf8'));
  expect(apis.linkset.length).toBeGreaterThan(0);
});
