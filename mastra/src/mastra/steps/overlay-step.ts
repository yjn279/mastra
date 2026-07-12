import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { getClient } from '../clients';
import { renderOverlay } from '../lib/overlay-renderer';
import { flowSchema } from './generate-step';

export const bannerOutputSchema = z.object({
  imageBase64: z.string(),
});

/** Overlay step: draws brand copy/CTA/logo onto the base, or passes the image through when overlay is off. */
export const overlayStep = createStep({
  id: 'overlay',
  inputSchema: flowSchema,
  outputSchema: bannerOutputSchema,
  execute: async ({ inputData }) => {
    const client = getClient(inputData.clientId);

    if (!client.overlay) {
      if (!inputData.imageBase64) throw new Error(`client ${client.id}: no image to output`);
      return { imageBase64: inputData.imageBase64 };
    }

    const base = inputData.imageBase64 ? Buffer.from(inputData.imageBase64, 'base64') : null;
    const png = await renderOverlay({ base, brand: client.brand, copy: inputData.copy, cta: inputData.cta });
    return { imageBase64: png.toString('base64') };
  },
});
