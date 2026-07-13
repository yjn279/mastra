import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { getClient } from '../clients';
import { getLayout } from '../layouts';
import type { ClientConfig } from '../clients/types';
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

/** Data passed from the generate step to the overlay step. */
export const flowSchema = z.object({
  clientId: z.string(),
  layout: z.string(),
  copy: z.string().optional(),
  cta: z.string().optional(),
  /** Product image for the layout's image region (generated or material), or null. */
  imageBase64: z.string().nullable(),
});

/** Build the model prompt. The model paints a product shot only — never text. */
export function buildPrompt(client: ClientConfig, referenceText?: string): string {
  const parts = [client.generation?.guidance || `Marketing product photograph for ${client.name}.`];
  if (referenceText) parts.push(referenceText);
  parts.push(
    'A clean, well-composed product photograph that fills the frame. Do not render any text, letters, words, numbers or logos.',
  );
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

      const size = getLayout(inputData.layout).imageSize;
      const prompt = buildPrompt(client, inputData.referenceText);
      const image = inputData.materialImageBase64
        ? await generator.edit({ prompt, size, image: Buffer.from(inputData.materialImageBase64, 'base64') })
        : await generator.generate({ prompt, size });

      return { ...passthrough, imageBase64: image.toString('base64') };
    },
  });
}
