import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderOverlay } from './overlay';
import type { BrandSpec, LogoSpec, Position } from '../brand/types';

const FONT_PATH = fileURLToPath(new URL('../assets/fonts/NotoSansJP-Bold.otf', import.meta.url));

const RED = '#FF0000';
const BLUE = '#0000FF';
const GREEN = '#00FF00';
const WHITE = '#FFFFFF';

let logoPath: string;
let missingLogoPath: string;

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-test-'));
  logoPath = path.join(dir, 'logo.png');
  missingLogoPath = path.join(dir, 'does-not-exist.png');
  await sharp({
    create: { width: 100, height: 40, channels: 4, background: hexToRgba(GREEN) },
  })
    .png()
    .toFile(logoPath);
});

afterAll(() => {
  if (logoPath) fs.rmSync(path.dirname(logoPath), { recursive: true, force: true });
});

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, alpha: 1 };
}

async function baseImage(width: number, height: number, color = WHITE): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

async function toRaw(buffer: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function pixelAt(image: RawImage, x: number, y: number): { r: number; g: number; b: number } {
  const offset = (y * image.width + x) * image.channels;
  return { r: image.data[offset], g: image.data[offset + 1], b: image.data[offset + 2] };
}

function matchesHex(pixel: { r: number; g: number; b: number }, hex: string, tolerance = 0): boolean {
  const target = hexToRgba(hex);
  return (
    Math.abs(pixel.r - target.r) <= tolerance &&
    Math.abs(pixel.g - target.g) <= tolerance &&
    Math.abs(pixel.b - target.b) <= tolerance
  );
}

function regionContains(image: RawImage, x0: number, y0: number, x1: number, y1: number, hex: string, tolerance = 40): boolean {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (matchesHex(pixelAt(image, x, y), hex, tolerance)) return true;
    }
  }
  return false;
}

function regionExcludes(image: RawImage, x0: number, y0: number, x1: number, y1: number, hex: string, tolerance = 40): boolean {
  return !regionContains(image, x0, y0, x1, y1, hex, tolerance);
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const MARGIN = 64;

function brand(overrides: Partial<BrandSpec> = {}): BrandSpec {
  return {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
    backgroundColor: WHITE,
    headline: {
      font: { family: 'Noto Sans JP', filePath: FONT_PATH, weight: 700 },
      size: 40,
      color: RED,
      position: 'top-left',
    },
    cta: {
      font: { family: 'Noto Sans JP', filePath: FONT_PATH, weight: 700 },
      size: 24,
      color: WHITE,
      backgroundColor: BLUE,
      position: 'bottom-center',
      paddingX: 24,
      paddingY: 12,
      borderRadius: 8,
    },
    ...overrides,
  };
}

describe('renderOverlay', () => {
  it('outputs an image sized to the brand canvas regardless of the base image size', async () => {
    const base = await baseImage(1200, 900);
    const output = await renderOverlay(base, { copy: 'Sale', brand: brand() });
    const metadata = await sharp(output).metadata();
    expect(metadata.width).toBe(CANVAS_WIDTH);
    expect(metadata.height).toBe(CANVAS_HEIGHT);
  });

  it('is deterministic: identical input produces byte-identical output', async () => {
    const base = await baseImage(CANVAS_WIDTH, CANVAS_HEIGHT);
    const input = { copy: '夏の新作セール', cta: '今すぐチェック', brand: brand() };
    const first = await renderOverlay(base, input);
    const second = await renderOverlay(base, input);
    expect(first.equals(second)).toBe(true);
  });

  it('draws the headline in its brand color within the content area, never in the margin band', async () => {
    const base = await baseImage(CANVAS_WIDTH, CANVAS_HEIGHT);
    const output = await renderOverlay(base, { copy: 'Headline', brand: brand() });
    const image = await toRaw(output);

    // Content area near the top-left anchor should contain the headline color.
    expect(regionContains(image, MARGIN, MARGIN, MARGIN + 200, MARGIN + 60, RED)).toBe(true);

    // Margin bands (outside the reserved margin) must stay pure background.
    expect(regionExcludes(image, 0, 0, CANVAS_WIDTH, MARGIN, RED, 0)).toBe(true); // top band
    expect(regionExcludes(image, 0, 0, MARGIN, CANVAS_HEIGHT, RED, 0)).toBe(true); // left band
    expect(regionExcludes(image, CANVAS_WIDTH - MARGIN, 0, CANVAS_WIDTH, CANVAS_HEIGHT, RED, 0)).toBe(true); // right band
    expect(regionExcludes(image, 0, CANVAS_HEIGHT - MARGIN, CANVAS_WIDTH, CANVAS_HEIGHT, RED, 0)).toBe(true); // bottom band
  });

  it('renders the CTA background at the expected size, position, and padding', async () => {
    const base = await baseImage(CANVAS_WIDTH, CANVAS_HEIGHT);
    const spec = brand();
    const output = await renderOverlay(base, { copy: 'Headline', cta: 'Buy now', brand: spec });
    const image = await toRaw(output);

    const ctaHeight = spec.cta.size * 1.2 + spec.cta.paddingY * 2;
    const rectBottom = CANVAS_HEIGHT - MARGIN;
    const rectTop = rectBottom - ctaHeight;
    const centerY = Math.round((rectTop + rectBottom) / 2);
    const centerX = Math.round(CANVAS_WIDTH / 2);

    expect(matchesHex(pixelAt(image, centerX, centerY), BLUE)).toBe(true);

    // The CTA pill (bottom-center) must stay clear of the margin bands.
    expect(regionExcludes(image, 0, CANVAS_HEIGHT - MARGIN, CANVAS_WIDTH, CANVAS_HEIGHT, BLUE, 0)).toBe(true);
    expect(regionExcludes(image, 0, 0, MARGIN, CANVAS_HEIGHT, BLUE, 0)).toBe(true);
    expect(regionExcludes(image, CANVAS_WIDTH - MARGIN, 0, CANVAS_WIDTH, CANVAS_HEIGHT, BLUE, 0)).toBe(true);
  });

  it('omits the CTA entirely when no cta copy is given', async () => {
    const base = await baseImage(CANVAS_WIDTH, CANVAS_HEIGHT);
    const output = await renderOverlay(base, { copy: 'Headline only', brand: brand() });
    const image = await toRaw(output);
    expect(regionExcludes(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, BLUE, 0)).toBe(true);
  });

  it.each<Position>(['top-right', 'bottom-left'])('places the logo at %s within the margin box', async (position) => {
    const base = await baseImage(CANVAS_WIDTH, CANVAS_HEIGHT);
    const logo: LogoSpec = { filePath: logoPath, width: 100, height: 40, position };
    const output = await renderOverlay(base, { copy: 'Headline', brand: brand({ logo }) });
    const image = await toRaw(output);

    const x0 = position.endsWith('right') ? CANVAS_WIDTH - MARGIN - logo.width : MARGIN;
    const y0 = position.startsWith('top') ? MARGIN : CANVAS_HEIGHT - MARGIN - logo.height;

    // Interior of the expected logo box carries the logo color.
    expect(matchesHex(pixelAt(image, x0 + logo.width / 2, y0 + logo.height / 2), GREEN)).toBe(true);

    // The logo never bleeds into the margin band on the side it's anchored to.
    if (position.endsWith('right')) {
      expect(regionExcludes(image, CANVAS_WIDTH - MARGIN, 0, CANVAS_WIDTH, CANVAS_HEIGHT, GREEN, 0)).toBe(true);
    } else {
      expect(regionExcludes(image, 0, 0, MARGIN, CANVAS_HEIGHT, GREEN, 0)).toBe(true);
    }
  });

  it('renders multi-line headlines using the brand line height', async () => {
    const base = await baseImage(CANVAS_WIDTH, CANVAS_HEIGHT);
    const spec = brand({
      headline: {
        font: { family: 'Noto Sans JP', filePath: FONT_PATH, weight: 700 },
        size: 32,
        color: RED,
        position: 'top-left',
        lineHeight: 40,
      },
    });
    const output = await renderOverlay(base, { copy: 'Line one\nLine two', brand: spec });
    const image = await toRaw(output);

    expect(regionContains(image, MARGIN, MARGIN, MARGIN + 200, MARGIN + 40, RED)).toBe(true);
    expect(regionContains(image, MARGIN, MARGIN + 40, MARGIN + 200, MARGIN + 90, RED)).toBe(true);
  });

  it('throws when the headline font file is missing', async () => {
    const base = await baseImage(CANVAS_WIDTH, CANVAS_HEIGHT);
    const spec = brand();
    spec.headline.font.filePath = path.join(os.tmpdir(), 'no-such-font.otf');
    await expect(renderOverlay(base, { copy: 'Headline', brand: spec })).rejects.toThrow(/font/i);
  });

  it('throws when the logo file is missing', async () => {
    const base = await baseImage(CANVAS_WIDTH, CANVAS_HEIGHT);
    const logo: LogoSpec = { filePath: missingLogoPath, width: 100, height: 40, position: 'top-right' };
    await expect(renderOverlay(base, { copy: 'Headline', brand: brand({ logo }) })).rejects.toThrow(/logo/i);
  });
});
