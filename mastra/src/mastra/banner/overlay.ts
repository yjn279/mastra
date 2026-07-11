import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import sharp, { type OverlayOptions } from 'sharp';
import { resolveAssetPath } from '../asset-path';
import type { BrandSpec, CtaStyle, Margin, Position, TextStyle } from '../brand/types';

export interface OverlayInput {
  copy: string;
  cta?: string;
  brand: BrandSpec;
}

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
        `  <dir>${resolveAssetPath('fonts')}</dir>`,
        `  <cachedir>${cacheDir}</cachedir>`,
        '</fontconfig>',
        '',
      ].join('\n');
      fs.writeFileSync(configPath, config);
      process.env.FONTCONFIG_FILE = configPath;
    })().catch((err) => {
      // Let a transient failure (e.g. a momentarily unwritable tmpdir) be retried on the next
      // render instead of permanently failing every future request in this process.
      fontconfigReady = null;
      throw err;
    });
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

/**
 * CJK/fullwidth glyphs render roughly square (~1em); Latin glyphs average narrower (~0.6em).
 * Astral-plane characters (emoji and rare CJK extensions, code points above 0xFFFF) also render
 * roughly square, so they're treated as full-width too.
 */
function isFullWidthChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    code > 0xffff ||
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK Radicals through Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function estimateTextWidth(text: string, fontSize: number): number {
  const NARROW_CHAR_WIDTH_RATIO = 0.6;
  const FULL_WIDTH_CHAR_WIDTH_RATIO = 1.0;
  let width = 0;
  for (const char of text) {
    width += fontSize * (isFullWidthChar(char) ? FULL_WIDTH_CHAR_WIDTH_RATIO : NARROW_CHAR_WIDTH_RATIO);
  }
  return width;
}

function horizontalAnchor(position: Position): 'start' | 'middle' | 'end' {
  if (position.endsWith('left')) return 'start';
  if (position.endsWith('right')) return 'end';
  return 'middle';
}

function verticalAnchor(position: Position): 'start' | 'middle' | 'end' {
  if (position.startsWith('top')) return 'start';
  if (position.startsWith('bottom')) return 'end';
  return 'middle';
}

/**
 * Top-left origin for a box of known size (CTA pill, logo), anchored to `position` and flush
 * with the margin on its anchored edge(s). A box wider/taller than the margin-constrained area
 * overflows away from its anchored edge rather than bleeding into the band on that edge.
 */
function boxOrigin(
  position: Position,
  margin: Margin,
  canvasWidth: number,
  canvasHeight: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  const minX = margin.left;
  const flushRightX = canvasWidth - margin.right - boxWidth;
  const minY = margin.top;
  const flushBottomY = canvasHeight - margin.bottom - boxHeight;

  // min/max are swapped via Math.min/Math.max below because a box wider/taller than the
  // margin-constrained area makes flushRightX/flushBottomY fall below minX/minY, which would
  // otherwise invert the clamp range.
  let x: number;
  const hAnchor = horizontalAnchor(position);
  if (hAnchor === 'start') x = minX;
  else if (hAnchor === 'end') x = flushRightX;
  else x = clamp((canvasWidth - boxWidth) / 2, Math.min(minX, flushRightX), Math.max(minX, flushRightX));

  let y: number;
  const vAnchor = verticalAnchor(position);
  if (vAnchor === 'start') y = minY;
  else if (vAnchor === 'end') y = flushBottomY;
  else y = clamp((canvasHeight - boxHeight) / 2, Math.min(minY, flushBottomY), Math.max(minY, flushBottomY));

  return { x, y };
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

  if (verticalAnchor(position) === 'start') {
    const first = margin.top + style.size;
    return offsets.map((offset) => first + offset);
  }

  if (verticalAnchor(position) === 'end') {
    // Descenders (e.g. 'g', 'y', 'p') extend below the baseline, so the last line's baseline
    // needs headroom above the margin, not flush with it, to keep them out of the margin band.
    const last = canvasHeight - margin.bottom - style.size * 0.25;
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
  const { x } = boxOrigin(style.position, brand.margin, brand.canvasWidth, brand.canvasHeight, 0, 0);
  const lines = copy.split('\n');
  const baselines = baselinesFor(style.position, brand.margin, brand.canvasHeight, style, lines.length);
  return lines.map((line, i) => textElement(line, x, baselines[i], style)).join('\n');
}

interface CtaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function ctaLayout(cta: string, style: CtaStyle, margin: Margin, canvasWidth: number, canvasHeight: number): CtaRect {
  const width = estimateTextWidth(cta, style.size) + style.paddingX * 2;
  const height = style.size * 1.2 + style.paddingY * 2;
  const { x, y } = boxOrigin(style.position, margin, canvasWidth, canvasHeight, width, height);
  return { x, y, width, height };
}

function ctaSvgLayer(cta: string, brand: BrandSpec): { svg: string; rect: CtaRect } {
  const style = brand.cta;
  const rect = ctaLayout(cta, style, brand.margin, brand.canvasWidth, brand.canvasHeight);
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

  const textLayers = [headlineSvgLayer(copy, brand)];
  if (cta) {
    textLayers.push(ctaSvgLayer(cta, brand).svg);
  }
  const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${textLayers.join('\n')}</svg>`;

  const composites: OverlayOptions[] = [{ input: Buffer.from(textSvg), left: 0, top: 0 }];

  if (brand.logo) {
    const logoBuffer = await sharp(brand.logo.filePath).resize(brand.logo.width, brand.logo.height, { fit: 'contain' }).png().toBuffer();
    const { x, y } = boxOrigin(brand.logo.position, brand.margin, width, height, brand.logo.width, brand.logo.height);
    composites.push({ input: logoBuffer, left: Math.round(x), top: Math.round(y) });
  }

  return sharp(base).resize(width, height, { fit: 'cover' }).composite(composites).png().toBuffer();
}
