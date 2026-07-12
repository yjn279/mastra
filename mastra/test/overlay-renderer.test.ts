import { describe, it, expect, beforeAll } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderOverlay, wrapText } from '../src/mastra/lib/overlay-renderer';
import type { BrandSpec } from '../src/mastra/clients/types';

/** Build a solid-color PNG buffer. */
function solidPng(w: number, h: number, color: string): Buffer {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer('image/png');
}

/** Decode a PNG and read the RGBA of one pixel. */
async function pixel(png: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/** True if any pixel in the region is within tolerance of the target RGB. */
async function hasColor(
  png: Buffer,
  rect: { x: number; y: number; w: number; h: number },
  rgb: [number, number, number],
  tol = 24,
): Promise<boolean> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - rgb[0]) <= tol &&
      Math.abs(data[i + 1] - rgb[1]) <= tol &&
      Math.abs(data[i + 2] - rgb[2]) <= tol
    ) {
      return true;
    }
  }
  return false;
}

const brand: BrandSpec = {
  width: 400,
  height: 200,
  background: '#101820', // dark navy
  headline: {
    font: 'Noto Sans JP',
    size: 32,
    weight: 700,
    color: '#ffffff',
    lineHeight: 1.2,
    align: 'left',
    x: 20,
    y: 20,
    maxWidth: 360,
  },
  cta: {
    font: 'Noto Sans JP',
    size: 20,
    weight: 700,
    color: '#ffffff',
    background: '#f2a900', // amber
    radius: 8,
    paddingX: 20,
    paddingY: 10,
    x: 20,
    y: 150,
  },
};

describe('wrapText', () => {
  const measure = (s: string) => [...s].length * 10; // 10px per char

  it('wraps latin words on whitespace without splitting words', () => {
    expect(wrapText(measure, 'aaaa bbbb cccc', 60)).toEqual(['aaaa', 'bbbb', 'cccc']);
  });

  it('wraps CJK between characters', () => {
    expect(wrapText(measure, 'あいうえお', 25)).toEqual(['あい', 'うえ', 'お']);
  });

  it('keeps text that fits on a single line', () => {
    expect(wrapText(measure, 'short', 1000)).toEqual(['short']);
  });

  it('respects explicit newlines', () => {
    expect(wrapText(measure, 'a\nb', 1000)).toEqual(['a', 'b']);
  });
});

describe('renderOverlay', () => {
  it('produces a PNG of the brand canvas size', async () => {
    const out = await renderOverlay({ base: null, brand });
    const img = await loadImage(out);
    expect([img.width, img.height]).toEqual([400, 200]);
  });

  it('fills the brand background when there is no base image', async () => {
    const out = await renderOverlay({ base: null, brand });
    const [r, g, b] = await pixel(out, 2, 2);
    expect([r, g, b]).toEqual([0x10, 0x18, 0x20]);
  });

  it('draws headline copy in the brand text color inside the text box', async () => {
    const out = await renderOverlay({ base: null, brand, copy: 'Hello' });
    const found = await hasColor(out, { x: 20, y: 20, w: 360, h: 48 }, [255, 255, 255]);
    expect(found).toBe(true);
  });

  it('renders real Japanese glyphs, not tofu (distinct kanji differ)', async () => {
    // A missing font renders every char as an identical .notdef box, so two
    // different kanji would produce identical pixels. Real glyphs differ.
    const a = await renderOverlay({ base: null, brand, copy: '夏' });
    const b = await renderOverlay({ base: null, brand, copy: '冬' });
    expect(a.equals(b)).toBe(false);
  });

  it('draws the CTA button in the brand CTA background color', async () => {
    const out = await renderOverlay({ base: null, brand, cta: 'Shop Now' });
    // sample the left padding area of the button — solid fill, no glyphs
    const [r, g, b] = await pixel(out, brand.cta.x + 4, brand.cta.y + brand.cta.paddingY + brand.cta.size / 2);
    expect([r, g, b]).toEqual([0xf2, 0xa9, 0x00]);
  });

  it('draws the CTA label in the CTA text color', async () => {
    const out = await renderOverlay({ base: null, brand, cta: 'Shop Now' });
    const found = await hasColor(out, { x: brand.cta.x, y: brand.cta.y, w: 200, h: 44 }, [255, 255, 255]);
    expect(found).toBe(true);
  });

  it('covers the canvas with the base image', async () => {
    const base = solidPng(100, 50, '#ff0000');
    const out = await renderOverlay({ base, brand });
    const [r, g, b] = await pixel(out, 2, 2);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });

  it('draws the logo at its configured position', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'logo-'));
    const logoPath = join(dir, 'logo.png');
    writeFileSync(logoPath, solidPng(40, 40, '#00ff00'));
    const out = await renderOverlay({
      base: null,
      brand: { ...brand, logo: { path: logoPath, x: 300, y: 20, width: 40 } },
    });
    const [r, g, b] = await pixel(out, 320, 40);
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });
});
