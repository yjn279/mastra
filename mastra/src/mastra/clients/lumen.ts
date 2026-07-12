import { defineClient } from './types';

/** Generate only: the model output ships as-is (no deterministic overlay). */
export const lumen = defineClient({
  id: 'lumen',
  name: 'Lumen Coffee',
  generate: true,
  overlay: false,
  generation: {
    size: '1536x1024',
    guidance:
      'Warm, moody hero photograph of a specialty coffee cup on a wooden table, cinematic lighting, rich browns, editorial style.',
  },
  brand: {
    width: 1536,
    height: 1024,
    background: '#2a1c14',
    headline: {
      font: 'Noto Sans JP',
      size: 64,
      weight: 700,
      color: '#f5ede2',
      lineHeight: 1.2,
      align: 'left',
      x: 96,
      y: 96,
      maxWidth: 900,
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
      x: 96,
      y: 860,
    },
  },
});
