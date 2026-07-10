export type Position =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BrandFont {
  family: string;
  filePath: string;
  weight?: number;
}

export interface TextStyle {
  font: BrandFont;
  size: number;
  color: string;
  position: Position;
  lineHeight?: number;
}

export interface CtaStyle extends TextStyle {
  backgroundColor: string;
  paddingX: number;
  paddingY: number;
  borderRadius?: number;
}

export interface LogoSpec {
  filePath: string;
  width: number;
  height: number;
  position: Position;
}

export interface BrandSpec {
  canvasWidth: number;
  canvasHeight: number;
  margin: Margin;
  backgroundColor: string;
  headline: TextStyle;
  cta: CtaStyle;
  logo?: LogoSpec;
}

export interface StageFlags {
  generate: boolean;
  overlay: boolean;
}

export interface ClientConfig {
  id: string;
  name: string;
  stages: StageFlags;
  brand: BrandSpec;
}

export interface BannerRequest {
  clientId: string;
  copy: string;
  cta?: string;
  referenceText?: string;
  materialImage?: Buffer;
}
