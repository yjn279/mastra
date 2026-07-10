import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createBannerWorkflow } from './workflow';
import { noopObserve } from '@mastra/core/tools';
import { createGenerateBannerTool, generateBannerTool } from './tool';
import type { ImageGenerator } from './generator';
import type { ClientConfig } from '../brand/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, StubGenerator, solidImage, stubResolveClient, testClient } from './test-fixtures';

interface GenerateBannerOutput {
  clientId: string;
  imageBase64: string;
}

async function callTool(
  tool: ReturnType<typeof createGenerateBannerTool>,
  input: Parameters<NonNullable<ReturnType<typeof createGenerateBannerTool>['execute']>>[0],
): Promise<GenerateBannerOutput> {
  const output = await tool.execute!(input, { observe: noopObserve });
  return output as GenerateBannerOutput;
}

describe('bannerWorkflow', () => {
  async function run(client: ClientConfig, generator: ImageGenerator, inputData: Record<string, unknown>) {
    const workflow = createBannerWorkflow({ generator, resolveClient: stubResolveClient(client) });
    const wfRun = await workflow.createRun();
    return wfRun.start({ inputData: { clientId: client.id, copy: 'Sale', ...inputData } });
  }

  it('generate only: returns the generator output untouched, base64-encoded', async () => {
    const client = testClient({ generate: true, overlay: false });
    const generatorOutput = Buffer.from('generated-bytes');
    const generator = new StubGenerator(generatorOutput);

    const result = await run(client, generator, { referenceText: 'coffee shop' });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result.clientId).toBe(client.id);
    expect(Buffer.from(result.result.imageBase64, 'base64').equals(generatorOutput)).toBe(true);
    expect(generator.calls[0].reserveOverlaySpace).toBe(false);
  });

  it('generate + overlay: overlays the headline onto the generated image', async () => {
    const client = testClient({ generate: true, overlay: true });
    const generatedBase = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, '#00FF00');
    const generator = new StubGenerator(generatedBase);

    const result = await run(client, generator, {});

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(generator.calls[0].reserveOverlaySpace).toBe(true);
    const image = await sharp(Buffer.from(result.result.imageBase64, 'base64')).raw().toBuffer({ resolveWithObject: true });
    expect(image.info.width).toBe(CANVAS_WIDTH);
    expect(image.info.height).toBe(CANVAS_HEIGHT);
  });

  it('overlay only: overlays onto the supplied material image and never calls the generator', async () => {
    const client = testClient({ generate: false, overlay: true });
    const material = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, '#00FF00');
    const generator = new StubGenerator(Buffer.from('should-not-be-used'));

    const result = await run(client, generator, { materialImageBase64: material.toString('base64') });

    expect(result.status).toBe('success');
    expect(generator.calls).toHaveLength(0);
    if (result.status !== 'success') return;
    const image = await sharp(Buffer.from(result.result.imageBase64, 'base64')).raw().toBuffer({ resolveWithObject: true });
    expect(image.info.width).toBe(CANVAS_WIDTH);
    expect(image.info.height).toBe(CANVAS_HEIGHT);
  });

  it('propagates the resolveClient error for an unknown client id', async () => {
    const client = testClient({ generate: false, overlay: false });
    const generator = new StubGenerator(Buffer.from('unused'));
    const workflow = createBannerWorkflow({ generator, resolveClient: stubResolveClient(client) });
    const wfRun = await workflow.createRun();

    const result = await wfRun.start({ inputData: { clientId: 'does-not-exist', copy: 'Sale' } });

    expect(result.status).toBe('failed');
  });
});

describe('generateBannerTool', () => {
  it('round-trips a base64 material image through to the overlay renderer', async () => {
    const client = testClient({ generate: false, overlay: true }, { backgroundColor: '#0000FF' });
    const material = await solidImage(CANVAS_WIDTH, CANVAS_HEIGHT, '#00FF00');
    const generator = new StubGenerator(Buffer.from('should-not-be-used'));
    const tool = createGenerateBannerTool({ generator, resolveClient: stubResolveClient(client) });

    const output = await callTool(tool, {
      clientId: client.id,
      copy: 'Sale',
      cta: 'Buy now',
      materialImageBase64: material.toString('base64'),
    });

    expect(generator.calls).toHaveLength(0);
    expect(output.clientId).toBe(client.id);
    const image = await sharp(Buffer.from(output.imageBase64, 'base64')).raw().toBuffer({ resolveWithObject: true });
    expect(image.info.width).toBe(CANVAS_WIDTH);
    expect(image.info.height).toBe(CANVAS_HEIGHT);
  });

  it('wires to the real client registry by default', async () => {
    const generatorOutput = Buffer.from('generated-bytes');
    const generator = new StubGenerator(generatorOutput);
    const tool = createGenerateBannerTool({ generator });

    const output = await callTool(tool, { clientId: 'sample-generate-only', copy: 'Sale' });

    expect(output.clientId).toBe('sample-generate-only');
    expect(Buffer.from(output.imageBase64, 'base64').equals(generatorOutput)).toBe(true);
  });

  it('exports a ready-to-register default tool instance', () => {
    expect(generateBannerTool.id).toBe('generate-banner');
  });
});
