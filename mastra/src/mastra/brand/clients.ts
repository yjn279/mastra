import { resolveAssetPath } from '../asset-path';
import type { BrandSpec, ClientConfig } from './types';

const defaultFont = {
  family: 'Noto Sans JP',
  filePath: resolveAssetPath('fonts/NotoSansJP-Bold.otf'),
};

function brandSpec(overrides: Partial<BrandSpec> = {}): BrandSpec {
  return {
    canvasWidth: 1080,
    canvasHeight: 1080,
    margin: { top: 64, right: 64, bottom: 64, left: 64 },
    backgroundColor: '#FFFFFF',
    headline: {
      font: defaultFont,
      size: 56,
      color: '#111111',
      position: 'top-left',
    },
    cta: {
      font: defaultFont,
      size: 32,
      color: '#FFFFFF',
      backgroundColor: '#111111',
      position: 'bottom-center',
      paddingX: 32,
      paddingY: 16,
      borderRadius: 8,
    },
    ...overrides,
  };
}

const clientRegistry: Record<string, ClientConfig> = {
  'sample-generate-only': {
    id: 'sample-generate-only',
    name: 'Sample Client (generate only)',
    stages: { generate: true, overlay: false },
    brand: brandSpec({ backgroundColor: '#F5F5F0' }),
  },
  'sample-generate-overlay': {
    id: 'sample-generate-overlay',
    name: 'Sample Client (generate + overlay)',
    stages: { generate: true, overlay: true },
    brand: brandSpec({
      backgroundColor: '#0B1E3F',
      logo: {
        filePath: resolveAssetPath('logos/sample-generate-overlay.png'),
        width: 160,
        height: 48,
        position: 'top-right',
      },
    }),
  },
  'sample-overlay-only': {
    id: 'sample-overlay-only',
    name: 'Sample Client (overlay only)',
    stages: { generate: false, overlay: true },
    brand: brandSpec({
      backgroundColor: '#FCEFE3',
      logo: {
        filePath: resolveAssetPath('logos/sample-overlay-only.png'),
        width: 120,
        height: 40,
        position: 'bottom-left',
      },
    }),
  },
};

export const clients: ClientConfig[] = Object.values(clientRegistry);

export function resolveClient(id: string): ClientConfig {
  const config = clientRegistry[id];
  if (!config) {
    throw new Error(`Unknown client id: ${id}`);
  }
  return config;
}
