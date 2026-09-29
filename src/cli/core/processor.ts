import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { addToQueue } from './queue';
import { GranularImagesConfig } from '../../types/config';

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

const needsCleaning = (metadata: sharp.Metadata): boolean =>
  !!metadata.exif ||
  !!metadata.xmp ||
  !!metadata.iptc ||
  (metadata.comments?.length ?? 0) > 0 ||
  (metadata.orientation ?? 1) !== 1;

const isPalettePng = (metadata: sharp.Metadata): boolean => {
  // `isPalette` exists from sharp 0.34, `paletteBitDepth` before it.
  const palette = metadata as sharp.Metadata & { isPalette?: boolean; paletteBitDepth?: number };
  return palette.isPalette ?? palette.paletteBitDepth !== undefined;
};

/**
 * Writes the public copy of the original with no EXIF/XMP/IPTC metadata
 * (camera data, GPS position...), EXIF orientation applied and the ICC
 * profile kept.
 *
 * A source with none of that metadata and no rotation is copied byte for
 * byte. Any other source is re-encoded in its own format: JPEG, lossy WebP
 * and AVIF lossy at high quality, retried once at a lower quality when the
 * result is noticeably larger than the source; lossless WebP, PNG (palette
 * PNGs stay palette) and TIFF losslessly. The metadata-bearing source bytes
 * are never written.
 */
export const writeCleanOriginal = async (
  input: Buffer,
  format: string | undefined,
  dest: string
): Promise<void> => {
  if (!format || !ORIGINAL_FORMATS.includes(format)) {
    throw new Error(`Unsupported original format: ${format ?? 'unknown'}`);
  }

  const metadata = await sharp(input).metadata();
  if (!needsCleaning(metadata)) {
    await fs.promises.writeFile(dest, input);
    return;
  }

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
  let output = await encode(qualities?.[0]);
  if (qualities && output.length > input.length * MAX_GROWTH) {
    const retry = await encode(qualities[1]);
    if (retry.length < output.length) output = retry;
  }
  await fs.promises.writeFile(dest, output);
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
      else await writeCleanOriginal(fileBuffer, metadata.format, originalDest);

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

    await writeCleanOriginal(fileBuffer, metadata.format, originalDest);
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
