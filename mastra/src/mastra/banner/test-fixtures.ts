import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { ImageGenerator, ImageGeneratorInput } from './generator';
import type { BrandSpec, ClientConfig, StageFlags } from '../brand/types';

export const FONT_PATH = fileURLToPath(new URL('../assets/fonts/NotoSansJP-Bold.otf', import.meta.url));

export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 300;
export const MARGIN = 40;

export function testBrand(overrides: Partial<BrandSpec> = {}): BrandSpec {
  const font = { family: 'Noto Sans JP', filePath: FONT_PATH, weight: 700 };
  return {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
    backgroundColor: '#FFFFFF',
    headline: { font, size: 32, color: '#FF0000', position: 'top-left' },
    cta: {
      font,
      size: 20,
      color: '#FFFFFF',
      backgroundColor: '#0000FF',
      position: 'bottom-center',
      paddingX: 16,
      paddingY: 8,
    },
    ...overrides,
  };
}

export function testClient(stages: StageFlags, brandOverrides: Partial<BrandSpec> = {}): ClientConfig {
  return { id: 'test-client', name: 'Test Client', stages, brand: testBrand(brandOverrides) };
}

export function stubResolveClient(client: ClientConfig): (id: string) => ClientConfig {
  return (id: string) => {
    if (id !== client.id) throw new Error(`Unknown client id: ${id}`);
    return client;
  };
}

export function solidImage(width: number, height: number, color: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

export class StubGenerator implements ImageGenerator {
  calls: ImageGeneratorInput[] = [];
  constructor(private readonly output: Buffer) {}
  async generate(input: ImageGeneratorInput): Promise<Buffer> {
    this.calls.push(input);
    return this.output;
  }
}
