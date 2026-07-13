import { createWorkflow } from '@mastra/core/workflows';
import { createGenerateStep, bannerInputSchema } from '../steps/generate-step';
import { overlayStep, bannerOutputSchema } from '../steps/overlay-step';
import { createOpenAIImageGenerator, type ImageGenerator } from '../lib/image-generator';

/**
 * The single common process every client runs: generate → overlay.
 * Each step is enabled or skipped per the client's config, with no mode branching.
 */
export function buildBannerWorkflow(generator: ImageGenerator = createOpenAIImageGenerator()) {
  return createWorkflow({
    id: 'banner',
    inputSchema: bannerInputSchema,
    outputSchema: bannerOutputSchema,
  })
    .then(createGenerateStep(generator))
    .then(overlayStep)
    .commit();
}

export const bannerWorkflow = buildBannerWorkflow();
