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
  input: { clientId: string; copy?: string; cta?: string; materialImageBase64?: string },
) {
  const run = await buildBannerWorkflow(generator).createRun();
  const result = await run.start({ inputData: input });
  if (result.status !== 'success') {
    throw new Error(`workflow failed: ${result.status} ${JSON.stringify((result as any).error ?? '')}`);
  }
  return Buffer.from(result.result.imageBase64, 'base64');
}

async function corner(png: Buffer): Promise<[number, number, number]> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(2, 2, 1, 1).data;
  return [d[0], d[1], d[2]];
}

describe('banner workflow (common process, config-driven)', () => {
  it('generate + overlay, no material: generates a background then overlays copy', async () => {
    const { generator, calls } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'aurora', copy: '新登場', cta: '購入する' });

    expect(calls.generate).toHaveLength(1);
    expect(calls.edit).toHaveLength(0);
    // generation prompt forbids text because overlay follows
    expect(calls.generate[0].prompt).toMatch(/Do not render any text/i);

    const img = await loadImage(out);
    expect([img.width, img.height]).toEqual([1024, 1024]); // brand canvas size, not the 64px generated size
    expect(await corner(out)).toEqual([0x00, 0x00, 0xff]); // painted over the generated background
  });

  it('generate + overlay, with material: edits the material then overlays', async () => {
    const { generator, calls } = fakeGenerator();
    const material = solidPng(50, 50, '#ff00ff').toString('base64');
    const out = await runBanner(generator, { clientId: 'aurora', copy: 'Hi', materialImageBase64: material });

    expect(calls.edit).toHaveLength(1);
    expect(calls.generate).toHaveLength(0);
    expect(await corner(out)).toEqual([0x00, 0xff, 0xff]); // edited background
  });

  it('generate only: ships the model output unchanged', async () => {
    const { generator, calls } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'lumen', copy: 'ignored' });

    expect(calls.generate).toHaveLength(1);
    // no overlay: output is exactly the generated 64x64 image
    const img = await loadImage(out);
    expect([img.width, img.height]).toEqual([64, 64]);
    expect(await corner(out)).toEqual([0x00, 0x00, 0xff]);
  });

  it('generate-only prompt does not forbid text (nothing overlays it)', async () => {
    const { generator, calls } = fakeGenerator();
    await runBanner(generator, { clientId: 'lumen' });
    expect(calls.generate[0].prompt).not.toMatch(/Do not render any text/i);
  });

  it('overlay only, with material: overlays onto the material, no generation', async () => {
    const { generator, calls } = fakeGenerator();
    const material = solidPng(50, 50, '#ff0000').toString('base64');
    const out = await runBanner(generator, { clientId: 'verde', copy: 'セール', materialImageBase64: material });

    expect(calls.generate).toHaveLength(0);
    expect(calls.edit).toHaveLength(0);
    const [r, g, b] = await corner(out);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60); // red material shows through
  });

  it('overlay only, no material: overlays onto the brand background', async () => {
    const { generator } = fakeGenerator();
    const out = await runBanner(generator, { clientId: 'verde', copy: 'セール' });
    expect(await corner(out)).toEqual([0x1f, 0x3d, 0x2b]); // verde brand background
  });

  it('rejects an unknown client', async () => {
    const { generator } = fakeGenerator();
    await expect(runBanner(generator, { clientId: 'nope' })).rejects.toThrow(/unknown client/);
  });
});
