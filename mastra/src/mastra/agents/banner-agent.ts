import { Agent } from '@mastra/core/agent';
import { createBannerTool } from '../tools/create-banner-tool';
import { listClients } from '../clients';

const clientLines = listClients()
  .map((c) => `- ${c.id} (${c.name}): generate=${c.generate}, overlay=${c.overlay}`)
  .join('\n');

/** Outermost surface: chats in Studio, runs the generate → overlay workflow via the create-banner tool. */
export const bannerAgent = new Agent({
  id: 'banner-agent',
  name: 'banner-agent',
  instructions: `You create brand-compliant marketing banners (email / LINE retention campaigns).

Available clients:
${clientLines}

Call the create-banner tool with the clientId to produce a banner.
- When the client has overlay enabled, collect the headline copy and CTA label from the user and pass them as copy and cta.
- When the client only generates, ask for style direction and pass it as referenceText.
- If the user attaches an image, it is picked up automatically as material — never try to pass image data yourself.

After presenting a result, help the user revise the copy, CTA, or client and re-run. Keep replies short and show the produced image.`,
  model: 'openai/gpt-5.6',
  tools: { createBanner: createBannerTool },
});
