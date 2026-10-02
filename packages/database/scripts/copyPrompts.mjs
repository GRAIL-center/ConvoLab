#!/usr/bin/env node
// Copies the persona prompt text files into dist/ after `tsc`, which only
// emits compiled TypeScript. The compiled seed (dist/seed/prompts/
// personaPrompts.js) reads them from its own directory at import time, so
// without this step the production container cannot start.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(packageRoot, 'seed', 'prompts');
const to = join(packageRoot, 'dist', 'seed', 'prompts');

const files = readdirSync(from).filter((f) => f.endsWith('.txt'));
if (files.length === 0) throw new Error(`copyPrompts: no .txt files in ${from}`);
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`copyPrompts: copied ${files.length} prompt file(s) to dist/seed/prompts`);
