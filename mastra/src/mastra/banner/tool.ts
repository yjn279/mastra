import { createTool } from '@mastra/core/tools';
import OpenAI from 'openai';
import { z } from 'zod';
import { runBannerProcess } from './process';
import { GptImage2Generator } from './generator';
import type { ImageGenerator } from './generator';
import type { ClientConfig } from '../brand/types';

export const generateBannerInputSchema = z.object({
  clientId: z.string().describe('Registered client id used to resolve stage flags and brand settings'),
  copy: z.string().describe('Headline copy to draw when the overlay stage is enabled'),
  cta: z.string().optional().describe('Call-to-action text to draw when the overlay stage is enabled'),
  referenceText: z.string().optional().describe('Optional brief describing the desired generated image content'),
  materialImageBase64: z
    .string()
    .optional()
    .describe('Base64-encoded material image, used as generation input and/or as the overlay target'),
});

export const generateBannerOutputSchema = z.object({
  clientId: z.string(),
  imageBase64: z.string().describe('Base64-encoded PNG banner result'),
});

export interface GenerateBannerToolDeps {
  generator?: ImageGenerator;
  /** Overrides client resolution; defaults to the real client registry (see M5/process.ts). Mainly for tests. */
  resolveClient?: (clientId: string) => ClientConfig;
}

let defaultGenerator: ImageGenerator | undefined;

/** Lazily built so importing this module never requires OPENAI_API_KEY (tests inject a stub instead). */
function resolveDefaultGenerator(): ImageGenerator {
  if (!defaultGenerator) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    defaultGenerator = new GptImage2Generator(client.images);
  }
  return defaultGenerator;
}

/**
 * Thin wrapper around the M5 common process (SSOT for the generate/overlay control logic).
 * `deps.generator` lets tests and the workflow inject a stub instead of the live gpt-image-2 adapter.
 */
export function createGenerateBannerTool(deps: GenerateBannerToolDeps = {}) {
  return createTool({
    id: 'generate-banner',
    description:
      'Runs the common generate-then-overlay banner process for a client: resolves the client brand settings, ' +
      'optionally generates a background image with gpt-image-2, and optionally overlays brand-compliant copy and CTA.',
    inputSchema: generateBannerInputSchema,
    outputSchema: generateBannerOutputSchema,
    execute: async input => {
      const generator = deps.generator ?? resolveDefaultGenerator();
      const materialImage = input.materialImageBase64 ? Buffer.from(input.materialImageBase64, 'base64') : undefined;

      const result = await runBannerProcess(
        { clientId: input.clientId, copy: input.copy, cta: input.cta, referenceText: input.referenceText, materialImage },
        { generator, resolveClient: deps.resolveClient },
      );

      return { clientId: result.client.id, imageBase64: result.image.toString('base64') };
    },
  });
}

export const generateBannerTool = createGenerateBannerTool();
