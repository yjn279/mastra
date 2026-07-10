import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import sharp, { type OverlayOptions } from 'sharp';
import type { BrandSpec, CtaStyle, Margin, Position, TextStyle } from '../brand/types';

export interface OverlayInput {
  copy: string;
  cta?: string;
  brand: BrandSpec;
}

const FONTS_DIR = fileURLToPath(new URL('../assets/fonts', import.meta.url));

// Isolates text rendering from whatever fonts happen to be installed on the host: fontconfig
// (bundled with sharp's libvips) is pointed at only our embedded font directory, so the same
// input always resolves to the same glyphs regardless of machine.
let fontconfigReady: Promise<void> | null = null;

function ensureFontconfig(): Promise<void> {
  if (!fontconfigReady) {
    fontconfigReady = (async () => {
      const cacheDir = path.join(os.tmpdir(), 'mastra-banner-fontconfig-cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const configPath = path.join(os.tmpdir(), 'mastra-banner-fonts.conf');
      const config = [
        '<?xml version="1.0"?>',
        '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
        '<fontconfig>',
        `  <dir>${FONTS_DIR}</dir>`,
        `  <cachedir>${cacheDir}</cachedir>`,
        '</fontconfig>',
        '',
      ].join('\n');
      fs.writeFileSync(configPath, config);
      process.env.FONTCONFIG_FILE = configPath;
    })();
  }
  return fontconfigReady;
}

function requireFile(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function estimateTextWidth(text: string, fontSize: number): number {
  const AVG_CHAR_WIDTH_RATIO = 0.6;
  return text.length * fontSize * AVG_CHAR_WIDTH_RATIO;
}

function horizontalAnchor(position: Position): 'start' | 'middle' | 'end' {
  if (position.endsWith('left')) return 'start';
  if (position.endsWith('right')) return 'end';
  return 'middle';
}

function anchorX(position: Position, margin: Margin, canvasWidth: number): number {
  if (position.endsWith('left')) return margin.left;
  if (position.endsWith('right')) return canvasWidth - margin.right;
  return canvasWidth / 2;
}

/** Top-left origin for a box of known size (CTA pill, logo) that must stay within the margin. */
function boxOrigin(
  position: Position,
  margin: Margin,
  canvasWidth: number,
  canvasHeight: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  const minX = margin.left;
  const maxX = Math.max(minX, canvasWidth - margin.right - boxWidth);
  const minY = margin.top;
  const maxY = Math.max(minY, canvasHeight - margin.bottom - boxHeight);

  let x: number;
  if (position.endsWith('left')) x = minX;
  else if (position.endsWith('right')) x = maxX;
  else x = (canvasWidth - boxWidth) / 2;

  let y: number;
  if (position.startsWith('top')) y = minY;
  else if (position.startsWith('bottom')) y = maxY;
  else y = (canvasHeight - boxHeight) / 2;

  return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lineHeightOf(style: TextStyle): number {
  return style.lineHeight ?? style.size * 1.2;
}

/** Baseline y-coordinates for each line of a (possibly multi-line) text block anchored per `position`. */
function baselinesFor(position: Position, margin: Margin, canvasHeight: number, style: TextStyle, lineCount: number): number[] {
  const lineHeight = lineHeightOf(style);
  const offsets = Array.from({ length: lineCount }, (_, i) => i * lineHeight);

  if (position.startsWith('top')) {
    const first = margin.top + style.size;
    return offsets.map((offset) => first + offset);
  }

  if (position.startsWith('bottom')) {
    const last = canvasHeight - margin.bottom;
    const first = last - offsets[offsets.length - 1];
    return offsets.map((offset) => first + offset);
  }

  const blockHeight = offsets[offsets.length - 1];
  const first = canvasHeight / 2 - blockHeight / 2 + style.size * 0.35;
  return offsets.map((offset) => first + offset);
}

function fontFace(style: TextStyle): { family: string; weight: number } {
  return { family: style.font.family, weight: style.font.weight ?? 400 };
}

function textElement(text: string, x: number, y: number, style: TextStyle): string {
  const anchor = horizontalAnchor(style.position);
  const { family, weight } = fontFace(style);
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${escapeXml(family)}" font-weight="${weight}" font-size="${style.size}" fill="${style.color}">${escapeXml(text)}</text>`;
}

function headlineSvgLayer(copy: string, brand: BrandSpec): string {
  const style = brand.headline;
  const x = anchorX(style.position, brand.margin, brand.canvasWidth);
  const lines = copy.split('\n');
  const baselines = baselinesFor(style.position, brand.margin, brand.canvasHeight, style, lines.length);
  return lines.map((line, i) => textElement(line, x, baselines[i], style)).join('\n');
}

interface CtaLayout {
  rect: { x: number; y: number; width: number; height: number };
  style: CtaStyle;
}

function ctaLayout(cta: string, style: CtaStyle, margin: Margin, canvasWidth: number, canvasHeight: number): CtaLayout {
  const width = estimateTextWidth(cta, style.size) + style.paddingX * 2;
  const height = style.size * 1.2 + style.paddingY * 2;
  const { x, y } = boxOrigin(style.position, margin, canvasWidth, canvasHeight, width, height);
  return { rect: { x, y, width, height }, style };
}

function ctaSvgLayer(cta: string, brand: BrandSpec): { svg: string; rect: CtaLayout['rect'] } {
  const { rect, style } = ctaLayout(cta, brand.cta, brand.margin, brand.canvasWidth, brand.canvasHeight);
  const rx = style.borderRadius ?? 0;
  const rectSvg = `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${rx}" fill="${style.backgroundColor}"/>`;
  const baselineY = rect.y + rect.height / 2 + style.size * 0.35;
  const textX = rect.x + rect.width / 2;
  const { family, weight } = fontFace(style);
  const textSvg = `<text x="${textX}" y="${baselineY}" text-anchor="middle" font-family="${escapeXml(family)}" font-weight="${weight}" font-size="${style.size}" fill="${style.color}">${escapeXml(cta)}</text>`;
  return { svg: `${rectSvg}\n${textSvg}`, rect };
}

function requireBrandFonts(brand: BrandSpec, includeCta: boolean): void {
  requireFile(brand.headline.font.filePath, 'Headline font');
  if (includeCta) {
    requireFile(brand.cta.font.filePath, 'CTA font');
  }
  if (brand.logo) {
    requireFile(brand.logo.filePath, 'Logo image');
  }
}

/**
 * Deterministically composites brand-compliant headline text, CTA, and logo onto a base image.
 * Same `base` + `input` always produce byte-identical output.
 */
export async function renderOverlay(base: Buffer, input: OverlayInput): Promise<Buffer> {
  const { brand, copy, cta } = input;
  const { canvasWidth: width, canvasHeight: height } = brand;

  requireBrandFonts(brand, Boolean(cta));
  await ensureFontconfig();

  const resizedBase = await sharp(base).resize(width, height, { fit: 'cover' }).png().toBuffer();

  const textLayers = [headlineSvgLayer(copy, brand)];
  if (cta) {
    textLayers.push(ctaSvgLayer(cta, brand).svg);
  }
  const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${textLayers.join('\n')}</svg>`;
  const textLayerPng = await sharp(Buffer.from(textSvg)).png().toBuffer();

  const composites: OverlayOptions[] = [{ input: textLayerPng, left: 0, top: 0 }];

  if (brand.logo) {
    const logoBuffer = await sharp(brand.logo.filePath).resize(brand.logo.width, brand.logo.height, { fit: 'contain' }).png().toBuffer();
    const { x, y } = boxOrigin(brand.logo.position, brand.margin, width, height, brand.logo.width, brand.logo.height);
    composites.push({ input: logoBuffer, left: Math.round(x), top: Math.round(y) });
  }

  return sharp(resizedBase).composite(composites).png().toBuffer();
}
