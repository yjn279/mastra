import { z } from 'zod';

/** Hex color, `#rrggbb` or `#rrggbbaa`. */
const hex = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected #rrggbb(aa) hex color');

/** Headline styling. Position and size are resolved from the layout's copy region (auto-fit). */
export const headlineStyleSchema = z.object({
  font: z.string(),
  color: hex,
  weight: z.number().default(700),
  /** Upper bound for the auto-fit font size. */
  maxSize: z.number().positive(),
  /** Lower bound for the auto-fit font size. */
  minSize: z.number().positive().default(24),
  lineHeight: z.number().positive().default(1.2),
});

/** CTA button styling. The box grows to fit its label and is placed by the layout. */
export const ctaStyleSchema = z.object({
  font: z.string(),
  size: z.number().positive(),
  weight: z.number().default(700),
  color: hex,
  background: hex,
  radius: z.number().nonnegative().default(0),
  paddingX: z.number().nonnegative().default(32),
  paddingY: z.number().nonnegative().default(18),
});

export const logoSchema = z.object({
  path: z.string(),
  width: z.number().positive(),
});

/** Brand look: colors, fonts, sizes, CTA style, logo. No positioning — that is the layout's job. */
export const brandSpecSchema = z.object({
  /** Fill for the whole canvas; the copy region sits on this, so it must contrast the headline color. */
  background: hex,
  headline: headlineStyleSchema,
  cta: ctaStyleSchema,
  logo: logoSchema.optional(),
});

export const generationSchema = z.object({
  /** Style hints handed to the model (never text content, never composition — the layout owns that). */
  guidance: z.string().default(''),
});

/** A client's configuration: the two on/off flags plus the brand look. */
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

export type HeadlineStyle = z.infer<typeof headlineStyleSchema>;
export type CtaStyle = z.infer<typeof ctaStyleSchema>;
export type Logo = z.infer<typeof logoSchema>;
export type BrandSpec = z.infer<typeof brandSpecSchema>;
export type ClientConfig = z.infer<typeof clientConfigSchema>;

/** Validate and normalize a raw client config (applies schema defaults). */
export function defineClient(config: z.input<typeof clientConfigSchema>): ClientConfig {
  return clientConfigSchema.parse(config);
}
