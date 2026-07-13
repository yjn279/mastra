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

// banner-image-left: 1536x1024 canvas, image region is the left half.
const IMG_POINT: [number, number] = [40, 512];

describe('banner workflow (common process, config + layout driven)', () => {
  it('generate + overlay: generates a product image and composes it into the layout', async () => {
    const { generator, calls } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'aurora', layout: 'banner-image-left', copy: '新登場', cta: '購入する' });

    expect(calls.generate).toHaveLength(1);
    expect(calls.edit).toHaveLength(0);
    expect(calls.generate[0].size).toBe('1024x1536'); // the layout's image size
    expect(calls.generate[0].prompt).toMatch(/Do not render any text/i);
    expect(calls.generate[0].prompt).not.toMatch(/negative space/i); // image fills its own region now

    const img = await loadImage(out);
    expect([img.width, img.height]).toEqual([1536, 1024]); // layout canvas size
    expect(await pixel(out, ...IMG_POINT)).toEqual([0x00, 0x00, 0xff]); // generated image in the image region
  });

  it('generate + overlay, with material: edits the material then composes it', async () => {
    const { generator, calls } = fakeGenerator();
    const material = solidPng(50, 50, '#ff00ff').toString('base64');
    const out = await runBanner(generator, { clientId: 'aurora', layout: 'banner-image-left', copy: 'Hi', materialImageBase64: material });

    expect(calls.edit).toHaveLength(1);
    expect(calls.generate).toHaveLength(0);
    expect(await pixel(out, ...IMG_POINT)).toEqual([0x00, 0xff, 0xff]); // edited image in the image region
  });

  it('generate only: ships the model output unchanged', async () => {
    const { generator, calls } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'lumen', layout: 'kv' });

    expect(calls.generate).toHaveLength(1);
    expect(calls.generate[0].size).toBe('1536x1024'); // kv image size
    const img = await loadImage(out);
    expect([img.width, img.height]).toEqual([64, 64]); // raw generated image, not composed
  });

  it('overlay only, with material: composes the material, no generation', async () => {
    const { generator, calls } = fakeGenerator();
    const material = solidPng(50, 50, '#ff0000').toString('base64');
    const out = await runBanner(generator, { clientId: 'verde', layout: 'banner-image-left', copy: 'セール', materialImageBase64: material });

    expect(calls.generate).toHaveLength(0);
    expect(calls.edit).toHaveLength(0);
    const [r, g, b] = await pixel(out, ...IMG_POINT);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60); // red material in the image region
  });

  it('overlay only, no material: leaves the brand background in the image region', async () => {
    const { generator } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'verde', layout: 'banner-image-left', copy: 'セール' });
    expect(await pixel(out, ...IMG_POINT)).toEqual([0x1f, 0x3d, 0x2b]); // verde brand background
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
