import { defineClient } from './types';

/** Generate + overlay: model paints a product shot, brand copy is composed beside/above it per layout. */
export const aurora = defineClient({
  id: 'aurora',
  name: 'Aurora Skincare',
  generate: true,
  overlay: true,
  generation: {
    guidance:
      'Soft, luminous skincare product photography on a pastel gradient backdrop, airy and premium, subtle cherry blossoms.',
  },
  brand: {
    background: '#f3e9e1',
    headline: {
      font: 'Noto Sans JP',
      color: '#2b2b2b',
      weight: 700,
      maxSize: 100,
      minSize: 44,
      lineHeight: 1.25,
    },
    cta: {
      font: 'Noto Sans JP',
      size: 40,
      weight: 700,
      color: '#ffffff',
      background: '#c98a6a',
      radius: 48,
      paddingX: 48,
      paddingY: 24,
    },
  },
});
