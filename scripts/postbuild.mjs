// Ensure the React entry outputs are marked as client modules for the
// Next.js App Router. tsup/esbuild drops top-level "use client" directives
// during bundling, so we prepend them deterministically here.
import { readFile, writeFile } from 'node:fs/promises';

const targets = ['dist/react/index.js', 'dist/react/index.cjs'];
const directive = `'use client';\n`;

for (const file of targets) {
  const source = await readFile(file, 'utf8');
  if (source.startsWith(`'use client'`) || source.startsWith('"use client"')) {
    continue;
  }
  await writeFile(file, directive + source);
  console.log(`postbuild: prepended "use client" to ${file}`);
}
