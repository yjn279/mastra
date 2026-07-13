import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { bannerWorkflow } from '../workflows/banner-workflow';
import { putBanner } from '../lib/banner-store';
import { listClients } from '../clients';
import { listLayouts, describeLayouts } from '../layouts';

const clientIds = listClients().map((c) => c.id);
const layoutNames = listLayouts().map((l) => l.name);

/** Best-effort conversion of an attachment payload to raw base64. */
function toBase64(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const dataUrl = value.match(/^data:[^;]+;base64,(.+)$/);
    if (dataUrl) return dataUrl[1];
    if (/^https?:\/\//.test(value)) return undefined; // remote URL: not fetched here
    return value; // assume raw base64
  }
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (value && typeof value === 'object' && 'data' in value) return toBase64((value as { data: unknown }).data);
  return undefined;
}

/** Pull the most recent attached image out of the conversation, if any. */
function extractMaterialImage(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]?.content ?? messages[i]?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      if (part.type === 'image' || part.type === 'image-url') {
        const b64 = toBase64(part.image ?? part.url ?? part.data);
        if (b64) return b64;
      }
      if (part.type === 'file' && typeof part.mediaType === 'string' && part.mediaType.startsWith('image/')) {
        const b64 = toBase64(part.data ?? part.url);
        if (b64) return b64;
      }
    }
  }
  return undefined;
}

export const createBannerTool = createTool({
  id: 'create-banner',
  description: `Produce a brand-compliant marketing banner for a client (${clientIds.join(', ')}) in a chosen layout (${layoutNames.join(', ')}). Provide the clientId and layout; when the client overlays text, also provide copy and cta. An image attached by the user is used automatically as material.`,
  inputSchema: z.object({
    clientId: z.string().describe(`client id, one of: ${clientIds.join(', ')}`),
    layout: z.string().describe(`layout, one of:\n${describeLayouts()}`),
    copy: z.string().optional().describe('headline copy to overlay (when the client overlays text)'),
    cta: z.string().optional().describe('CTA button label (when the client overlays text)'),
    referenceText: z.string().optional().describe('optional style hints for image generation'),
  }),
  outputSchema: z.object({
    /** Relative URL of the rendered PNG, served by the /banners/:id route. */
    imageUrl: z.string(),
  }),
  execute: async (input, context) => {
    const materialImageBase64 = extractMaterialImage((context as { agent?: { messages?: unknown } })?.agent?.messages);

    const run = await bannerWorkflow.createRun();
    const result = await run.start({ inputData: { ...input, materialImageBase64 } });
    if (result.status !== 'success') {
      throw new Error(`banner workflow did not succeed: ${result.status}`);
    }

    const id = putBanner(Buffer.from(result.result.imageBase64, 'base64'));
    return { imageUrl: `/banners/${id}.png` };
  },
});
