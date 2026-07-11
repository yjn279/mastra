import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveAssetPath } from './asset-path';

describe('resolveAssetPath', () => {
  it('resolves a known font asset to a path that exists on disk', () => {
    const resolved = resolveAssetPath('fonts/NotoSansJP-Bold.otf');
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('resolves a known directory asset to a path that exists on disk', () => {
    const resolved = resolveAssetPath('fonts');
    expect(fs.statSync(resolved).isDirectory()).toBe(true);
  });

  it('throws a descriptive error for a missing asset', () => {
    expect(() => resolveAssetPath('fonts/does-not-exist.otf')).toThrow('Asset not found: fonts/does-not-exist.otf');
  });
});
