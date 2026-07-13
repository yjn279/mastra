import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { registerFonts } from './fonts';
import type { BrandSpec, CtaStyle, HeadlineStyle } from '../clients/types';
import type { Layout, Region } from '../layouts/types';

registerFonts();

const CJK = /[　-ヿ㐀-䶿一-鿿＀-￯]/;

/** Split a paragraph into unbreakable units: latin words, single CJK chars, spaces. */
function units(text: string): string[] {
  const out: string[] = [];
  let word = '';
  const flush = () => {
    if (word) {
      out.push(word);
      word = '';
    }
  };
  for (const ch of text) {
    if (ch === ' ') {
      flush();
      out.push(' ');
    } else if (CJK.test(ch)) {
      flush();
      out.push(ch);
    } else {
      word += ch;
    }
  }
  flush();
  return out;
}

/** Greedy word/character wrap. `measure` returns the rendered width of a string. */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const unit of units(para)) {
      const candidate = line + unit;
      if (line !== '' && unit !== ' ' && measure(candidate.trimEnd()) > maxWidth) {
        lines.push(line.trimEnd());
        line = unit;
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function font(style: { weight: number; size: number; font: string }): string {
  return `${style.weight} ${style.size}px "${style.font}"`;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KEPT_PNG_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);

/**
 * Drop non-essential PNG chunks. gpt-image-2 embeds a `caBX` (C2PA provenance)
 * chunk that @napi-rs/canvas cannot decode; keeping only the pixel-critical
 * chunks yields a PNG the renderer can load. Non-PNG buffers pass through.
 */
export function sanitizeImage(buf: Buffer): Buffer {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return buf;
  const chunks: Buffer[] = [buf.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (KEPT_PNG_CHUNKS.has(type)) chunks.push(buf.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw an image scaled to cover a region (center-cropped, clipped to the region). */
function drawImageCover(ctx: SKRSContext2D, img: Image, region: Region): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.width, region.height);
  ctx.clip();
  const scale = Math.max(region.width / img.width, region.height / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, region.x + (region.width - dw) / 2, region.y + (region.height - dh) / 2, dw, dh);
  ctx.restore();
}

/** The largest headline size within [minSize, maxSize] whose wrapped lines fit the region height. */
function fitHeadline(
  ctx: SKRSContext2D,
  style: HeadlineStyle,
  copy: string,
  region: Region,
): { size: number; lines: string[] } {
  for (let size = style.maxSize; size >= style.minSize; size -= 2) {
    ctx.font = font({ weight: style.weight, size, font: style.font });
    const lines = wrapText((s) => ctx.measureText(s).width, copy, region.width);
    if (lines.length * size * style.lineHeight <= region.height) return { size, lines };
  }
  ctx.font = font({ weight: style.weight, size: style.minSize, font: style.font });
  return { size: style.minSize, lines: wrapText((s) => ctx.measureText(s).width, copy, region.width) };
}

/** Draw the headline, auto-fit and vertically centered, aligned inside the region. */
function drawHeadline(ctx: SKRSContext2D, region: Region, align: Layout['align'], style: HeadlineStyle, copy: string): void {
  const { size, lines } = fitHeadline(ctx, style, copy, region);
  const blockH = lines.length * size * style.lineHeight;
  const anchorX = align === 'center' ? region.x + region.width / 2 : region.x;
  const top = region.y + Math.max(0, (region.height - blockH) / 2);
  ctx.font = font({ weight: style.weight, size, font: style.font });
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  lines.forEach((line, i) => ctx.fillText(line, anchorX, top + i * size * style.lineHeight));
}

/** Draw the CTA button, centered vertically and aligned inside the region. */
function drawCta(ctx: SKRSContext2D, region: Region, align: Layout['align'], style: CtaStyle, label: string): void {
  ctx.font = font(style);
  const boxW = ctx.measureText(label).width + style.paddingX * 2;
  const boxH = style.size + style.paddingY * 2;
  const boxX = align === 'center' ? region.x + (region.width - boxW) / 2 : region.x;
  const boxY = region.y + Math.max(0, (region.height - boxH) / 2);
  ctx.fillStyle = style.background;
  roundRectPath(ctx, boxX, boxY, boxW, boxH, style.radius);
  ctx.fill();
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, boxX + boxW / 2, boxY + boxH / 2);
}

export interface OverlayInput {
  /** Image that fills the whole canvas (generated or material), or null to leave the brand background. */
  base: Buffer | null;
  brand: BrandSpec;
  layout: Layout;
  copy?: string;
  cta?: string;
}

/**
 * Deterministically compose a banner: the image fills the canvas, and the copy
 * (and CTA, when the pattern uses one) is overlaid on the clean regions the
 * layout designates. The layout supplies all positioning, so every pattern uses
 * this path.
 */
export async function renderOverlay({ base, brand, layout, copy, cta }: OverlayInput): Promise<Buffer> {
  const canvas = createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = brand.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (base) {
    drawImageCover(ctx, await loadImage(sanitizeImage(base)), { x: 0, y: 0, width: layout.width, height: layout.height });
  }

  if (copy) drawHeadline(ctx, layout.copyRegion, layout.align, brand.headline, copy);
  if (cta && layout.ctaRegion) drawCta(ctx, layout.ctaRegion, layout.align, brand.cta, cta);

  return canvas.toBuffer('image/png');
}
