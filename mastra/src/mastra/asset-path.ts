import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Resolves a path under `src/mastra/public/` (fonts, logos, ...), independent of this module's
 * own location — `mastra dev`'s bundler merges all source modules into one file without copying
 * non-JS assets, so a bundled module's `import.meta.url` doesn't sit next to `public/` on disk.
 * `process.cwd()` differs by run mode instead: the `mastra dev` server subprocess is launched
 * with cwd set to `src/mastra/public` itself, while `npm test`/`tsc` run from the project root.
 * Tries both conventions and picks whichever resolves to a real file.
 */
export function resolveAssetPath(relativePath: string): string {
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.join(process.cwd(), 'src/mastra/public', relativePath),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Asset not found: ${relativePath} (tried: ${candidates.join(', ')})`);
  }
  return found;
}
