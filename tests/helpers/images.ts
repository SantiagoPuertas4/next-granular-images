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

/**
 * Photo-like RGB pixels (gradients plus grain, lightly blurred) so encoders
 * behave as on real photos instead of flat colour.
 */
export const photoPixels = (width = 600, height = 400): sharp.Sharp => {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = [
        (x / width) * 200 + 30 * Math.sin(y / 37),
        (y / height) * 180 + 40 * Math.cos(x / 53),
        120 + 60 * Math.sin((x + y) / 71),
      ];
      for (let c = 0; c < 3; c++) {
        pixels[(y * width + x) * 3 + c] = Math.max(0, Math.min(255, base[c] + (random() - 0.5) * 40));
      }
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).blur(0.8);
};

/**
 * Writes a photo-like image with `encode` applied. With `metadata`, it also
 * carries an EXIF GPS position, EXIF orientation 6 and a Display P3 ICC
 * profile.
 */
export const makePhoto = async (
  file: string,
  encode: (image: sharp.Sharp) => sharp.Sharp,
  { metadata = false } = {}
): Promise<string> => {
  ensureDir(file);
  let image = encode(photoPixels());
  if (metadata) {
    image = image
      .withExif({
        IFD0: { Artist: 'Tester' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 26/1 46/1' },
      })
      .withMetadata({ orientation: 6, icc: 'p3' });
  }
  await image.toFile(file);
  return file;
};

/**
 * Hand-built little-endian RGB TIFF (sharp's `withExif` writes no TIFF
 * tags) whose IFD0 carries Make="SECRETCAM", Artist="SECRETARTIST", a GPS
 * IFD pointer (tag 34853) with a latitude and, optionally, an orientation.
 * Stored pixels are 16x8.
 */
export const makeTaggedTiff = (file: string, { orientation }: { orientation?: number } = {}): string => {
  ensureDir(file);
  const width = 16;
  const height = 8;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) % 256;

  const make = Buffer.from('SECRETCAM\0', 'ascii');
  const artist = Buffer.from('SECRETARTIST\0', 'ascii');
  type Entry = [tag: number, type: number, count: number, value: number | Buffer];
  const SHORT = 3;
  const LONG = 4;
  const ASCII = 2;
  const RATIONAL = 5;
  const BYTE = 1;

  const ifd0: Entry[] = [
    [256, SHORT, 1, width],
    [257, SHORT, 1, height],
    [258, SHORT, 3, Buffer.from([8, 0, 8, 0, 8, 0])],
    [259, SHORT, 1, 1],
    [262, SHORT, 1, 2],
    [271, ASCII, make.length, make],
    [273, LONG, 1, 0], // strip offset, patched below
    ...(orientation ? [[274, SHORT, 1, orientation] as Entry] : []),
    [277, SHORT, 1, 3],
    [278, SHORT, 1, height],
    [279, LONG, 1, pixels.length],
    [284, SHORT, 1, 1],
    [315, ASCII, artist.length, artist],
    [34853, LONG, 1, 0], // GPS IFD offset, patched below
  ];
  const latitude = Buffer.alloc(24);
  [40, 1, 26, 1, 46, 1].forEach((v, i) => latitude.writeUInt32LE(v, i * 4));
  const gps: Entry[] = [
    [0, BYTE, 4, Buffer.from([2, 2, 0, 0])],
    [1, ASCII, 2, Buffer.from('N\0', 'ascii')],
    [2, RATIONAL, 3, latitude],
  ];

  const ifdSize = (entries: Entry[]) => 2 + entries.length * 12 + 4;
  const extraSize = (entries: Entry[]) =>
    entries.reduce((sum, [, , , v]) => sum + (Buffer.isBuffer(v) && v.length > 4 ? v.length + (v.length % 2) : 0), 0);
  const ifd0Offset = 8;
  const gpsOffset = ifd0Offset + ifdSize(ifd0) + extraSize(ifd0);
  const stripOffset = gpsOffset + ifdSize(gps) + extraSize(gps);
  const out = Buffer.alloc(stripOffset + pixels.length);
  out.write('II', 0, 'ascii');
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(ifd0Offset, 4);

  const writeIfd = (entries: Entry[], offset: number) => {
    let extra = offset + ifdSize(entries);
    out.writeUInt16LE(entries.length, offset);
    entries.forEach(([tag, type, count, value], i) => {
      const at = offset + 2 + i * 12;
      out.writeUInt16LE(tag, at);
      out.writeUInt16LE(type, at + 2);
      out.writeUInt32LE(count, at + 4);
      if (tag === 273) out.writeUInt32LE(stripOffset, at + 8);
      else if (tag === 34853) out.writeUInt32LE(gpsOffset, at + 8);
      else if (Buffer.isBuffer(value)) {
        if (value.length <= 4) value.copy(out, at + 8);
        else {
          out.writeUInt32LE(extra, at + 8);
          value.copy(out, extra);
          extra += value.length + (value.length % 2);
        }
      } else if (type === SHORT) out.writeUInt16LE(value, at + 8);
      else out.writeUInt32LE(value, at + 8);
    });
    out.writeUInt32LE(0, offset + ifdSize(entries) - 4);
  };
  writeIfd(ifd0, ifd0Offset);
  writeIfd(gps, gpsOffset);
  pixels.copy(out, stripOffset);
  fs.writeFileSync(file, out);
  return file;
};
