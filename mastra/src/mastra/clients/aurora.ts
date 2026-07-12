import { defineClient } from './types';

/** Generate + overlay: model paints a text-free background, brand copy is composited on top. */
export const aurora = defineClient({
  id: 'aurora',
  name: 'Aurora Skincare',
  generate: true,
  overlay: true,
  generation: {
    size: '1024x1024',
    guidance:
      'Soft, luminous skincare product photography on a pastel gradient background, airy and premium, generous empty space in the lower third.',
  },
  brand: {
    width: 1024,
    height: 1024,
    background: '#f3e9e1',
    headline: {
      font: 'Noto Sans JP',
      size: 72,
      weight: 700,
      color: '#2b2b2b',
      lineHeight: 1.25,
      align: 'left',
      x: 80,
      y: 700,
      maxWidth: 720,
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
      x: 80,
      y: 900,
    },
  },
});
