/**
 * Copies the reader modules into docs/core so the static GitHub Pages build and
 * the Node build share one source of truth. Run after changing anything in src/.
 */
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const from = join(root, 'src');
const to = join(root, 'docs', 'core');

// Node-only entry points; the browser never loads these.
const SKIP = new Set(['server.js', 'cli.js']);

await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });

const copied = [];
for (const name of await readdir(from))
{
    if (!name.endsWith('.js') || SKIP.has(name)) continue;
    await copyFile(join(from, name), join(to, name));
    copied.push(name);
}

console.log(`docs/core <- src: ${copied.join(', ')}`);
