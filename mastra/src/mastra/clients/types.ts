import { z } from 'zod';

/** Hex color, `#rrggbb` or `#rrggbbaa`. */
const hex = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected #rrggbb(aa) hex color');

const align = z.enum(['left', 'center', 'right']);

/** Headline / copy text style and layout box (top-left origin). */
export const textStyleSchema = z.object({
  font: z.string(),
  size: z.number().positive(),
  weight: z.number().default(400),
  color: hex,
  lineHeight: z.number().positive().default(1.2),
  align: align.default('left'),
  x: z.number(),
  y: z.number(),
  maxWidth: z.number().positive(),
});

/** CTA button style; the box grows to fit its label from (x, y). */
export const ctaStyleSchema = z.object({
  font: z.string(),
  size: z.number().positive(),
  weight: z.number().default(700),
  color: hex,
  background: hex,
  radius: z.number().nonnegative().default(0),
  paddingX: z.number().nonnegative().default(24),
  paddingY: z.number().nonnegative().default(12),
  x: z.number(),
  y: z.number(),
});

export const logoSchema = z.object({
  path: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
});

/** Brand drawing specification used by the overlay step. */
export const brandSpecSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  /** Fallback background when there is no material or generated image. */
  background: hex,
  headline: textStyleSchema,
  cta: ctaStyleSchema,
  logo: logoSchema.optional(),
});

export const generationSchema = z.object({
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1024x1024'),
  /** Style hints handed to the model (never text content). */
  guidance: z.string().default(''),
});

/** A client's full configuration: the two on/off flags plus the brand spec. */
export const clientConfigSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    generate: z.boolean(),
    overlay: z.boolean(),
    generation: generationSchema.optional(),
    brand: brandSpecSchema,
  })
  .refine((c) => c.generate || c.overlay, {
    message: 'client must enable at least one of generate / overlay',
  });

export type TextStyle = z.infer<typeof textStyleSchema>;
export type CtaStyle = z.infer<typeof ctaStyleSchema>;
export type Logo = z.infer<typeof logoSchema>;
export type BrandSpec = z.infer<typeof brandSpecSchema>;
export type ClientConfig = z.infer<typeof clientConfigSchema>;

/** Validate and normalize a raw client config (applies schema defaults). */
export function defineClient(config: z.input<typeof clientConfigSchema>): ClientConfig {
  return clientConfigSchema.parse(config);
}
