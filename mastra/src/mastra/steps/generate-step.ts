import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { getClient } from '../clients';
import { getLayout } from '../layouts';
import type { ClientConfig } from '../clients/types';
import type { Layout } from '../layouts/types';
import type { ImageGenerator } from '../lib/image-generator';

/** Workflow input: client, layout, the copy/CTA to lay out, and an optional material image. */
export const bannerInputSchema = z.object({
  clientId: z.string(),
  layout: z.string(),
  copy: z.string().optional(),
  cta: z.string().optional(),
  referenceText: z.string().optional(),
  materialImageBase64: z.string().optional(),
});

/** Data passed from the generate step to the overlay step: the layout inputs plus the resolved image. */
export const flowSchema = bannerInputSchema
  .omit({ referenceText: true, materialImageBase64: true })
  .extend({
    /** Full-canvas image (generated or material), or null to leave the brand background. */
    imageBase64: z.string().nullable(),
  });

/**
 * Build the model prompt. The model paints a product photo only — never text.
 * When the banner overlays copy, the layout's placement reserves clean space for it.
 */
export function buildPrompt(client: ClientConfig, layout: Layout, referenceText?: string): string {
  const parts = [client.generation?.guidance || `Marketing product photograph for ${client.name}.`];
  if (referenceText) parts.push(referenceText);
  parts.push(client.overlay ? layout.placement : 'A clean, well-composed product photograph that fills the frame.');
  parts.push('Do not render any text, letters, words, numbers or logos.');
  return parts.join(' ');
}

/** Generate step: paints a product image with gpt-image-2, or passes the material through when generation is off. */
export function createGenerateStep(generator: ImageGenerator) {
  return createStep({
    id: 'generate',
    inputSchema: bannerInputSchema,
    outputSchema: flowSchema,
    execute: async ({ inputData }) => {
      const client = getClient(inputData.clientId);
      const passthrough = {
        clientId: client.id,
        layout: inputData.layout,
        copy: inputData.copy,
        cta: inputData.cta,
      };

      if (!client.generate) {
        return { ...passthrough, imageBase64: inputData.materialImageBase64 ?? null };
      }

      const layout = getLayout(inputData.layout);
      const prompt = buildPrompt(client, layout, inputData.referenceText);
      const size = layout.imageSize;
      const image = inputData.materialImageBase64
        ? await generator.edit({ prompt, size, image: Buffer.from(inputData.materialImageBase64, 'base64') })
        : await generator.generate({ prompt, size });

      return { ...passthrough, imageBase64: image.toString('base64') };
    },
  });
}
