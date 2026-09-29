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
  makeGif,
  makeJpeg,
  makeRotatedJpeg,
  makeSmallPng,
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

  it('P4 copies the original byte-for-byte', async () => {
    const src = await makeJpeg(path.join(dir, 'red.jpg'));
    const result = await processImage(src, out, HASH, fastConfig());
    expect(path.basename(result.variants.original)).toBe(`red-${HASH}.jpg`);
    expect(fs.readFileSync(result.variants.original).equals(fs.readFileSync(src))).toBe(true);
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
