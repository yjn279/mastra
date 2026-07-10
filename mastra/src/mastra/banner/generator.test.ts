import { describe, expect, it, vi } from 'vitest';
import type { GptImagesClient, ImageGeneratorInput } from './generator';
import { GptImage2Generator } from './generator';
import type { BrandSpec } from '../brand/types';

function testBrand(overrides: Partial<BrandSpec> = {}): BrandSpec {
  const font = { family: 'Test Sans', filePath: '/fonts/test.ttf' };
  return {
    canvasWidth: 1080,
    canvasHeight: 1080,
    margin: { top: 40, right: 32, bottom: 48, left: 24 },
    backgroundColor: '#FFFFFF',
    headline: { font, size: 48, color: '#111111', position: 'top-left' },
    cta: {
      font,
      size: 24,
      color: '#FFFFFF',
      backgroundColor: '#000000',
      position: 'bottom-right',
      paddingX: 16,
      paddingY: 8,
    },
    ...overrides,
  };
}

function stubResponse(bytes: string) {
  return { data: [{ b64_json: Buffer.from(bytes).toString('base64') }] };
}

function createClient(): GptImagesClient {
  return {
    generate: vi.fn().mockResolvedValue(stubResponse('generated-image')),
    edit: vi.fn().mockResolvedValue(stubResponse('edited-image')),
  };
}

describe('GptImage2Generator', () => {
  it('calls images.generate when no material image is provided', async () => {
    const client = createClient();
    const generator = new GptImage2Generator(client);
    const input: ImageGeneratorInput = { brand: testBrand(), reserveOverlaySpace: false };

    const result = await generator.generate(input);

    expect(client.edit).not.toHaveBeenCalled();
    expect(client.generate).toHaveBeenCalledTimes(1);
    const params = vi.mocked(client.generate).mock.calls[0][0];
    expect(params.model).toBe('gpt-image-2');
    expect(params.background).toBe('opaque');
    expect(result).toEqual(Buffer.from('generated-image'));
  });

  it('calls images.edit with the material image when one is provided', async () => {
    const client = createClient();
    const generator = new GptImage2Generator(client);
    const materialImage = Buffer.from('material-bytes');
    const input: ImageGeneratorInput = { brand: testBrand(), materialImage, reserveOverlaySpace: false };

    const result = await generator.generate(input);

    expect(client.generate).not.toHaveBeenCalled();
    expect(client.edit).toHaveBeenCalledTimes(1);
    const params = vi.mocked(client.edit).mock.calls[0][0];
    expect(params.model).toBe('gpt-image-2');
    const uploaded = params.image as File;
    expect(uploaded.name).toBe('material.png');
    expect(Buffer.from(await uploaded.arrayBuffer())).toEqual(materialImage);
    expect(result).toEqual(Buffer.from('edited-image'));
  });

  it('always instructs the model not to render any text', async () => {
    const client = createClient();
    const generator = new GptImage2Generator(client);

    await generator.generate({ brand: testBrand(), reserveOverlaySpace: false });

    const params = vi.mocked(client.generate).mock.calls[0][0];
    expect(params.prompt).toContain('Do not render any text');
  });

  it('requests a reserved, uncluttered background when the overlay stage will run afterward', async () => {
    const client = createClient();
    const generator = new GptImage2Generator(client);
    const brand = testBrand();

    await generator.generate({ brand, reserveOverlaySpace: true });

    const params = vi.mocked(client.generate).mock.calls[0][0];
    expect(params.prompt).toContain(brand.headline.position);
    expect(params.prompt).toContain(brand.cta.position);
    expect(params.prompt).toContain(`${brand.margin.top}px from the top`);
  });

  it('does not request reserved overlay space when no overlay stage follows', async () => {
    const client = createClient();
    const generator = new GptImage2Generator(client);

    await generator.generate({ brand: testBrand(), reserveOverlaySpace: false });

    const params = vi.mocked(client.generate).mock.calls[0][0];
    expect(params.prompt).not.toContain('overlaid there afterward');
  });

  it('uses referenceText as the image subject when provided', async () => {
    const client = createClient();
    const generator = new GptImage2Generator(client);

    await generator.generate({
      brand: testBrand(),
      referenceText: 'A sunlit coffee shop counter with pastries',
      reserveOverlaySpace: false,
    });

    const params = vi.mocked(client.generate).mock.calls[0][0];
    expect(params.prompt).toContain('A sunlit coffee shop counter with pastries');
  });

  it('rounds the requested size to a multiple of 16', async () => {
    const client = createClient();
    const generator = new GptImage2Generator(client);

    await generator.generate({ brand: testBrand({ canvasWidth: 1080, canvasHeight: 1350 }), reserveOverlaySpace: false });

    const params = vi.mocked(client.generate).mock.calls[0][0];
    expect(params.size).toBe('1088x1344');
  });

  it('throws when the gpt-image-2 response has no image data', async () => {
    const client = createClient();
    vi.mocked(client.generate).mockResolvedValue({ created: Date.now(), data: [] });
    const generator = new GptImage2Generator(client);

    await expect(generator.generate({ brand: testBrand(), reserveOverlaySpace: false })).rejects.toThrow(
      'gpt-image-2 response did not include image data',
    );
  });
});
