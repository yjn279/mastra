import { defineLayout, type Layout } from './types';

/**
 * Horizontal product banner (1536×1024): product image on one side, copy on the
 * other. The side is chosen per instruction, not fixed — hence two mirror presets.
 */
const bannerImageLeft = defineLayout({
  name: 'banner-image-left',
  width: 1536,
  height: 1024,
  imageSize: '1024x1536',
  imageRegion: { x: 0, y: 0, width: 768, height: 1024 },
  copyRegion: { x: 840, y: 96, width: 616, height: 832 },
  align: 'left',
});

const bannerImageRight = defineLayout({
  name: 'banner-image-right',
  width: 1536,
  height: 1024,
  imageSize: '1024x1536',
  imageRegion: { x: 768, y: 0, width: 768, height: 1024 },
  copyRegion: { x: 80, y: 96, width: 616, height: 832 },
  align: 'left',
});

/** Square key visual (1024×1024): copy across the top, product image below. */
const kv = defineLayout({
  name: 'kv',
  width: 1024,
  height: 1024,
  imageSize: '1536x1024',
  imageRegion: { x: 0, y: 396, width: 1024, height: 628 },
  copyRegion: { x: 80, y: 72, width: 864, height: 300 },
  align: 'center',
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
