import { GranularImagesConfig } from '../../types/config';

export class ConfigError extends Error {
  constructor(public messages: string[]) {
    super(messages.join('\n'));
    this.name = 'ConfigError';
  }
}

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
      input: config.paths?.input || 'public',
      output: config.paths?.output || 'public/next-granular-images',
      types: config.paths?.types || 'src/generated/next-granular-images',
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
    if (finalConfig.qualities.avif < 1 || finalConfig.qualities.avif > 100) {
      errors.push(
        'qualities.avif must be between 1 and 100. Recommended: 50-70 for good quality.'
      );
    }
  }

  if (finalConfig.qualities.webp !== undefined) {
    if (finalConfig.qualities.webp < 1 || finalConfig.qualities.webp > 100) {
      errors.push(
        'qualities.webp must be between 1 and 100. Recommended: 75-90 for good quality.'
      );
    }
  }

  if (finalConfig.effort.avif !== undefined) {
    if (finalConfig.effort.avif < 1 || finalConfig.effort.avif > 9) {
      errors.push(
        'effort.avif must be between 1 and 9. Higher values = slower but better compression. Recommended: 4-6.'
      );
    }
  }

  if (finalConfig.effort.webp !== undefined) {
    if (finalConfig.effort.webp < 1 || finalConfig.effort.webp > 6) {
      errors.push(
        'effort.webp must be between 1 and 6. Higher values = slower but better compression. Recommended: 4-5.'
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

  if (finalConfig.blurSize < 4 || finalConfig.blurSize > 64) {
    errors.push(
      'blurSize must be between 4 and 64. Recommended: 8-16 for optimal placeholder quality.'
    );
  }

  if (finalConfig.blurQuality < 1 || finalConfig.blurQuality > 100) {
    errors.push('blurQuality must be between 1 and 100. Recommended: 40-60.');
  }

  if (finalConfig.minSizeToOptimize < 0) {
    errors.push(
      'minSizeToOptimize must be >= 0. Set to 0 to optimize all images.'
    );
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
