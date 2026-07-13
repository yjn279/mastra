import { describe, it, expect } from 'vitest';
import { getLayout, listLayouts } from '../src/mastra/layouts';

describe('layout registry', () => {
  it('provides the two banner patterns and the square KV', () => {
    expect(listLayouts().map((l) => l.name).sort()).toEqual(['banner-image-left', 'banner-image-right', 'kv']);
  });

  it('mirrors the image region between the two banner layouts', () => {
    const left = getLayout('banner-image-left');
    const right = getLayout('banner-image-right');
    expect(left.width).toBe(right.width);
    expect(left.imageRegion.x).toBeLessThan(right.imageRegion.x); // image on opposite sides
    expect(left.copyRegion.x).toBeGreaterThan(right.copyRegion.x); // copy on opposite sides
  });

  it('makes the KV square with copy above the image', () => {
    const kv = getLayout('kv');
    expect([kv.width, kv.height]).toEqual([1024, 1024]);
    expect(kv.copyRegion.y).toBeLessThan(kv.imageRegion.y); // copy on top, image below
  });

  it('keeps every region within the canvas bounds', () => {
    for (const l of listLayouts()) {
      for (const r of [l.imageRegion, l.copyRegion]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(l.width);
        expect(r.y + r.height).toBeLessThanOrEqual(l.height);
      }
    }
  });

  it('throws on an unknown layout', () => {
    expect(() => getLayout('nope')).toThrow(/unknown layout/);
  });
});
