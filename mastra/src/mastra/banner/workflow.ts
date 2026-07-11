import { createStep, createWorkflow } from '@mastra/core/workflows';
import { createGenerateBannerTool, generateBannerInputSchema, generateBannerOutputSchema } from './tool';
import type { GenerateBannerToolDeps } from './tool';

/**
 * Studio-visible wrapper around the `generate-banner` tool, which is itself a thin wrapper
 * around the common banner process (the single control point for the generate/overlay gating and
 * input resolution). The process is not split into separate workflow steps here because doing
 * so would require duplicating that gating logic outside its one source of truth.
 */
export function createBannerWorkflow(deps: GenerateBannerToolDeps = {}) {
  const generateBannerStep = createStep(createGenerateBannerTool(deps));

  return createWorkflow({
    id: 'generate-banner-workflow',
    description: 'Runs the common generate-then-overlay banner process for a client.',
    inputSchema: generateBannerInputSchema,
    outputSchema: generateBannerOutputSchema,
  })
    .then(generateBannerStep)
    .commit();
}

export const bannerWorkflow = createBannerWorkflow();
