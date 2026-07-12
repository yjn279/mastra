import { describe, it, expect } from 'vitest';
import { putBanner, getBanner } from '../src/mastra/lib/banner-store';

describe('banner store', () => {
  it('stores and retrieves a banner by the returned id', () => {
    const png = Buffer.from('fake-png');
    const id = putBanner(png);
    expect(getBanner(id)?.equals(png)).toBe(true);
  });

  it('returns undefined for an unknown id', () => {
    expect(getBanner('does-not-exist')).toBeUndefined();
  });

  it('issues distinct ids for successive banners', () => {
    const a = putBanner(Buffer.from('a'));
    const b = putBanner(Buffer.from('b'));
    expect(a).not.toBe(b);
  });
});
