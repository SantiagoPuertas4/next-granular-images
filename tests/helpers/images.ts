import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { GranularImagesConfig } from '../../src/types/config';
import { validateConfig } from '../../src/cli/core/validate';

/** The fast config every pipeline/CLI test uses. */
export const FAST_CONFIG = {
  qualities: { avif: 30, webp: 50 },
  effort: { avif: 1, webp: 1 },
  deviceSizes: [100, 200, 400],
  imageSizes: [16, 32],
} as const;

export const fastConfig = (overrides: Partial<GranularImagesConfig> = {}): GranularImagesConfig =>
  validateConfig({ ...structuredClone(FAST_CONFIG), ...overrides } as Partial<GranularImagesConfig>);

const ensureDir = (file: string) => fs.mkdirSync(path.dirname(file), { recursive: true });

const solid = (width: number, height: number, background: sharp.Color, channels: 3 | 4 = 3) =>
  sharp({ create: { width, height, channels, background } });

/** 800x400 RGB JPEG, colour (200,30,30) unless overridden. */
export const makeJpeg = async (
  file: string,
  { width = 800, height = 400, color = { r: 200, g: 30, b: 30 } } = {}
): Promise<string> => {
  ensureDir(file);
  await solid(width, height, color).jpeg().toFile(file);
  return file;
};

/**
 * 40x20 stored pixels with an EXIF orientation (default 6, which displays as
 * 20x40).
 */
export const makeRotatedJpeg = async (file: string, orientation = 6): Promise<string> => {
  ensureDir(file);
  await solid(40, 20, { r: 10, g: 120, b: 10 }).jpeg().withMetadata({ orientation }).toFile(file);
  return file;
};

/**
 * 40x20 stored pixels, EXIF orientation 6 (displays as 20x40), an EXIF GPS
 * position and a Display P3 ICC profile.
 */
export const makeGpsJpeg = async (file: string): Promise<string> => {
  ensureDir(file);
  await solid(40, 20, { r: 10, g: 120, b: 10 })
    .jpeg()
    .withExif({
      IFD0: { Artist: 'Tester' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 26/1 46/1' },
    })
    .withMetadata({ orientation: 6, icc: 'p3' })
    .toFile(file);
  return file;
};

/** True when an EXIF block contains the GPS IFD pointer (tag 0x8825). */
export const hasGpsTag = (exif: Buffer | undefined): boolean =>
  !!exif && (exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88])));

/** 64x64 RGBA PNG with 50 % alpha. */
export const makeAlphaPng = async (file: string): Promise<string> => {
  ensureDir(file);
  await solid(64, 64, { r: 0, g: 0, b: 255, alpha: 0.5 }, 4).png().toFile(file);
  return file;
};

/** 32x32 GIF. */
export const makeGif = async (file: string): Promise<string> => {
  ensureDir(file);
  await solid(32, 32, { r: 255, g: 200, b: 0 }).gif().toFile(file);
  return file;
};

/** 150x75 PNG. */
export const makeSmallPng = async (file: string): Promise<string> => {
  ensureDir(file);
  await solid(150, 75, { r: 30, g: 30, b: 200 }).png().toFile(file);
  return file;
};

/** A `.png` that is really text. */
export const makeBadPng = (file: string): string => {
  ensureDir(file);
  fs.writeFileSync(file, 'this is not an image');
  return file;
};
