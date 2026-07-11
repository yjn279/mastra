import sharp from 'sharp';
import type { BannerRequest, BrandSpec, ClientConfig } from '../brand/types';
import { resolveClient as resolveClientDefault } from '../brand/clients';
import type { ImageGenerator } from './generator';
import { renderOverlay } from './overlay';

export interface BannerProcessDeps {
  generator: ImageGenerator;
  resolveClient?: (clientId: string) => ClientConfig;
}

export interface BannerProcessResult {
  client: ClientConfig;
  image: Buffer;
}

function brandBackground(brand: BrandSpec): Promise<Buffer> {
  return sharp({
    create: {
      width: brand.canvasWidth,
      height: brand.canvasHeight,
      channels: 3,
      background: brand.backgroundColor,
    },
  })
    .png()
    .toBuffer();
}

/**
 * Single control point for "generate → overlay": each stage is gated by the client's
 * StageFlags, and the overlay target is resolved as generated image > material image >
 * brand background. Workflow/Tool/Agent must call this rather than reimplementing the gating.
 */
export async function runBannerProcess(request: BannerRequest, deps: BannerProcessDeps): Promise<BannerProcessResult> {
  const resolveClient = deps.resolveClient ?? resolveClientDefault;
  const client = resolveClient(request.clientId);
  const { stages, brand } = client;

  let image: Buffer;
  if (stages.generate) {
    const generated = await deps.generator.generate({
      referenceText: request.referenceText,
      materialImage: request.materialImage,
      brand,
      reserveOverlaySpace: stages.overlay,
    });
    if (stages.overlay) {
      // The overlay stage below normalizes the image to the brand canvas size itself, so
      // there's no need to do it here too.
      image = generated;
    } else {
      // gpt-image-2 only accepts sizes divisible by 16, so the generator's output dimensions can
      // drift from the brand's declared canvas size; normalize here so every stage combination
      // returns an image sized to exactly brand.canvasWidth x brand.canvasHeight.
      image = await sharp(generated).resize(brand.canvasWidth, brand.canvasHeight, { fit: 'cover' }).png().toBuffer();
    }
  } else if (request.materialImage) {
    image = request.materialImage;
  } else {
    image = await brandBackground(brand);
  }

  if (stages.overlay) {
    image = await renderOverlay(image, { copy: request.copy, cta: request.cta, brand });
  }

  return { client, image };
}
