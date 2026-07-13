import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { crc32 } from 'node:zlib';
import { renderOverlay, wrapText, sanitizeImage } from '../src/mastra/lib/overlay-renderer';
import type { BrandSpec } from '../src/mastra/clients/types';
import type { Layout } from '../src/mastra/layouts/types';

/** Build a solid-color PNG buffer. */
function solidPng(w: number, h: number, color: string): Buffer {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer('image/png');
}

/** Insert an ancillary PNG chunk (e.g. gpt-image-2's `caBX`) before the first IDAT. */
function pngWithChunk(png: Buffer, type: string, data: Buffer): Buffer {
  let offset = 8;
  while (offset + 12 <= png.length && png.toString('latin1', offset + 4, offset + 8) !== 'IDAT') {
    offset += 12 + png.readUInt32BE(offset);
  }
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  const chunk = Buffer.concat([len, typeBuf, data, crc]);
  return Buffer.concat([png.subarray(0, offset), chunk, png.subarray(offset)]);
}

async function pixel(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

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
    if (Math.abs(data[i] - rgb[0]) <= tol && Math.abs(data[i + 1] - rgb[1]) <= tol && Math.abs(data[i + 2] - rgb[2]) <= tol) {
      return true;
    }
  }
  return false;
}

const brand: BrandSpec = {
  background: '#101820', // dark navy
  headline: { font: 'Noto Sans JP', color: '#ffffff', weight: 700, maxSize: 48, minSize: 18, lineHeight: 1.2 },
  cta: { font: 'Noto Sans JP', size: 24, weight: 700, color: '#ffffff', background: '#f2a900', radius: 8, paddingX: 16, paddingY: 10 },
};

// Copy overlaid on the right; a CTA region below it.
const layout: Layout = {
  name: 'test',
  width: 400,
  height: 200,
  imageSize: '1536x1024',
  copyRegion: { x: 210, y: 20, width: 180, height: 90 },
  ctaRegion: { x: 210, y: 130, width: 180, height: 50 },
  align: 'left',
  placement: 'test placement',
};

describe('sanitizeImage', () => {
  it('strips non-essential PNG chunks so the image stays loadable', async () => {
    const withChunk = pngWithChunk(solidPng(64, 64, '#123456'), 'caBX', Buffer.from('fake-c2pa-metadata'));
    expect(withChunk.includes(Buffer.from('caBX'))).toBe(true);

    const clean = sanitizeImage(withChunk);
    expect(clean.includes(Buffer.from('caBX'))).toBe(false);
    const img = await loadImage(clean);
    expect([img.width, img.height]).toEqual([64, 64]);
  });

  it('passes non-PNG buffers through unchanged', () => {
    const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(sanitizeImage(jpegish).equals(jpegish)).toBe(true);
  });
});

describe('wrapText', () => {
  const measure = (s: string) => [...s].length * 10; // 10px per char

  it('wraps latin words on whitespace without splitting words', () => {
    expect(wrapText(measure, 'aaaa bbbb cccc', 60)).toEqual(['aaaa', 'bbbb', 'cccc']);
  });

  it('wraps CJK between characters', () => {
    expect(wrapText(measure, 'あいうえお', 25)).toEqual(['あい', 'うえ', 'お']);
  });

  it('respects explicit newlines', () => {
    expect(wrapText(measure, 'a\nb', 1000)).toEqual(['a', 'b']);
  });
});

describe('renderOverlay', () => {
  it('produces a PNG of the layout canvas size', async () => {
    const out = await renderOverlay({ base: null, brand, layout });
    const img = await loadImage(out);
    expect([img.width, img.height]).toEqual([400, 200]);
  });

  it('fills the brand background when there is no image', async () => {
    const out = await renderOverlay({ base: null, brand, layout });
    expect(await pixel(out, 2, 2)).toEqual([0x10, 0x18, 0x20]);
  });

  it('covers the whole canvas with the image', async () => {
    const out = await renderOverlay({ base: solidPng(100, 100, '#ff0000'), brand, layout });
    for (const [x, y] of [
      [2, 2],
      [398, 2],
      [2, 198],
      [120, 100],
    ] as const) {
      const [r, g, b] = await pixel(out, x, y);
      expect(r).toBeGreaterThan(200);
      expect(g).toBeLessThan(60);
      expect(b).toBeLessThan(60);
    }
  });

  it('overlays the headline in the brand color inside the copy region', async () => {
    const out = await renderOverlay({ base: null, brand, layout, copy: 'Hello' });
    expect(await hasColor(out, { x: 210, y: 20, w: 180, h: 90 }, [255, 255, 255])).toBe(true);
  });

  it('draws the CTA button in its region when the layout has one', async () => {
    const out = await renderOverlay({ base: null, brand, layout, cta: 'Go' });
    expect(await hasColor(out, { x: 210, y: 130, w: 180, h: 50 }, [0xf2, 0xa9, 0x00])).toBe(true);
  });

  it('draws no CTA when the layout has no CTA region', async () => {
    const noCta: Layout = { ...layout, ctaRegion: undefined };
    const out = await renderOverlay({ base: null, brand, layout: noCta, cta: 'Go' });
    expect(await hasColor(out, { x: 0, y: 0, w: 400, h: 200 }, [0xf2, 0xa9, 0x00])).toBe(false);
  });

  it('auto-fits long copy so it never bleeds out of the copy region', async () => {
    const out = await renderOverlay({
      base: null,
      brand,
      layout,
      copy: '新製品が登場しました今すぐチェックしてください',
    });
    // no headline pixels leak to the left of the copy region
    expect(await hasColor(out, { x: 0, y: 20, w: 205, h: 90 }, [255, 255, 255], 12)).toBe(false);
  });
});
