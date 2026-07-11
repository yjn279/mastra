import type OpenAI from 'openai';
import { toFile } from 'openai';
import type { BrandSpec } from '../brand/types';

const MODEL: OpenAI.ImageModel = 'gpt-image-2';

export interface ImageGeneratorInput {
  /** Optional brief describing the desired image content (not the overlay copy). */
  referenceText?: string;
  materialImage?: Buffer;
  brand: BrandSpec;
  /** True when the overlay stage will run afterward and needs clear space to draw into. */
  reserveOverlaySpace: boolean;
}

export interface ImageGenerator {
  generate(input: ImageGeneratorInput): Promise<Buffer>;
}

/** Minimal seam over the OpenAI images resource so tests can inject a stub without network access. */
export interface GptImagesClient {
  generate(params: OpenAI.ImageGenerateParamsNonStreaming): Promise<OpenAI.ImagesResponse>;
  edit(params: OpenAI.ImageEditParamsNonStreaming): Promise<OpenAI.ImagesResponse>;
}

function roundToMultipleOf16(value: number): number {
  return Math.max(16, Math.round(value / 16) * 16);
}

function roundedSizeOf(brand: BrandSpec): { width: number; height: number } {
  return { width: roundToMultipleOf16(brand.canvasWidth), height: roundToMultipleOf16(brand.canvasHeight) };
}

function buildPrompt(input: ImageGeneratorInput, roundedSize: { width: number; height: number }): string {
  const subject = input.referenceText?.trim() || 'A clean marketing banner background matching the brand mood.';
  const instructions = [subject, 'Do not render any text, letters, numbers, or typography anywhere in the image.'];

  if (input.reserveOverlaySpace) {
    const { margin, headline, cta, canvasWidth, canvasHeight } = input.brand;
    // gpt-image-2 renders at roundedSize's 16-rounded dimensions, not the brand's declared canvas
    // size, so margins are scaled to that actual frame to keep the reserved space accurate.
    const scaleX = roundedSize.width / canvasWidth;
    const scaleY = roundedSize.height / canvasHeight;
    instructions.push(
      `Leave a clear, uncluttered background near the ${headline.position} and ${cta.position} of the frame so headline text and a call-to-action button can be overlaid there afterward.`,
      `Keep at least ${Math.round(margin.top * scaleY)}px from the top, ${Math.round(margin.right * scaleX)}px from the right, ${Math.round(margin.bottom * scaleY)}px from the bottom, and ${Math.round(margin.left * scaleX)}px from the left free of busy detail.`,
    );
  }

  return instructions.join(' ');
}

function toBuffer(response: OpenAI.ImagesResponse): Buffer {
  const image = response.data?.[0];
  if (!image?.b64_json) {
    throw new Error('gpt-image-2 response did not include image data');
  }
  return Buffer.from(image.b64_json, 'base64');
}

/** Generates banner backgrounds with gpt-image-2, using edits when a material image is supplied and generations otherwise. */
export class GptImage2Generator implements ImageGenerator {
  constructor(private readonly client: GptImagesClient) {}

  async generate(input: ImageGeneratorInput): Promise<Buffer> {
    const roundedSize = roundedSizeOf(input.brand);
    const prompt = buildPrompt(input, roundedSize);
    const size = `${roundedSize.width}x${roundedSize.height}`;

    if (input.materialImage) {
      const response = await this.client.edit({
        model: MODEL,
        image: await toFile(input.materialImage, 'material.png', { type: 'image/png' }),
        prompt,
        size,
        background: 'opaque',
      });
      return toBuffer(response);
    }

    const response = await this.client.generate({
      model: MODEL,
      prompt,
      size,
      background: 'opaque',
    });
    return toBuffer(response);
  }
}
