import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { registerFonts } from './fonts';
import type { BrandSpec, CtaStyle, TextStyle } from '../clients/types';

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

/** Draw an image scaled to cover the whole canvas (center-cropped). */
function drawCover(ctx: SKRSContext2D, img: Awaited<ReturnType<typeof loadImage>>, w: number, h: number): void {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
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

function drawHeadline(ctx: SKRSContext2D, style: TextStyle, copy: string): void {
  ctx.font = font(style);
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = style.align;
  const anchorX =
    style.align === 'left' ? style.x : style.align === 'center' ? style.x + style.maxWidth / 2 : style.x + style.maxWidth;
  const lines = wrapText((s) => ctx.measureText(s).width, copy, style.maxWidth);
  const step = style.size * style.lineHeight;
  lines.forEach((line, i) => ctx.fillText(line, anchorX, style.y + i * step));
}

function drawCta(ctx: SKRSContext2D, style: CtaStyle, label: string): void {
  ctx.font = font(style);
  const textWidth = ctx.measureText(label).width;
  const boxW = textWidth + style.paddingX * 2;
  const boxH = style.size + style.paddingY * 2;
  ctx.fillStyle = style.background;
  roundRectPath(ctx, style.x, style.y, boxW, boxH, style.radius);
  ctx.fill();
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, style.x + boxW / 2, style.y + boxH / 2);
}

export interface OverlayInput {
  /** Base image to draw under the text, or null to use the brand background. */
  base: Buffer | null;
  brand: BrandSpec;
  copy?: string;
  cta?: string;
}

/** Deterministically composite brand copy, CTA and logo onto a base image. */
export async function renderOverlay({ base, brand, copy, cta }: OverlayInput): Promise<Buffer> {
  const canvas = createCanvas(brand.width, brand.height);
  const ctx = canvas.getContext('2d');

  if (base) {
    drawCover(ctx, await loadImage(sanitizeImage(base)), brand.width, brand.height);
  } else {
    ctx.fillStyle = brand.background;
    ctx.fillRect(0, 0, brand.width, brand.height);
  }

  if (brand.logo) {
    const logo = await loadImage(brand.logo.path);
    const height = logo.height * (brand.logo.width / logo.width);
    ctx.drawImage(logo, brand.logo.x, brand.logo.y, brand.logo.width, height);
  }

  if (copy) drawHeadline(ctx, brand.headline, copy);
  if (cta) drawCta(ctx, brand.cta, cta);

  return canvas.toBuffer('image/png');
}
