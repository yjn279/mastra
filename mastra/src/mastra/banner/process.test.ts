import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { runBannerProcess } from './process';
import type { StageFlags } from '../brand/types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  MARGIN,
  StubGenerator,
  solidImage,
  stubResolveClient,
  testClient,
  toRaw,
  pixelAt,
  matchesHex,
} from './test-fixtures';

const WHITE = '#FFFFFF';
const RED = '#FF0000';
const GREEN = '#00FF00';
const BLUE = '#0000FF';

const TOLERANCE = 10;

describe('runBannerProcess', () => {
  describe('generate only (generate: true, overlay: false)', () => {
    const stages: StageFlags = { generate: true, overlay: false };

    it('normalizes the generator output to the brand canvas size and requests no reserved overlay space', async () => {
      const client = testClient(stages);
      const generatorOutput = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, RED);
      const generator = new StubGenerator(generatorOutput);

      const result = await runBannerProcess(
        { clientId: client.id, copy: 'Sale', referenceText: 'coffee shop' },
        { generator, resolveClient: stubResolveClient(client) },
      );

      const image = await toRaw(result.image);
      expect(image.width).toBe(CANVAS_WIDTH);
      expect(image.height).toBe(CANVAS_HEIGHT);
      expect(matchesHex(pixelAt(image, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2), RED, 0)).toBe(true);
      expect(generator.calls).toHaveLength(1);
      expect(generator.calls[0].materialImage).toBeUndefined();
      expect(generator.calls[0].reserveOverlaySpace).toBe(false);
      expect(generator.calls[0].referenceText).toBe('coffee shop');
    });

    it('passes the material image to the generator when supplied', async () => {
      const client = testClient(stages);
      const material = Buffer.from('material-bytes');
      const generator = new StubGenerator(await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, GREEN));

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
      expect(matchesHex(pixelAt(image, MARGIN + 10, MARGIN + 20), RED, TOLERANCE)).toBe(true); // headline drawn
      expect(matchesHex(pixelAt(image, CANVAS_WIDTH - MARGIN - 10, MARGIN + 10), GREEN, TOLERANCE)).toBe(true); // untouched area keeps generated base
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
      expect(matchesHex(pixelAt(image, MARGIN + 10, MARGIN + 20), RED, TOLERANCE)).toBe(true);
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
      expect(matchesHex(pixelAt(image, MARGIN + 10, MARGIN + 20), RED, TOLERANCE)).toBe(true);
      expect(matchesHex(pixelAt(image, CANVAS_WIDTH - MARGIN - 10, MARGIN + 10), GREEN, TOLERANCE)).toBe(true);
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
      expect(matchesHex(pixelAt(image, MARGIN + 10, MARGIN + 20), RED, TOLERANCE)).toBe(true); // headline drawn
      expect(matchesHex(pixelAt(image, CANVAS_WIDTH - MARGIN - 10, MARGIN + 10), BLUE, TOLERANCE)).toBe(true); // brand background shows through
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

  it('wires to the real client registry by default', async () => {
    const generator = new StubGenerator(await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, RED));

    const result = await runBannerProcess({ clientId: 'sample-generate-only', copy: 'Sale' }, { generator });

    expect(result.client.id).toBe('sample-generate-only');
    const metadata = await sharp(result.image).metadata();
    expect(metadata.width).toBe(result.client.brand.canvasWidth);
    expect(metadata.height).toBe(result.client.brand.canvasHeight);
  });

  it.each(['sample-generate-overlay', 'sample-overlay-only'])(
    'overlays onto the real %s sample using its registered brand font and logo assets',
    async clientId => {
      const generatedBase = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, GREEN);
      const generator = new StubGenerator(generatedBase);

      const result = await runBannerProcess({ clientId, copy: 'Sale', cta: 'Shop now' }, { generator });

      expect(result.client.id).toBe(clientId);
      const metadata = await sharp(result.image).metadata();
      expect(metadata.width).toBe(result.client.brand.canvasWidth);
      expect(metadata.height).toBe(result.client.brand.canvasHeight);
    },
  );
});
