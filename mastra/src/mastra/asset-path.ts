import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves a path under `src/mastra/public/` (fonts, logos, ...).
 *
 * When this module runs unbundled (tests, `tsc`, or any other direct invocation), it's resolved
 * relative to its own file location via `import.meta.url`, which works regardless of the
 * process's current working directory. When bundled by `mastra dev`/`mastra build` — which merges
 * all source modules into one file without copying non-JS assets, so a bundled module's
 * `import.meta.url` no longer sits next to `public/` on disk — that candidate doesn't exist on
 * disk and resolution falls through to a `process.cwd()`-relative candidate instead: both the
 * `mastra dev` server subprocess (launched with cwd set to `src/mastra/public` itself) and
 * `mastra build`'s output (which copies `public/*` flattened into the cwd `mastra start` runs
 * from) resolve the same way from there.
 */
export function resolveAssetPath(relativePath: string): string {
  const candidates = [fileURLToPath(new URL(`public/${relativePath}`, import.meta.url)), path.join(process.cwd(), relativePath)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Asset not found: ${relativePath} (tried: ${candidates.join(', ')})`);
  }
  return found;
}
