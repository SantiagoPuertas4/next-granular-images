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

/**
 * Writes the public copy of the original: EXIF orientation applied, EXIF/XMP/
 * IPTC metadata (camera data, GPS position...) stripped, ICC profile kept, and
 * re-encoded in the source format at high quality (lossless where the format
 * has a lossless mode).
 */
export const writeCleanOriginal = async (
  input: Buffer,
  format: string | undefined,
  dest: string
): Promise<void> => {
  const pipeline = sharp(input).rotate().keepIccProfile();
  switch (format) {
    case 'jpeg':
      pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' });
      break;
    case 'png':
      pipeline.png();
      break;
    case 'webp':
      pipeline.webp({ lossless: true });
      break;
    case 'heif':
      pipeline.avif({ lossless: true });
      break;
    case 'tiff':
      pipeline.tiff({ compression: 'lzw' });
      break;
    default:
      throw new Error(`Unsupported original format: ${format ?? 'unknown'}`);
  }
  await pipeline.toFile(dest);
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
