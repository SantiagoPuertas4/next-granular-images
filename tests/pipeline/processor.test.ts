import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { processImage } from '../../src/cli/core/processor';
import { initializeQueue } from '../../src/cli/core/queue';
import { makeTempDir } from '../helpers/tmp';
import {
  fastConfig,
  makeAlphaPng,
  makeBadPng,
  hasGpsTag,
  makeGif,
  makeGpsJpeg,
  makeJpeg,
  makePhoto,
  makeRotatedJpeg,
  makeSmallPng,
  makeTaggedTiff,
} from '../helpers/images';

const HASH = 'aaaaaaaa-bbbbbbbb';
const ALL_WIDTHS = ['16', '32', '100', '200', '400'];

let dir: string;
let out: string;

beforeEach(() => {
  dir = makeTempDir();
  out = path.join(dir, 'out');
  initializeQueue(fastConfig());
});

// Read through a buffer: sharp keeps path inputs open, which blocks deleting
// the temp dir on Windows.
const metadataOf = (file: string) => sharp(fs.readFileSync(file)).metadata();

const widthsOf = (variants: Record<number, string>) => Object.keys(variants);

describe('processImage', () => {
  it('P1 writes one WebP per target width, each with that width', async () => {
    const src = await makeJpeg(path.join(dir, 'red.jpg'));
    const result = await processImage(src, out, HASH, fastConfig());

    expect(widthsOf(result.variants.webp)).toEqual(ALL_WIDTHS);
    for (const [width, file] of Object.entries(result.variants.webp)) {
      const meta = await metadataOf(file);
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(Number(width));
    }
  });

  it('P2 writes AV1-compressed AVIF variants at the same widths', async () => {
    const src = await makeJpeg(path.join(dir, 'red.jpg'));
    const result = await processImage(src, out, HASH, fastConfig());

    expect(widthsOf(result.variants.avif)).toEqual(ALL_WIDTHS);
    for (const [width, file] of Object.entries(result.variants.avif)) {
      const meta = await metadataOf(file);
      expect(meta.format).toBe('heif');
      expect(meta.compression).toBe('av1');
      expect(meta.width).toBe(Number(width));
    }
  });

  it('P3 never upscales a source narrower than the largest size', async () => {
    const src = await makeSmallPng(path.join(dir, 'small.png'));
    const result = await processImage(src, out, HASH, fastConfig());
    expect(widthsOf(result.variants.webp)).toEqual(['16', '32', '100']);
    expect(widthsOf(result.variants.avif)).toEqual(['16', '32', '100']);
  });

  it('P4 writes the original in its own format and size', async () => {
    const src = await makeJpeg(path.join(dir, 'red.jpg'));
    const result = await processImage(src, out, HASH, fastConfig());
    expect(path.basename(result.variants.original)).toBe(`red-${HASH}.jpg`);
    const meta = await metadataOf(result.variants.original);
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([800, 400]);
  });

  it('P4b strips EXIF (GPS) from the public original, applies orientation, keeps ICC (R1-002)', async () => {
    const src = await makeGpsJpeg(path.join(dir, 'gps.jpg'));
    const input = await metadataOf(src);
    expect(hasGpsTag(input.exif)).toBe(true);
    expect(input.icc).toBeDefined();

    for (const config of [fastConfig(), fastConfig({ minSizeToOptimize: 10_000 })]) {
      const result = await processImage(src, path.join(out, String(config.minSizeToOptimize)), HASH, config);
      const meta = await metadataOf(result.variants.original);
      expect(meta.format).toBe('jpeg');
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.orientation ?? 1).toBe(1);
      expect([meta.width, meta.height]).toEqual([20, 40]);
      expect(meta.icc).toBeDefined();
      expect([result.originalWidth, result.originalHeight]).toEqual([20, 40]);
    }
  });

  it.each([
    ['jpg', (image: sharp.Sharp) => image.jpeg({ quality: 75 })],
    ['png', (image: sharp.Sharp) => image.png({ palette: true })],
    ['webp', (image: sharp.Sharp) => image.webp({ quality: 75 })],
    ['avif', (image: sharp.Sharp) => image.avif({ quality: 50 })],
  ] as const)('P4d copies a metadata-free .%s original byte for byte (RR-001)', async (ext, encode) => {
    const src = await makePhoto(path.join(dir, `pic.${ext}`), encode);
    for (const config of [fastConfig(), fastConfig({ minSizeToOptimize: 10_000 })]) {
      const result = await processImage(src, path.join(out, String(config.minSizeToOptimize)), HASH, config);
      expect(path.extname(result.variants.original)).toBe(`.${ext}`);
      expect(fs.readFileSync(result.variants.original).equals(fs.readFileSync(src))).toBe(true);
    }
  });

  it.each([
    ['jpg', 'jpeg', 1.1, (image: sharp.Sharp) => image.jpeg({ quality: 75 })],
    ['webp', 'webp', 1.1, (image: sharp.Sharp) => image.webp({ quality: 75 })],
    ['avif', 'heif', 1.1, (image: sharp.Sharp) => image.avif({ quality: 50 })],
    ['png', 'png', 1.05, (image: sharp.Sharp) => image.png({ palette: true })],
  ] as const)(
    'P4e cleans a .%s photo with EXIF/GPS without growing it (RR-001)',
    async (ext, format, maxRatio, encode) => {
      const src = await makePhoto(path.join(dir, `photo.${ext}`), encode, { metadata: true });
      const input = await metadataOf(src);
      expect(hasGpsTag(input.exif)).toBe(true);

      const result = await processImage(src, out, HASH, fastConfig({ minSizeToOptimize: 10_000 }));
      const meta = await metadataOf(result.variants.original);
      expect(meta.format).toBe(format);
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeDefined();
      expect(meta.orientation ?? 1).toBe(1);
      if (input.orientation === 6) expect([meta.width, meta.height]).toEqual([400, 600]);
      const ratio = fs.statSync(result.variants.original).size / fs.statSync(src).size;
      expect(ratio).toBeLessThanOrEqual(maxRatio);
    }
  );

  it('P4g re-encodes a metadata-free-looking TIFF losslessly (RR-003)', async () => {
    const src = await makePhoto(path.join(dir, 'pic.tiff'), (image) => image.tiff({ compression: 'lzw' }));
    const result = await processImage(src, out, HASH, fastConfig({ minSizeToOptimize: 10_000 }));
    expect(path.extname(result.variants.original)).toBe('.tiff');
    const pixels = (file: string) => sharp(fs.readFileSync(file)).raw().toBuffer();
    expect((await pixels(result.variants.original)).equals(await pixels(src))).toBe(true);
  });

  it.each([undefined, 6])(
    'P4h strips Make/Artist/GPS IFD tags from a TIFF original, orientation %s (RR-003)',
    async (orientation) => {
      const src = makeTaggedTiff(path.join(dir, 'tagged.tiff'), { orientation });
      const input = await metadataOf(src);
      // sharp does not surface these IFD0 tags as EXIF: the reason TIFFs are always re-encoded.
      expect(input.exif).toBeUndefined();
      expect(fs.readFileSync(src).includes('SECRETCAM')).toBe(true);

      for (const config of [fastConfig(), fastConfig({ minSizeToOptimize: 10_000 })]) {
        const result = await processImage(src, path.join(out, String(config.minSizeToOptimize)), HASH, config);
        const bytes = fs.readFileSync(result.variants.original);
        expect(bytes.includes('SECRETCAM')).toBe(false);
        expect(bytes.includes('SECRETARTIST')).toBe(false);
        expect(bytes.includes(Buffer.from([0x25, 0x88]))).toBe(false);
        const meta = await metadataOf(result.variants.original);
        expect(meta.format).toBe('tiff');
        expect(meta.exif).toBeUndefined();
        expect(meta.xmp).toBeUndefined();
        expect(meta.iptc).toBeUndefined();
        expect(meta.orientation ?? 1).toBe(1);
        expect([meta.width, meta.height]).toEqual(orientation === 6 ? [8, 16] : [16, 8]);
      }
    }
  );

  it('P4f keeps a lossless WebP original with metadata lossless (RR-001)', async () => {
    const src = await makePhoto(path.join(dir, 'lossless.webp'), (image) => image.webp({ lossless: true }), {
      metadata: true,
    });
    const result = await processImage(src, out, HASH, fastConfig());
    const meta = await metadataOf(result.variants.original);
    expect(meta.exif).toBeUndefined();
    const pixels = (file: string) => sharp(fs.readFileSync(file)).rotate().raw().toBuffer();
    expect((await pixels(result.variants.original)).equals(await pixels(src))).toBe(true);
  });

  it('P4c keeps PNG originals lossless', async () => {
    const src = await makeAlphaPng(path.join(dir, 'alpha.png'));
    const result = await processImage(src, out, HASH, fastConfig());
    expect((await metadataOf(result.variants.original)).format).toBe('png');
    const pixels = (file: string) => sharp(fs.readFileSync(file)).raw().toBuffer();
    expect((await pixels(result.variants.original)).equals(await pixels(src))).toBe(true);
  });

  it('P5 builds a tiny JPEG blur placeholder and the dominant colour', async () => {
    const src = await makeJpeg(path.join(dir, 'red.jpg'));
    const result = await processImage(src, out, HASH, fastConfig({ blurSize: 10 }));

    expect(result.blurDataURL).toMatch(/^data:image\/jpeg;base64,/);
    const blur = Buffer.from(result.blurDataURL!.split(',')[1], 'base64');
    expect((await sharp(blur).metadata()).width).toBeLessThanOrEqual(10);

    const match = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(result.dominantColor ?? '');
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(150);
    expect(Number(match![2])).toBeLessThan(80);
    expect(result.originalWidth).toBe(800);
    expect(result.originalHeight).toBe(400);
    expect(result.hasAlpha).toBe(false);
  });

  it('P6 uses a WebP placeholder and no dominant colour for transparent images', async () => {
    const src = await makeAlphaPng(path.join(dir, 'alpha.png'));
    const result = await processImage(src, out, HASH, fastConfig());
    expect(result.hasAlpha).toBe(true);
    expect(result.blurDataURL).toMatch(/^data:image\/webp;base64,/);
    expect(result.dominantColor).toBeUndefined();
  });

  it('P7 reports and encodes EXIF-rotated images in display orientation (#5)', async () => {
    const src = await makeRotatedJpeg(path.join(dir, 'rotated.jpg'));
    const result = await processImage(src, out, HASH, fastConfig());

    expect(result.originalWidth).toBe(20);
    expect(result.originalHeight).toBe(40);
    expect(widthsOf(result.variants.webp)).toEqual(['16']);
    const meta = await metadataOf(result.variants.webp[16]);
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(32);
  });

  it.each([
    [1, 40, 20],
    [2, 40, 20],
    [3, 40, 20],
    [4, 40, 20],
    [5, 20, 40],
    [6, 20, 40],
    [7, 20, 40],
    [8, 20, 40],
  ])('P7b EXIF orientation %i is reported as %ix%i (R3-006)', async (orientation, width, height) => {
    const src = await makeRotatedJpeg(path.join(dir, `o${orientation}.jpg`), orientation);
    expect((await metadataOf(src)).orientation).toBe(orientation);
    const result = await processImage(src, out, HASH, fastConfig());
    expect([result.originalWidth, result.originalHeight]).toEqual([width, height]);
    const variant = await metadataOf(result.variants.webp[16]);
    expect(variant.width).toBe(16);
    expect(variant.height).toBe(Math.round((16 * height) / width));
  });

  it('P8 passes GIFs through untouched (#6)', async () => {
    const src = await makeGif(path.join(dir, 'anim.gif'));
    const result = await processImage(src, out, HASH, fastConfig());

    expect(result.variants.avif).toEqual({});
    expect(result.variants.webp).toEqual({});
    expect(fs.readFileSync(result.variants.original)).toEqual(fs.readFileSync(src));
    expect(result.originalWidth).toBe(32);
    expect(fs.readdirSync(out)).toEqual([path.basename(result.variants.original)]);
    expect((await metadataOf(result.variants.original)).format).toBe('gif');
  });

  it('P9 only copies files below minSizeToOptimize', async () => {
    const src = await makeSmallPng(path.join(dir, 'small.png'));
    expect(fs.statSync(src).size).toBeLessThan(10_000 * 1024);
    const result = await processImage(src, out, HASH, fastConfig({ minSizeToOptimize: 10_000 }));

    expect(result.variants.avif).toEqual({});
    expect(result.variants.webp).toEqual({});
    expect(result.blurDataURL).toBeUndefined();
    expect(fs.readdirSync(out)).toEqual([path.basename(result.variants.original)]);
  });

  it('P10 rejects an undecodable file without leaving variants behind', async () => {
    const src = makeBadPng(path.join(dir, 'bad.png'));
    await expect(processImage(src, out, HASH, fastConfig())).rejects.toBeInstanceOf(Error);
    const leftovers = fs.existsSync(out) ? fs.readdirSync(out) : [];
    expect(leftovers).toEqual([]);
  });
});
