import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = fileURLToPath(new URL('../dist/', import.meta.url));
const BUDGETS = {
  javascript: 1_800_000,
  styles: 120_000,
  total: 2_100_000,
};

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else files.push(path);
  }
  return files;
}

const files = await filesIn(DIST_DIR);
const sizes = { javascript: 0, styles: 0, total: 0 };
for (const file of files) {
  const bytes = (await stat(file)).size;
  sizes.total += bytes;
  if (file.endsWith('.js')) sizes.javascript += bytes;
  if (file.endsWith('.css')) sizes.styles += bytes;
}

const failures = Object.entries(BUDGETS)
  .filter(([key, budget]) => sizes[key] > budget)
  .map(([key, budget]) => `${key} is ${sizes[key]} bytes; budget is ${budget} bytes`);

console.log(`Performance budget: JS ${sizes.javascript} B, CSS ${sizes.styles} B, total ${sizes.total} B`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
