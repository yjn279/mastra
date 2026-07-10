import { describe, expect, it } from 'vitest';
import { bannerAgent } from './banner-agent';
import { generateBannerTool } from '../banner/tool';
import { mastra } from '../index';

describe('bannerAgent', () => {
  it('is configured with the generateBanner tool', async () => {
    const tools = await bannerAgent.listTools();
    expect(tools.generateBannerTool).toBe(generateBannerTool);
  });

  it('is wired to a memory system so conversations can be revised across turns', async () => {
    const memory = await bannerAgent.getMemory();
    expect(memory).toBeDefined();
  });

  it('describes what it does, for Studio and for agent-as-tool delegation', () => {
    expect(bannerAgent.id).toBe('banner-agent');
    expect(bannerAgent.name).toBe('Banner Agent');
    expect(typeof bannerAgent.getDescription()).toBe('string');
    expect(bannerAgent.getDescription().length).toBeGreaterThan(0);
  });

  it('is registered on the Mastra instance served by Studio', () => {
    expect(mastra.getAgent('bannerAgent')).toBe(bannerAgent);
  });
});
