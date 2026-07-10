import { describe, expect, it } from 'vitest';
import { clients, resolveClient } from './clients';

describe('resolveClient', () => {
  it('resolves every registered client by id', () => {
    for (const client of clients) {
      expect(resolveClient(client.id)).toBe(client);
    }
  });

  it('throws for an unknown client id', () => {
    expect(() => resolveClient('unknown-client')).toThrow('Unknown client id: unknown-client');
  });

  it('registers a generate-only client', () => {
    const client = resolveClient('sample-generate-only');
    expect(client.stages).toEqual({ generate: true, overlay: false });
  });

  it('registers a generate-and-overlay client', () => {
    const client = resolveClient('sample-generate-overlay');
    expect(client.stages).toEqual({ generate: true, overlay: true });
  });

  it('registers an overlay-only client', () => {
    const client = resolveClient('sample-overlay-only');
    expect(client.stages).toEqual({ generate: false, overlay: true });
  });

  it('defines a complete brand spec for each client', () => {
    for (const client of clients) {
      const { brand } = client;
      expect(brand.canvasWidth).toBeGreaterThan(0);
      expect(brand.canvasHeight).toBeGreaterThan(0);
      expect(brand.headline.font.filePath).toBeTruthy();
      expect(brand.cta.font.filePath).toBeTruthy();
      expect(brand.cta.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
