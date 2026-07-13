import { describe, it, expect } from 'vitest';
import { getClient, listClients } from '../src/mastra/clients';
import { defineClient } from '../src/mastra/clients/types';
import { getLayout } from '../src/mastra/layouts';
import { buildPrompt } from '../src/mastra/steps/generate-step';

const minimalBrand = {
  background: '#000000',
  headline: { font: 'Noto Sans JP', color: '#ffffff', maxSize: 48 },
  cta: { font: 'Noto Sans JP', size: 24, color: '#ffffff', background: '#ffffff' },
} as const;

const bannerLeft = getLayout('banner-image-left');

describe('client registry', () => {
  it('seeds the three run modes', () => {
    const modes = listClients().map((c) => [c.id, c.generate, c.overlay]);
    expect(modes).toEqual(
      expect.arrayContaining([
        ['aurora', true, true], // generate + overlay
        ['lumen', true, false], // generate only
        ['verde', false, true], // overlay only
      ]),
    );
  });

  it('resolves a known client', () => {
    expect(getClient('aurora').name).toBe('Aurora Skincare');
  });

  it('throws on an unknown client', () => {
    expect(() => getClient('missing')).toThrow(/unknown client/);
  });
});

describe('client config validation', () => {
  it('rejects a client with both stages off', () => {
    expect(() =>
      defineClient({ id: 'x', name: 'X', generate: false, overlay: false, brand: minimalBrand }),
    ).toThrow(/at least one of generate/);
  });

  it('applies schema defaults', () => {
    const c = defineClient({ id: 'x', name: 'X', generate: true, overlay: false, brand: minimalBrand });
    expect(c.brand.headline.weight).toBe(700);
    expect(c.brand.headline.minSize).toBe(24);
    expect(c.brand.cta.radius).toBe(0);
  });
});

describe('buildPrompt', () => {
  it('always forbids the model from drawing text', () => {
    expect(buildPrompt(getClient('aurora'), bannerLeft)).toMatch(/Do not render any text/i);
    expect(buildPrompt(getClient('lumen'), bannerLeft)).toMatch(/Do not render any text/i);
  });

  it('reserves clean space via the layout placement when the client overlays', () => {
    expect(buildPrompt(getClient('aurora'), bannerLeft)).toMatch(/LEFT/);
  });

  it('asks for a full-frame shot (no reserved space) when the client only generates', () => {
    const prompt = buildPrompt(getClient('lumen'), bannerLeft);
    expect(prompt).toMatch(/fills the frame/i);
    expect(prompt).not.toMatch(/LEFT/);
  });

  it('includes reference text when provided', () => {
    expect(buildPrompt(getClient('lumen'), bannerLeft, 'autumn campaign')).toMatch(/autumn campaign/);
  });
});
