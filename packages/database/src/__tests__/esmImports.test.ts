import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards a seam that CI could not see until it broke production.
 *
 * This package compiles to ESM (`module: ESNext`) but typechecks with
 * `moduleResolution: bundler`, which accepts an extensionless relative import.
 * Vitest and tsx accept one too. Node does not: loading the compiled
 * `dist/**.js` throws ERR_MODULE_NOT_FOUND. So an extensionless import passes
 * the typecheck, passes every test, and then crashes the container on startup.
 *
 * That is exactly what happened on 2026-09-20: splitting the persona prompts
 * into `seed/prompts/*.ts` added four extensionless imports, all three CI jobs
 * went green, and the Cloud Run revision failed its health check with
 * "Cannot find module '/app/packages/database/dist/seed/prompts/femaleMaga'".
 *
 * Every relative import in the compiled sources must therefore carry an
 * explicit `.js`.
 */

const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
// Mirrors tsconfig.json's `include`: these are the files that reach dist/.
const COMPILED_ENTRIES = ['index.ts', 'types.ts', 'seed'];

function collectTsFiles(entry: string): string[] {
  const full = join(PACKAGE_ROOT, entry);
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(full);
  } catch {
    return [];
  }
  if (stats.isFile()) return full.endsWith('.ts') ? [full] : [];
  return readdirSync(full).flatMap((child) => collectTsFiles(join(entry, child)));
}

// Matches `from './x'` / `from "../x"` in both static imports and re-exports.
const RELATIVE_SPECIFIER = /\bfrom\s+['"](\.[^'"]*)['"]/g;

describe('compiled sources use explicit .js on relative imports', () => {
  const files = COMPILED_ENTRIES.flatMap(collectTsFiles);

  it('finds the files that tsconfig compiles', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(PACKAGE_ROOT.length + 1), f]))('%s', (_label, file) => {
    const source = readFileSync(file, 'utf8');
    const offenders = [...source.matchAll(RELATIVE_SPECIFIER)]
      .map((m) => m[1])
      .filter((spec) => !spec.endsWith('.js') && !spec.endsWith('.json'));
    expect(offenders, `extensionless relative import(s); Node ESM needs ".js"`).toEqual([]);
  });
});
