import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { buildBannerWorkflow } from '../src/mastra/workflows/banner-workflow';
import type { EditRequest, GenerateRequest, ImageGenerator } from '../src/mastra/lib/image-generator';

function solidPng(w: number, h: number, color: string): Buffer {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer('image/png');
}

const GENERATED = '#0000ff'; // solid blue from generate()
const EDITED = '#00ffff'; // solid cyan from edit()

/** Fake gpt-image-2 backend that records calls and returns solid-color PNGs. */
function fakeGenerator() {
  const calls = { generate: [] as GenerateRequest[], edit: [] as EditRequest[] };
  const generator: ImageGenerator = {
    async generate(req) {
      calls.generate.push(req);
      return solidPng(64, 64, GENERATED);
    },
    async edit(req) {
      calls.edit.push(req);
      return solidPng(64, 64, EDITED);
    },
  };
  return { generator, calls };
}

async function runBanner(
  generator: ImageGenerator,
  input: { clientId: string; layout: string; copy?: string; cta?: string; materialImageBase64?: string },
) {
  const run = await buildBannerWorkflow(generator).createRun();
  const result = await run.start({ inputData: input });
  if (result.status !== 'success') {
    throw new Error(`workflow failed: ${result.status} ${JSON.stringify((result as any).error ?? '')}`);
  }
  return Buffer.from(result.result.imageBase64, 'base64');
}

async function pixel(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

// banner-image-left: 1536x1024 canvas; the image fills it, copy overlaid on the right.
// (40, 512) is on the left, clear of the copy.
const CLEAR_POINT: [number, number] = [40, 512];

describe('banner workflow (common process, config + layout driven)', () => {
  it('generate + overlay: generates a full-canvas image and overlays copy per layout', async () => {
    const { generator, calls } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'aurora', layout: 'banner-image-left', copy: '新登場' });

    expect(calls.generate).toHaveLength(1);
    expect(calls.edit).toHaveLength(0);
    expect(calls.generate[0].size).toBe('1536x1024'); // banner image size
    expect(calls.generate[0].prompt).toMatch(/LEFT/); // layout placement guidance
    expect(calls.generate[0].prompt).toMatch(/Do not render any text/i);

    const img = await loadImage(out);
    expect([img.width, img.height]).toEqual([1536, 1024]); // layout canvas size
    expect(await pixel(out, ...CLEAR_POINT)).toEqual([0x00, 0x00, 0xff]); // generated image covers the canvas
  });

  it('generate + overlay, with material: edits the material then composes it', async () => {
    const { generator, calls } = fakeGenerator();
    const material = solidPng(50, 50, '#ff00ff').toString('base64');
    const out = await runBanner(generator, { clientId: 'aurora', layout: 'banner-image-left', copy: 'Hi', materialImageBase64: material });

    expect(calls.edit).toHaveLength(1);
    expect(calls.generate).toHaveLength(0);
    expect(await pixel(out, ...CLEAR_POINT)).toEqual([0x00, 0xff, 0xff]); // edited image covers the canvas
  });

  it('generate only: ships the model output unchanged, no placement in the prompt', async () => {
    const { generator, calls } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'lumen', layout: 'kv' });

    expect(calls.generate).toHaveLength(1);
    expect(calls.generate[0].size).toBe('1024x1024'); // kv image size
    expect(calls.generate[0].prompt).toMatch(/fills the frame/i);
    expect(calls.generate[0].prompt).not.toMatch(/Center the product/); // no overlay → no reserved space
    const img = await loadImage(out);
    expect([img.width, img.height]).toEqual([64, 64]); // raw generated image, not composed
  });

  it('overlay only, with material: composes the material, no generation', async () => {
    const { generator, calls } = fakeGenerator();
    const material = solidPng(50, 50, '#ff0000').toString('base64');
    const out = await runBanner(generator, { clientId: 'verde', layout: 'kv', copy: 'セール', cta: '今すぐ', materialImageBase64: material });

    expect(calls.generate).toHaveLength(0);
    expect(calls.edit).toHaveLength(0);
    const [r, g, b] = await pixel(out, 512, 512); // center, clear of copy (top) and cta (bottom)
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60); // red material covers the canvas
  });

  it('overlay only, no material: leaves the brand background', async () => {
    const { generator } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'verde', layout: 'banner-image-left', copy: 'セール' });
    expect(await pixel(out, ...CLEAR_POINT)).toEqual([0x1f, 0x3d, 0x2b]); // verde brand background
  });

  it('rejects an unknown client', async () => {
    const { generator } = fakeGenerator();
    await expect(runBanner(generator, { clientId: 'nope', layout: 'kv' })).rejects.toThrow(/unknown client/);
  });

  it('rejects an unknown layout', async () => {
    const { generator } = fakeGenerator();
    await expect(runBanner(generator, { clientId: 'verde', layout: 'nope', copy: 'x' })).rejects.toThrow(/unknown layout/);
  });
});
