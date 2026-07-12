import { defineClient } from './types';

/** Overlay only: brand copy is drawn on the supplied material image, or the brand background when none is given. */
export const verde = defineClient({
  id: 'verde',
  name: 'Verde Market',
  generate: false,
  overlay: true,
  brand: {
    width: 1080,
    height: 1080,
    background: '#1f3d2b',
    headline: {
      font: 'Noto Sans JP',
      size: 68,
      weight: 700,
      color: '#f4f1e8',
      lineHeight: 1.25,
      align: 'center',
      x: 90,
      y: 120,
      maxWidth: 900,
    },
    cta: {
      font: 'Noto Sans JP',
      size: 38,
      weight: 700,
      color: '#1f3d2b',
      background: '#e8c14a',
      radius: 40,
      paddingX: 44,
      paddingY: 22,
      x: 380,
      y: 900,
    },
  },
});
