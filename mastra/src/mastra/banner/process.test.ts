import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { runBannerProcess } from './process';
import type { ImageGenerator, ImageGeneratorInput } from './generator';
import type { BrandSpec, ClientConfig, StageFlags } from '../brand/types';

const FONT_PATH = fileURLToPath(new URL('../assets/fonts/NotoSansJP-Bold.otf', import.meta.url));

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;
const MARGIN = 40;

const WHITE = '#FFFFFF';
const RED = '#FF0000';
const GREEN = '#00FF00';
const BLUE = '#0000FF';

function testBrand(overrides: Partial<BrandSpec> = {}): BrandSpec {
  const font = { family: 'Noto Sans JP', filePath: FONT_PATH, weight: 700 };
  return {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
    backgroundColor: WHITE,
    headline: { font, size: 32, color: RED, position: 'top-left' },
    cta: {
      font,
      size: 20,
      color: WHITE,
      backgroundColor: BLUE,
      position: 'bottom-center',
      paddingX: 16,
      paddingY: 8,
    },
    ...overrides,
  };
}

function testClient(stages: StageFlags, brandOverrides: Partial<BrandSpec> = {}): ClientConfig {
  return {
    id: 'test-client',
    name: 'Test Client',
    stages,
    brand: testBrand(brandOverrides),
  };
}

function stubResolveClient(client: ClientConfig): (id: string) => ClientConfig {
  return (id: string) => {
    if (id !== client.id) throw new Error(`Unknown client id: ${id}`);
    return client;
  };
}

function solidImage(width: number, height: number, color: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

class StubGenerator implements ImageGenerator {
  calls: ImageGeneratorInput[] = [];
  constructor(private readonly output: Buffer) {}
  async generate(input: ImageGeneratorInput): Promise<Buffer> {
    this.calls.push(input);
    return this.output;
  }
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

function matchesHex(pixel: { r: number; g: number; b: number }, hex: string, tolerance = 10): boolean {
  const target = hexToRgb(hex);
  return (
    Math.abs(pixel.r - target.r) <= tolerance &&
    Math.abs(pixel.g - target.g) <= tolerance &&
    Math.abs(pixel.b - target.b) <= tolerance
  );
}

describe('runBannerProcess', () => {
  describe('generate only (generate: true, overlay: false)', () => {
    const stages: StageFlags = { generate: true, overlay: false };

    it('returns the generator output untouched and requests no reserved overlay space', async () => {
      const client = testClient(stages);
      const generatorOutput = Buffer.from('generated-bytes');
      const generator = new StubGenerator(generatorOutput);

      const result = await runBannerProcess(
        { clientId: client.id, copy: 'Sale', referenceText: 'coffee shop' },
        { generator, resolveClient: stubResolveClient(client) },
      );

      expect(result.image.equals(generatorOutput)).toBe(true);
      expect(generator.calls).toHaveLength(1);
      expect(generator.calls[0].materialImage).toBeUndefined();
      expect(generator.calls[0].reserveOverlaySpace).toBe(false);
      expect(generator.calls[0].referenceText).toBe('coffee shop');
    });

    it('passes the material image to the generator when supplied', async () => {
      const client = testClient(stages);
      const material = Buffer.from('material-bytes');
      const generator = new StubGenerator(Buffer.from('generated-bytes'));

      await runBannerProcess(
        { clientId: client.id, copy: 'Sale', materialImage: material },
        { generator, resolveClient: stubResolveClient(client) },
      );

      expect(generator.calls[0].materialImage).toBe(material);
    });
  });

  describe('generate + overlay (generate: true, overlay: true)', () => {
    const stages: StageFlags = { generate: true, overlay: true };

    it('requests reserved overlay space and overlays the headline onto the generated image', async () => {
      const client = testClient(stages);
      const generatedBase = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, GREEN);
      const generator = new StubGenerator(generatedBase);

      const result = await runBannerProcess(
        { clientId: client.id, copy: 'Headline' },
        { generator, resolveClient: stubResolveClient(client) },
      );

      expect(generator.calls[0].reserveOverlaySpace).toBe(true);
      expect(generator.calls[0].materialImage).toBeUndefined();

      const image = await toRaw(result.image);
      expect(image.width).toBe(CANVAS_WIDTH);
      expect(image.height).toBe(CANVAS_HEIGHT);
      expect(matchesHex(pixelAt(image, MARGIN + 10, MARGIN + 20), RED)).toBe(true); // headline drawn
      expect(matchesHex(pixelAt(image, CANVAS_WIDTH - MARGIN - 10, MARGIN + 10), GREEN)).toBe(true); // untouched area keeps generated base
    });

    it('passes the material image to the generator and still overlays the result', async () => {
      const client = testClient(stages);
      const material = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, WHITE);
      const generatedBase = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, GREEN);
      const generator = new StubGenerator(generatedBase);

      const result = await runBannerProcess(
        { clientId: client.id, copy: 'Headline', materialImage: material },
        { generator, resolveClient: stubResolveClient(client) },
      );

      expect(generator.calls[0].materialImage).toBe(material);
      expect(generator.calls[0].reserveOverlaySpace).toBe(true);

      const image = await toRaw(result.image);
      expect(matchesHex(pixelAt(image, MARGIN + 10, MARGIN + 20), RED)).toBe(true);
    });
  });

  describe('overlay only (generate: false, overlay: true)', () => {
    const stages: StageFlags = { generate: false, overlay: true };

    it('overlays onto the material image and never calls the generator', async () => {
      const client = testClient(stages);
      const material = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, GREEN);
      const generator = new StubGenerator(Buffer.from('should-not-be-used'));

      const result = await runBannerProcess(
        { clientId: client.id, copy: 'Headline', materialImage: material },
        { generator, resolveClient: stubResolveClient(client) },
      );

      expect(generator.calls).toHaveLength(0);
      const image = await toRaw(result.image);
      expect(matchesHex(pixelAt(image, MARGIN + 10, MARGIN + 20), RED)).toBe(true);
      expect(matchesHex(pixelAt(image, CANVAS_WIDTH - MARGIN - 10, MARGIN + 10), GREEN)).toBe(true);
    });

    it('falls back to the brand background when there is no material image', async () => {
      const client = testClient(stages, { backgroundColor: BLUE });
      const generator = new StubGenerator(Buffer.from('should-not-be-used'));

      const result = await runBannerProcess(
        { clientId: client.id, copy: 'Headline' },
        { generator, resolveClient: stubResolveClient(client) },
      );

      expect(generator.calls).toHaveLength(0);
      const image = await toRaw(result.image);
      expect(image.width).toBe(CANVAS_WIDTH);
      expect(image.height).toBe(CANVAS_HEIGHT);
      expect(matchesHex(pixelAt(image, MARGIN + 10, MARGIN + 20), RED)).toBe(true); // headline drawn
      expect(matchesHex(pixelAt(image, CANVAS_WIDTH - MARGIN - 10, MARGIN + 10), BLUE)).toBe(true); // brand background shows through
    });
  });

  describe('neither stage (generate: false, overlay: false)', () => {
    const stages: StageFlags = { generate: false, overlay: false };

    it('passes the material image through unchanged and never calls the generator', async () => {
      const client = testClient(stages);
      const material = Buffer.from('raw-material-bytes');
      const generator = new StubGenerator(Buffer.from('should-not-be-used'));

      const result = await runBannerProcess(
        { clientId: client.id, copy: 'Headline', materialImage: material },
        { generator, resolveClient: stubResolveClient(client) },
      );

      expect(generator.calls).toHaveLength(0);
      expect(result.image.equals(material)).toBe(true);
    });

    it('falls back to an untouched brand background when there is no material image', async () => {
      const client = testClient(stages, { backgroundColor: GREEN });
      const generator = new StubGenerator(Buffer.from('should-not-be-used'));

      const result = await runBannerProcess({ clientId: client.id, copy: 'Headline' }, { generator, resolveClient: stubResolveClient(client) });

      expect(generator.calls).toHaveLength(0);
      const image = await toRaw(result.image);
      expect(image.width).toBe(CANVAS_WIDTH);
      expect(image.height).toBe(CANVAS_HEIGHT);
      expect(matchesHex(pixelAt(image, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2), GREEN, 0)).toBe(true);
    });
  });

  it('returns the resolved client alongside the image', async () => {
    const client = testClient({ generate: false, overlay: false });
    const generator = new StubGenerator(Buffer.from('unused'));

    const result = await runBannerProcess(
      { clientId: client.id, copy: 'Headline', materialImage: Buffer.from('material') },
      { generator, resolveClient: stubResolveClient(client) },
    );

    expect(result.client).toBe(client);
  });

  it('propagates the resolveClient error for an unknown client id', async () => {
    const generator = new StubGenerator(Buffer.from('unused'));

    await expect(
      runBannerProcess(
        { clientId: 'does-not-exist', copy: 'Headline' },
        { generator, resolveClient: stubResolveClient(testClient({ generate: false, overlay: false })) },
      ),
    ).rejects.toThrow('Unknown client id: does-not-exist');
  });

  it('wires to the real client registry by default (generate-only sample needs no overlay assets)', async () => {
    const generatorOutput = Buffer.from('generated-bytes');
    const generator = new StubGenerator(generatorOutput);

    const result = await runBannerProcess({ clientId: 'sample-generate-only', copy: 'Sale' }, { generator });

    expect(result.client.id).toBe('sample-generate-only');
    expect(result.image.equals(generatorOutput)).toBe(true);
  });
});
