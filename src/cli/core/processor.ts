import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { addToQueue } from './queue';
import { GranularImagesConfig } from '../../types/config';
import { heifHasMetadataItems, stripJpeg, stripPng, stripWebp } from './strip-metadata';

export interface ProcessedImageResult {
  originalWidth: number;
  originalHeight: number;
  blurDataURL?: string;
  dominantColor?: string;
  hasAlpha: boolean;
  variants: {
    avif: Record<number, string>;
    webp: Record<number, string>;
    original: string;
  };
}

/**
 * Widths to generate for an image of the given intrinsic width: every
 * configured device/image size that does not upscale the source, ascending.
 */
export const computeTargetWidths = (
  config: Pick<GranularImagesConfig, 'deviceSizes' | 'imageSizes'>,
  width: number
): number[] => {
  const unique = new Set([...config.deviceSizes, ...config.imageSizes]);
  return [...unique].filter((w) => w <= width).sort((a, b) => a - b);
};

const ORIGINAL_FORMATS = ['jpeg', 'png', 'webp', 'heif', 'tiff'];

/** Growth over the source size tolerated before a lossy clean copy is retried. */
const MAX_GROWTH = 1.05;

/** First-pass and retry qualities of the lossy formats' clean copy. */
const CLEAN_QUALITY: Record<string, [number, number]> = {
  jpeg: [90, 75],
  webp: [90, 75],
  heif: [80, 50],
};

/** True when a WebP file stores its image with the lossless (VP8L) codec. */
const isLosslessWebp = (input: Buffer): boolean => {
  if (input.toString('ascii', 0, 4) !== 'RIFF' || input.toString('ascii', 8, 12) !== 'WEBP') {
    return false;
  }
  for (let offset = 12; offset + 8 <= input.length; ) {
    const fourCC = input.toString('ascii', offset, offset + 4);
    if (fourCC === 'VP8L') return true;
    if (fourCC === 'VP8 ') return false;
    const size = input.readUInt32LE(offset + 4);
    offset += 8 + size + (size % 2);
  }
  return false;
};

/** Formats whose metadata is removed at byte level, without re-encoding. */
const STRIPPERS: Record<string, (data: Buffer) => Buffer> = {
  jpeg: stripJpeg,
  png: stripPng,
  webp: stripWebp,
};

/**
 * An AVIF is copied as-is only when it carries no EXIF/XMP/IPTC metadata
 * (neither reported by sharp nor declared as an item) and no rotation.
 */
const heifNeedsCleaning = (input: Buffer, metadata: sharp.Metadata): boolean =>
  !!metadata.exif ||
  !!metadata.xmp ||
  !!metadata.iptc ||
  (metadata.comments?.length ?? 0) > 0 ||
  heifHasMetadataItems(input);

/**
 * Encodes at the first quality; when the result is more than `MAX_GROWTH`
 * times `sourceSize`, encodes once more at the retry quality and keeps the
 * smaller of the two buffers. Without qualities (lossless) it encodes once.
 */
export const encodeWithRetry = async (
  encode: (quality?: number) => Promise<Buffer>,
  sourceSize: number,
  qualities?: [number, number]
): Promise<Buffer> => {
  const output = await encode(qualities?.[0]);
  if (!qualities || output.length <= sourceSize * MAX_GROWTH) return output;
  const retry = await encode(qualities[1]);
  return retry.length < output.length ? retry : output;
};

const isPalettePng = (metadata: sharp.Metadata): boolean => {
  // `isPalette` exists from sharp 0.34, `paletteBitDepth` before it.
  const palette = metadata as sharp.Metadata & { isPalette?: boolean; paletteBitDepth?: number };
  return palette.isPalette ?? palette.paletteBitDepth !== undefined;
};

/**
 * The public copy of the original with no metadata (EXIF/XMP/IPTC, camera
 * data, GPS position, comments, text chunks), EXIF orientation applied and
 * the ICC profile kept.
 *
 * A JPEG, PNG or WebP that needs no rotation has its metadata removed at
 * byte level: the image data is copied untouched, so the copy is lossless,
 * never larger and identical when there was nothing to remove. An AVIF with
 * no metadata and no rotation is returned as-is. Everything else (rotated
 * images, TIFFs, AVIFs with metadata) is re-encoded in its own format: JPEG,
 * lossy WebP and AVIF at high quality, retried once at a lower quality when
 * the result is noticeably larger than the source; lossless WebP, PNG
 * (palette PNGs stay palette) and TIFF losslessly. A re-encoded JPEG, PNG or
 * WebP is stripped again, since sharp carries text chunks and comments over.
 * The metadata-bearing source bytes are never returned; a file that cannot be
 * parsed throws.
 */
export const cleanOriginal = async (input: Buffer, format: string | undefined): Promise<Buffer> => {
  if (!format || !ORIGINAL_FORMATS.includes(format)) {
    throw new Error(`Unsupported original format: ${format ?? 'unknown'}`);
  }

  const metadata = await sharp(input).metadata();
  const rotated = (metadata.orientation ?? 1) !== 1;
  const strip = STRIPPERS[format];
  if (strip && !rotated) return strip(input);
  if (format === 'heif' && !rotated && !heifNeedsCleaning(input, metadata)) return input;

  const lossless = format === 'webp' && isLosslessWebp(input);
  const encode = (quality?: number): Promise<Buffer> => {
    const pipeline = sharp(input).rotate().keepIccProfile();
    if (format === 'jpeg') pipeline.jpeg({ quality, mozjpeg: true });
    else if (format === 'png') pipeline.png({ palette: isPalettePng(metadata) });
    else if (format === 'webp') pipeline.webp(lossless ? { lossless: true } : { quality });
    else if (format === 'heif') pipeline.avif({ quality });
    else pipeline.tiff({ compression: 'lzw' });
    return pipeline.toBuffer();
  };

  const qualities = lossless ? undefined : CLEAN_QUALITY[format];
  const encoded = await encodeWithRetry(encode, input.length, qualities);
  if (strip) return strip(encoded);
  if (format === 'heif' && heifHasMetadataItems(encoded)) {
    throw new Error('Re-encoded AVIF original still carries metadata items');
  }
  return encoded;
};

export const processImage = async (
  filePath: string,
  outputDir: string,
  fileHash: string,
  config: GranularImagesConfig
): Promise<ProcessedImageResult> => {
  return addToQueue(async () => {
    // ========================================================================
    // SETUP & METADATA EXTRACTION
    // ========================================================================

    await fs.promises.mkdir(outputDir, { recursive: true });

    const fileBuffer = await fs.promises.readFile(filePath);
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read metadata for ${filePath}`);
    }

    // EXIF orientations 5-8 rotate by 90/270 degrees: the displayed (and
    // encoded, after rotate()) image has width and height swapped.
    const isQuarterTurn = (metadata.orientation ?? 1) >= 5;
    const width = isQuarterTurn ? metadata.height : metadata.width;
    const height = isQuarterTurn ? metadata.width : metadata.height;

    const getFileName = (width: number | 'original', ext: string) => {
      const parsed = path.parse(filePath);
      const suffix = width === 'original' ? '' : `-${width}`;
      return path.join(outputDir, `${parsed.name}-${fileHash}${suffix}.${ext}`);
    };

    const { size } = await fs.promises.stat(filePath);
    const minSize = (config.minSizeToOptimize || 0) * 1024;

    // ========================================================================
    // PASSTHROUGH: SMALL FILES AND GIFS
    // ========================================================================

    // GIFs are copied as-is: re-encoding would drop the animation.
    const isGif = metadata.format === 'gif';
    const originalExt = path.extname(filePath).replace('.', '');
    const originalDest = getFileName('original', originalExt);

    if (size < minSize || isGif) {
      if (isGif) await fs.promises.copyFile(filePath, originalDest);
      else await fs.promises.writeFile(originalDest, await cleanOriginal(fileBuffer, metadata.format));

      return {
        originalWidth: width,
        originalHeight: height,
        hasAlpha: metadata.hasAlpha || false,
        dominantColor: undefined,
        blurDataURL: undefined,
        variants: {
          avif: {},
          webp: {},
          original: originalDest,
        },
      };
    }

    // Cleaned first so an original that cannot be parsed fails the image
    // before any variant is written.
    const originalBytes = await cleanOriginal(fileBuffer, metadata.format);

    // ========================================================================
    // IMAGE PROCESSING & ANALYSIS
    // ========================================================================

    image.rotate().toColorspace('srgb');

    const { dominant } = await image.stats();
    const dominantColor =
      dominant && !metadata.hasAlpha
        ? `rgb(${dominant.r},${dominant.g},${dominant.b})`
        : undefined;

    const isTransparent = metadata.hasAlpha;
    const placeholderFormat = isTransparent ? 'webp' : 'jpeg';
    const blurBuffer = await image
      .clone()
      .resize(config.blurSize, null, { fit: 'inside' })
      .toFormat(placeholderFormat, { quality: config.blurQuality })
      .toBuffer();
    const blurDataURL = `data:image/${placeholderFormat};base64,${blurBuffer.toString(
      'base64'
    )}`;

    const targetWidths = computeTargetWidths(config, width);

    // ========================================================================
    // VARIANT GENERATION
    // ========================================================================

    const variants: ProcessedImageResult['variants'] = {
      avif: {},
      webp: {},
      original: '',
    };

    if (
      config.qualities.avif !== undefined &&
      config.effort.avif !== undefined
    ) {
      for (const width of targetWidths) {
        const dest = getFileName(width, 'avif');
        await image
          .clone()
          .resize(width)
          .avif({ quality: config.qualities.avif, effort: config.effort.avif })
          .toFile(dest);
        variants.avif[width] = dest;
      }
    }

    if (
      config.qualities.webp !== undefined &&
      config.effort.webp !== undefined
    ) {
      for (const width of targetWidths) {
        const dest = getFileName(width, 'webp');
        await image
          .clone()
          .resize(width)
          .webp({
            quality: config.qualities.webp,
            effort: config.effort.webp,
            smartSubsample: true,
          })
          .toFile(dest);
        variants.webp[width] = dest;
      }
    }

    await fs.promises.writeFile(originalDest, originalBytes);
    variants.original = originalDest;

    return {
      originalWidth: width,
      originalHeight: height,
      hasAlpha: metadata.hasAlpha || false,
      dominantColor,
      blurDataURL,
      variants,
    };
  });
};
