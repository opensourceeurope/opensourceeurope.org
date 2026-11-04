import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  stdin: {
    contents: "export { handle } from './src/handler';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: join(dist, 'handler.js'),
});
writeFileSync(join(dist, 'package.json'), '{"type":"module"}\n');

// A fixed mtime keeps the zip byte-identical between builds of the same source.
const files = {};
for (const name of readdirSync(dist).sort()) {
  files[name] = [readFileSync(join(dist, name)), { mtime: new Date('2000-01-01T00:00:00Z') }];
}
writeFileSync(join(root, 'contact.zip'), zipSync(files));
