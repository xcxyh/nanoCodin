import { mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const srcDir = path.join(root, 'prompts');
const outDir = path.join(root, 'dist', 'prompts');

await mkdir(outDir, { recursive: true });
const entries = await readdir(srcDir, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.hbs')) {
    continue;
  }
  await copyFile(path.join(srcDir, entry.name), path.join(outDir, entry.name));
}

console.log('Copied prompt templates to dist/prompts');
