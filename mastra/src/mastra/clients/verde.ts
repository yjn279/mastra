import { defineClient } from './types';

/** Overlay only: brand copy is composed with the supplied material image, or the brand background when none is given. */
export const verde = defineClient({
  id: 'verde',
  name: 'Verde Market',
  generate: false,
  overlay: true,
  brand: {
    background: '#1f3d2b',
    headline: {
      font: 'Noto Sans JP',
      color: '#f4f1e8',
      weight: 700,
      maxSize: 96,
      minSize: 40,
      lineHeight: 1.25,
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
    },
  },
});
