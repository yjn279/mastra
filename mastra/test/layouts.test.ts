import { describe, it, expect } from 'vitest';
import { getLayout, listLayouts } from '../src/mastra/layouts';

describe('layout registry', () => {
  it('provides the two banner patterns and the square KV', () => {
    expect(listLayouts().map((l) => l.name).sort()).toEqual(['banner-image-left', 'banner-image-right', 'kv']);
  });

  it('mirrors the copy region between the two banner layouts and gives neither a CTA', () => {
    const left = getLayout('banner-image-left');
    const right = getLayout('banner-image-right');
    expect(left.width).toBe(right.width);
    expect(left.copyRegion.x).toBeGreaterThan(right.copyRegion.x); // copy on opposite sides
    expect(left.ctaRegion).toBeUndefined();
    expect(right.ctaRegion).toBeUndefined();
    expect(left.placement).toMatch(/LEFT/);
    expect(right.placement).toMatch(/RIGHT/);
  });

  it('makes the KV square with copy above and a CTA below', () => {
    const kv = getLayout('kv');
    expect([kv.width, kv.height]).toEqual([1024, 1024]);
    expect(kv.ctaRegion).toBeDefined();
    expect(kv.copyRegion.y).toBeLessThan(kv.ctaRegion!.y); // copy on top, CTA at bottom
  });

  it('keeps every region within the canvas bounds', () => {
    for (const l of listLayouts()) {
      for (const r of [l.copyRegion, l.ctaRegion].filter(Boolean)) {
        expect(r!.x).toBeGreaterThanOrEqual(0);
        expect(r!.y).toBeGreaterThanOrEqual(0);
        expect(r!.x + r!.width).toBeLessThanOrEqual(l.width);
        expect(r!.y + r!.height).toBeLessThanOrEqual(l.height);
      }
    }
  });

  it('throws on an unknown layout', () => {
    expect(() => getLayout('nope')).toThrow(/unknown layout/);
  });
});
