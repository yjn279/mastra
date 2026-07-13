import { z } from 'zod';

/** A rectangle on the canvas (top-left origin). */
export const regionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

/**
 * Positioning for one banner pattern. The product image fills `imageRegion`;
 * the copy and CTA are placed inside `copyRegion`. Both banner patterns and the
 * square KV are just different values here — the renderer reads them the same way.
 */
export const layoutSchema = z.object({
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** gpt-image-2 size for the product shot that fills the image region. */
  imageSize: z.enum(['1024x1024', '1536x1024', '1024x1536']),
  imageRegion: regionSchema,
  copyRegion: regionSchema,
  /** Horizontal alignment of the copy/CTA block within the copy region. */
  align: z.enum(['left', 'center']).default('left'),
});

export type Region = z.infer<typeof regionSchema>;
export type Layout = z.infer<typeof layoutSchema>;

export function defineLayout(layout: z.input<typeof layoutSchema>): Layout {
  return layoutSchema.parse(layout);
}
