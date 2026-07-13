import { defineLayout, type Layout } from './types';

/**
 * Horizontal product banner (1536×1024): product on one side of the image, copy
 * overlaid on the clean opposite side. No CTA. The side is chosen per
 * instruction, not fixed — hence two mirror presets.
 */
const bannerImageLeft = defineLayout({
  name: 'banner-image-left',
  width: 1536,
  height: 1024,
  imageSize: '1536x1024',
  copyRegion: { x: 848, y: 160, width: 576, height: 704 },
  align: 'left',
  placement: 'Compose the product on the LEFT side of the frame and keep the RIGHT side as clean, softly-lit empty space.',
});

const bannerImageRight = defineLayout({
  name: 'banner-image-right',
  width: 1536,
  height: 1024,
  imageSize: '1536x1024',
  copyRegion: { x: 112, y: 160, width: 576, height: 704 },
  align: 'left',
  placement: 'Compose the product on the RIGHT side of the frame and keep the LEFT side as clean, softly-lit empty space.',
});

/** Square key visual (1024×1024): copy overlaid on top, product in the middle, CTA overlaid below it. */
const kv = defineLayout({
  name: 'kv',
  width: 1024,
  height: 1024,
  imageSize: '1024x1024',
  copyRegion: { x: 80, y: 72, width: 864, height: 200 },
  ctaRegion: { x: 80, y: 860, width: 864, height: 104 },
  align: 'center',
  placement: 'Center the product in the frame and keep the TOP and BOTTOM as clean, softly-lit empty space.',
});

const registry: Record<string, Layout> = {
  [bannerImageLeft.name]: bannerImageLeft,
  [bannerImageRight.name]: bannerImageRight,
  [kv.name]: kv,
};

/** Resolve a layout by name, throwing if unknown. */
export function getLayout(name: string): Layout {
  const layout = registry[name];
  if (!layout) {
    throw new Error(`unknown layout "${name}". known layouts: ${Object.keys(registry).join(', ')}`);
  }
  return layout;
}

export function listLayouts(): Layout[] {
  return Object.values(registry);
}

export type { Layout, Region } from './types';
