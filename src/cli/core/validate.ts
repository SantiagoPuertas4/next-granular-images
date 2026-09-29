import path from 'path';
import { GranularImagesConfig } from '../../types/config';
import { isInsideDir } from './files';

export class ConfigError extends Error {
  constructor(public messages: string[]) {
    super(messages.join('\n'));
    this.name = 'ConfigError';
  }
}

const isIntInRange = (value: unknown, min: number, max: number): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

const isPositiveInt = (value: unknown): boolean =>
  isIntInRange(value, 1, Number.MAX_SAFE_INTEGER);

/** Default `paths`, also used by `clean` when the config cannot be loaded. */
export const DEFAULT_PATHS = {
  input: 'public',
  output: 'public/next-granular-images',
  types: 'src/generated/next-granular-images',
} as const;

export const validateConfig = (
  config: Partial<GranularImagesConfig>
): GranularImagesConfig => {
  const errors: string[] = [];

  // ==========================================================================
  // APPLY DEFAULTS
  // ==========================================================================

  const finalConfig: GranularImagesConfig = {
    qualities: config.qualities || {},
    effort: config.effort || {},
    breakpoints: config.breakpoints || {
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
    },
    deviceSizes: config.deviceSizes || [
      640, 750, 828, 1080, 1200, 1920, 2048, 3840,
    ],
    imageSizes: config.imageSizes || [16, 32, 48, 64, 96, 128, 256, 384],
    concurrency: config.concurrency ?? 4,
    minSizeToOptimize: config.minSizeToOptimize ?? 0,
    blurSize: config.blurSize ?? 10,
    blurQuality: config.blurQuality ?? 50,
    paths: {
      input: config.paths?.input ?? DEFAULT_PATHS.input,
      output: config.paths?.output ?? DEFAULT_PATHS.output,
      types: config.paths?.types ?? DEFAULT_PATHS.types,
    },
    exclusions: config.exclusions || [
      '.ico',
      '.xml',
      '.webmanifest',
      '.svg',
      '.webp',
      '.avif',
    ],
  };

  // ==========================================================================
  // VALIDATE QUALITY VALUES
  // ==========================================================================

  if (finalConfig.qualities.avif !== undefined) {
    if (!isIntInRange(finalConfig.qualities.avif, 1, 100)) {
      errors.push(
        'qualities.avif must be an integer between 1 and 100. Recommended: 50-70 for good quality.'
      );
    }
  }

  if (finalConfig.qualities.webp !== undefined) {
    if (!isIntInRange(finalConfig.qualities.webp, 1, 100)) {
      errors.push(
        'qualities.webp must be an integer between 1 and 100. Recommended: 75-90 for good quality.'
      );
    }
  }

  if (finalConfig.effort.avif !== undefined) {
    if (!isIntInRange(finalConfig.effort.avif, 1, 9)) {
      errors.push(
        'effort.avif must be an integer between 1 and 9. Higher values = slower but better compression. Recommended: 4-6.'
      );
    }
  }

  if (finalConfig.effort.webp !== undefined) {
    if (!isIntInRange(finalConfig.effort.webp, 1, 6)) {
      errors.push(
        'effort.webp must be an integer between 1 and 6. Higher values = slower but better compression. Recommended: 4-5.'
      );
    }
  }

  // ==========================================================================
  // VALIDATE DEPENDENCIES
  // ==========================================================================

  const hasAvifQuality = finalConfig.qualities.avif !== undefined;
  const hasWebpQuality = finalConfig.qualities.webp !== undefined;
  const hasAvifEffort = finalConfig.effort.avif !== undefined;
  const hasWebpEffort = finalConfig.effort.webp !== undefined;

  if (!hasAvifQuality && !hasWebpQuality) {
    errors.push(
      "At least one quality (avif or webp) must be set in 'qualities'. Add 'qualities: { avif: 60, webp: 85 }' to your config."
    );
  }

  if (hasAvifQuality && !hasAvifEffort) {
    errors.push(
      "If 'qualities.avif' is set, 'effort.avif' must also be set. Add 'effort: { avif: 6 }' to your config."
    );
  }

  if (hasAvifEffort && !hasAvifQuality) {
    errors.push(
      "If 'effort.avif' is set, 'qualities.avif' must also be set. Add 'qualities: { avif: 60 }' to your config."
    );
  }

  if (hasWebpQuality && !hasWebpEffort) {
    errors.push(
      "If 'qualities.webp' is set, 'effort.webp' must also be set. Add 'effort: { webp: 4 }' to your config."
    );
  }

  if (hasWebpEffort && !hasWebpQuality) {
    errors.push(
      "If 'effort.webp' is set, 'qualities.webp' must also be set. Add 'qualities: { webp: 85 }' to your config."
    );
  }

  // ==========================================================================
  // VALIDATE NUMERIC RANGES
  // ==========================================================================

  if (!isIntInRange(finalConfig.blurSize, 4, 64)) {
    errors.push(
      'blurSize must be an integer between 4 and 64. Recommended: 8-16 for optimal placeholder quality.'
    );
  }

  if (!isIntInRange(finalConfig.blurQuality, 1, 100)) {
    errors.push('blurQuality must be an integer between 1 and 100. Recommended: 40-60.');
  }

  if (
    typeof finalConfig.minSizeToOptimize !== 'number' ||
    !Number.isFinite(finalConfig.minSizeToOptimize) ||
    finalConfig.minSizeToOptimize < 0
  ) {
    errors.push(
      'minSizeToOptimize must be >= 0. Set to 0 to optimize all images.'
    );
  }

  if (!isIntInRange(finalConfig.concurrency, 1, Number.MAX_SAFE_INTEGER)) {
    errors.push('concurrency must be a positive integer. Recommended: 2-8.');
  }

  // ==========================================================================
  // VALIDATE SHAPES
  // ==========================================================================

  const sizeLists = [
    ['deviceSizes', finalConfig.deviceSizes],
    ['imageSizes', finalConfig.imageSizes],
  ] as const;
  for (const [name, list] of sizeLists) {
    if (!Array.isArray(list) || !list.every(isPositiveInt)) {
      errors.push(`${name} must be an array of positive integers (pixel widths).`);
    }
  }

  if (
    !finalConfig.breakpoints ||
    typeof finalConfig.breakpoints !== 'object' ||
    !Object.values(finalConfig.breakpoints).every(isPositiveInt)
  ) {
    errors.push('breakpoints must map names to positive integer widths. Example: { sm: 640 }');
  }

  for (const key of ['input', 'output', 'types'] as const) {
    const value = finalConfig.paths[key];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`paths.${key} must be a non-empty string.`);
    }
  }

  if (
    !Array.isArray(finalConfig.exclusions) ||
    !finalConfig.exclusions.every((e) => typeof e === 'string' && e !== '')
  ) {
    errors.push("exclusions must be an array of non-empty strings. Example: ['.svg', '.min.png']");
  }

  if (errors.length > 0) {
    throw new ConfigError(errors);
  }

  // ==========================================================================
  // VALIDATE SORTING
  // ==========================================================================

  const breakpointValues = Object.values(finalConfig.breakpoints);
  for (let i = 0; i < breakpointValues.length - 1; i++) {
    if (breakpointValues[i] >= breakpointValues[i + 1]) {
      errors.push(
        'breakpoints must be sorted in strictly ascending order by value. Example: { sm: 640, md: 768, lg: 1024 }'
      );
      break;
    }
  }

  for (let i = 0; i < finalConfig.deviceSizes.length - 1; i++) {
    if (finalConfig.deviceSizes[i] >= finalConfig.deviceSizes[i + 1]) {
      errors.push(
        'deviceSizes must be sorted in strictly ascending order. Example: [640, 750, 1080, 1920]'
      );
      break;
    }
  }

  for (let i = 0; i < finalConfig.imageSizes.length - 1; i++) {
    if (finalConfig.imageSizes[i] >= finalConfig.imageSizes[i + 1]) {
      errors.push(
        'imageSizes must be sorted in strictly ascending order. Example: [16, 32, 64, 128, 256]'
      );
      break;
    }
  }

  if (errors.length > 0) {
    throw new ConfigError(errors);
  }

  return finalConfig;
};

/**
 * Generated URLs are relative to Next.js' `public` directory, so the output
 * directory must live inside it.
 */
export const assertOutputInsidePublic = (cwd: string, outputPath: string): void => {
  const publicRoot = path.join(cwd, 'public');
  const outputDir = path.resolve(cwd, outputPath);
  if (outputDir === publicRoot || !isInsideDir(outputDir, publicRoot)) {
    throw new ConfigError([
      `paths.output ("${outputPath}") must be a folder inside the Next.js public directory, e.g. "public/next-granular-images". Files outside public/ are not served, so no image URLs could be generated.`,
    ]);
  }
};
