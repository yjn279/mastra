import { GlobalFonts } from '@napi-rs/canvas';
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

let done = false;

/**
 * Register fonts once. Bundles Noto Sans JP (OSS, full Latin + Japanese
 * coverage) as the default family, and any font file dropped into
 * `assets/fonts` under a family named after its file (drop `<Family>-Bold.ttf`
 * style files for a real brand font and reference the family by name).
 */
export function registerFonts(): void {
  if (done) return;
  done = true;

  const noto = dirname(require.resolve('@expo-google-fonts/noto-sans-jp'));
  GlobalFonts.registerFromPath(join(noto, '400Regular', 'NotoSansJP_400Regular.ttf'), 'Noto Sans JP');
  GlobalFonts.registerFromPath(join(noto, '700Bold', 'NotoSansJP_700Bold.ttf'), 'Noto Sans JP');

  const brandDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');
  for (const file of globSync(join(brandDir, '*.{ttf,otf,woff2,woff}'))) {
    const family = basename(file)
      .replace(/\.[^.]+$/, '')
      .replace(/[-_ ](Regular|Bold|Italic|Medium|Light|SemiBold|Semibold|Thin|Black|ExtraBold|\d{3}\w*)$/i, '');
    GlobalFonts.registerFromPath(file, family);
  }
}
