import path from 'path';
import { describe, expect, it } from 'vitest';
import { isProcessableImage } from '../../src/cli/core/files';
import { validateConfig } from '../../src/cli/core/validate';

const root = path.resolve('project');
const outputDir = path.join(root, 'public', 'next-granular-images');
const { exclusions } = validateConfig({ qualities: { webp: 80 }, effort: { webp: 4 } });
const inPublic = (file: string) => path.join(root, 'public', file);

describe('isProcessableImage', () => {
  it.each(['a.png', 'a.jpg', 'a.jpeg', 'a.tiff', 'a.gif'])('U27 accepts raster source %s', (file) => {
    expect(isProcessableImage(inPublic(file), { outputDir, exclusions })).toBe(true);
  });

  it.each(['a.svg', 'a.webp', 'a.avif', 'favicon.ico', 'notes.txt'])(
    'U27 skips %s with the default exclusions',
    (file) => {
      expect(isProcessableImage(inPublic(file), { outputDir, exclusions })).toBe(false);
    }
  );

  it('U30 supports suffix exclusions', () => {
    const opts = { outputDir, exclusions: ['.min.png'] };
    expect(isProcessableImage(inPublic('a.min.png'), opts)).toBe(false);
    expect(isProcessableImage(inPublic('a.png'), opts)).toBe(true);
  });

  it('skips files inside the output directory', () => {
    expect(
      isProcessableImage(path.join(outputDir, 'a', 'x.png'), { outputDir, exclusions })
    ).toBe(false);
  });

  it('U28 matches extensions and exclusions case-insensitively (#6)', () => {
    expect(isProcessableImage(inPublic('HERO.PNG'), { outputDir, exclusions })).toBe(true);
    expect(isProcessableImage(inPublic('LOGO.SVG'), { outputDir, exclusions })).toBe(false);
    expect(isProcessableImage(inPublic('logo.svg'), { outputDir, exclusions: ['.SVG'] })).toBe(
      false
    );
  });

  it('U29 only skips the output directory itself, not siblings sharing its prefix (#11)', () => {
    const sibling = path.join(root, 'public', 'next-granular-images-old', 'x.png');
    expect(isProcessableImage(sibling, { outputDir, exclusions })).toBe(true);
    expect(isProcessableImage(path.join(outputDir, 'x.png'), { outputDir, exclusions })).toBe(
      false
    );
  });

  it('U31 does not pick up .heic, which prebuilt sharp cannot decode (#6)', () => {
    expect(isProcessableImage(inPublic('photo.heic'), { outputDir, exclusions })).toBe(false);
  });
});
