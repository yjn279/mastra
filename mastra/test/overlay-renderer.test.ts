import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// Image region = left half; copy region = right side.
const layout: Layout = {
  name: 'test',
  width: 400,
  height: 200,
  imageSize: '1024x1024',
  imageRegion: { x: 0, y: 0, width: 200, height: 200 },
  copyRegion: { x: 210, y: 20, width: 180, height: 160 },
  align: 'left',
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

  it('keeps text that fits on a single line', () => {
    expect(wrapText(measure, 'short', 1000)).toEqual(['short']);
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

  it('fills the brand background', async () => {
    const out = await renderOverlay({ base: null, brand, layout });
    expect(await pixel(out, 2, 2)).toEqual([0x10, 0x18, 0x20]);
  });

  it('places the base image inside the image region only', async () => {
    const base = solidPng(100, 100, '#ff0000');
    const out = await renderOverlay({ base, brand, layout });
    const [ir, ig, ib] = await pixel(out, 10, 100); // inside image region (left)
    expect(ir).toBeGreaterThan(200);
    expect(ig).toBeLessThan(60);
    expect(ib).toBeLessThan(60);
    // outside the image region stays brand background
    expect(await pixel(out, 395, 195)).toEqual([0x10, 0x18, 0x20]);
  });

  it('draws headline copy in the brand color inside the copy region', async () => {
    const out = await renderOverlay({ base: null, brand, layout, copy: 'Hello' });
    expect(await hasColor(out, { x: 210, y: 20, w: 180, h: 160 }, [255, 255, 255])).toBe(true);
  });

  it('draws the CTA button in the brand CTA background color', async () => {
    const out = await renderOverlay({ base: null, brand, layout, cta: 'Go' });
    expect(await hasColor(out, { x: 210, y: 20, w: 180, h: 160 }, [0xf2, 0xa9, 0x00])).toBe(true);
  });

  it('auto-fits long copy so it never bleeds out of the copy region', async () => {
    const out = await renderOverlay({
      base: null,
      brand,
      layout,
      copy: '新製品が登場しました今すぐチェックしてください',
    });
    // no headline pixels leak into the image region on the left
    expect(await hasColor(out, { x: 0, y: 0, w: 200, h: 200 }, [255, 255, 255], 12)).toBe(false);
  });

  it('draws the logo at the top of the copy region', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'logo-'));
    const logoPath = join(dir, 'logo.png');
    writeFileSync(logoPath, solidPng(40, 40, '#00ff00'));
    const out = await renderOverlay({
      base: null,
      brand: { ...brand, logo: { path: logoPath, width: 40 } },
      layout,
      copy: 'Hi',
    });
    const [r, g, b] = await pixel(out, 215, 25);
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });
});
