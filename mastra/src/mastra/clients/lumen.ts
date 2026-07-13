import { defineClient } from './types';

/** Generate only: the model output ships as-is (no deterministic overlay). */
export const lumen = defineClient({
  id: 'lumen',
  name: 'Lumen Coffee',
  generate: true,
  overlay: false,
  generation: {
    guidance:
      'Warm, moody hero photograph of a specialty coffee cup on a wooden table, cinematic lighting, rich browns, editorial style.',
  },
  brand: {
    background: '#2a1c14',
    headline: {
      font: 'Noto Sans JP',
      color: '#f5ede2',
      weight: 700,
      maxSize: 72,
      minSize: 36,
      lineHeight: 1.2,
    },
    cta: {
      font: 'Noto Sans JP',
      size: 36,
      weight: 700,
      color: '#2a1c14',
      background: '#e0b877',
      radius: 12,
      paddingX: 40,
      paddingY: 20,
    },
  },
});
