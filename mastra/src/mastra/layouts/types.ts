import { z } from 'zod';

/** A rectangle on the canvas (top-left origin). */
export const regionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

/**
 * Positioning for one banner pattern. The generated/material image fills the
 * whole canvas; the copy is overlaid on `copyRegion` (a clean area the model is
 * told to leave empty) and the CTA, when the pattern uses one, on `ctaRegion`.
 * Both banner patterns and the square KV are just different values here — the
 * renderer and the generation prompt read them the same way, no branching.
 */
export const layoutSchema = z.object({
  name: z.string(),
  /** Agent/tool-facing guidance: what the pattern is and when to pick it. */
  description: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** gpt-image-2 size for the full-canvas image (matches the canvas aspect). */
  imageSize: z.enum(['1024x1024', '1536x1024', '1024x1536']),
  /** Where the headline copy is overlaid. */
  copyRegion: regionSchema,
  /** Where the CTA button is overlaid; omit for patterns without a CTA. */
  ctaRegion: regionSchema.optional(),
  /** Horizontal alignment of the overlaid copy / CTA. */
  align: z.enum(['left', 'center']).default('left'),
  /** Generation guidance: where the product goes and which area to leave clean. */
  placement: z.string(),
});

export type Region = z.infer<typeof regionSchema>;
export type Layout = z.infer<typeof layoutSchema>;

export function defineLayout(layout: z.input<typeof layoutSchema>): Layout {
  return layoutSchema.parse(layout);
}
