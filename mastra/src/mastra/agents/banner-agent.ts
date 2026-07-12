import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
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

Be decisive: as soon as you know the clientId (and, for overlay clients, the copy and cta), call the create-banner tool immediately. Ask at most one short clarifying question, and only for a value that is genuinely missing from the whole conversation. Never re-ask for a value the user already gave in an earlier turn.

- overlay clients (aurora, verde) need copy and cta.
- generate-only clients (lumen) take optional style direction as referenceText.
- If the user attaches an image, it is picked up automatically as material — never try to pass image data yourself.

The tool returns an imageUrl. Always present the produced banner by outputting it as a markdown image on its own line, exactly: ![banner](IMAGE_URL) — substituting the returned imageUrl.

On a follow-up revision, carry over the client, copy and cta from the most recent banner in this conversation, apply only the change the user asked for, and call the tool again immediately without asking anything. Keep replies short.`,
  model: 'openai/gpt-5-mini',
  memory: new Memory({ options: { lastMessages: 20 } }),
  tools: { createBanner: createBannerTool },
});
