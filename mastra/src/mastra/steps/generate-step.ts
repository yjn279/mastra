import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { getClient } from '../clients';
import type { ClientConfig } from '../clients/types';
import type { ImageGenerator } from '../lib/image-generator';

/** Workflow input: the client, the copy/CTA to lay out, and an optional material image. */
export const bannerInputSchema = z.object({
  clientId: z.string(),
  copy: z.string().optional(),
  cta: z.string().optional(),
  referenceText: z.string().optional(),
  materialImageBase64: z.string().optional(),
});

/** Data passed from the generate step to the overlay step. */
export const flowSchema = z.object({
  clientId: z.string(),
  copy: z.string().optional(),
  cta: z.string().optional(),
  /** Base image for overlay (generated or material), or null for the brand background. */
  imageBase64: z.string().nullable(),
});

/** Build the model prompt; forbid text when the overlay step will draw it. */
export function buildPrompt(client: ClientConfig, referenceText?: string): string {
  const parts = [client.generation?.guidance || `Marketing banner background for ${client.name}.`];
  if (referenceText) parts.push(referenceText);
  if (client.overlay) {
    parts.push(
      'Do not render any text, letters, words, numbers or logos. Leave clean, uncluttered negative space for text to be overlaid later.',
    );
  }
  return parts.join(' ');
}

/** Generate step: creates a background with gpt-image-2, or passes the material through when generation is off. */
export function createGenerateStep(generator: ImageGenerator) {
  return createStep({
    id: 'generate',
    inputSchema: bannerInputSchema,
    outputSchema: flowSchema,
    execute: async ({ inputData }) => {
      const client = getClient(inputData.clientId);
      const passthrough = {
        clientId: client.id,
        copy: inputData.copy,
        cta: inputData.cta,
      };

      if (!client.generate) {
        return { ...passthrough, imageBase64: inputData.materialImageBase64 ?? null };
      }

      const size = client.generation?.size ?? '1024x1024';
      const prompt = buildPrompt(client, inputData.referenceText);
      const image = inputData.materialImageBase64
        ? await generator.edit({ prompt, size, image: Buffer.from(inputData.materialImageBase64, 'base64') })
        : await generator.generate({ prompt, size });

      return { ...passthrough, imageBase64: image.toString('base64') };
    },
  });
}
