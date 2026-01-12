
export type QualityValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 | 60 | 61 | 62 | 63 | 64 | 65 | 66 | 67 | 68 | 69 | 70 | 71 | 72 | 73 | 74 | 75 | 76 | 77 | 78 | 79 | 80 | 81 | 82 | 83 | 84 | 85 | 86 | 87 | 88 | 89 | 90 | 91 | 92 | 93 | 94 | 95 | 96 | 97 | 98 | 99 | 100;
export type EffortAvifValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type EffortWebpValue = 1 | 2 | 3 | 4 | 5 | 6;
export type BlurSizeValue = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 | 60 | 61 | 62 | 63 | 64;
export type BlurQualityValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 | 49 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 59 | 60 | 61 | 62 | 63 | 64 | 65 | 66 | 67 | 68 | 69 | 70 | 71 | 72 | 73 | 74 | 75 | 76 | 77 | 78 | 79 | 80 | 81 | 82 | 83 | 84 | 85 | 86 | 87 | 88 | 89 | 90 | 91 | 92 | 93 | 94 | 95 | 96 | 97 | 98 | 99 | 100;

export interface GranularImagesConfig {
  /**
   * Configuration for image qualities.
   * At least one quality (avif or webp) must be set.
   */
  qualities: {
    /**
     * Quality for AVIF images.
     * Range: 1-100
     */
    avif?: QualityValue;
    /**
     * Quality for WebP images.
     * Range: 1-100
     */
    webp?: QualityValue;
  };

  /**
   * Effort/Compression level for encoding.
   * If a quality is set for a format, the corresponding effort MUST also be set.
   */
  effort: {
    /**
     * Effort for AVIF encoding.
     * Range: 1-9 (Higher means slower but better compression)
     */
    avif?: EffortAvifValue;
    /**
     * Effort for WebP encoding.
     * Range: 1-6 (Higher means slower but better compression)
     */
    webp?: EffortWebpValue;
  };

  /**
   * Device breakpoints for responsive images.
   * Values must be sorted in strictly ascending order.
   */
  breakpoints: Record<string, number>;

  /**
   * Device sizes for responsive generation.
   * Must be sorted in strictly ascending order.
   */
  deviceSizes: number[];

  /**
   * Image sizes for responsive generation.
   * Must be sorted in strictly ascending order.
   */
  imageSizes: number[];

  /**
   * Number of images to process in parallel.
   * Higher values = faster but more memory usage.
   * Default: 4
   */
  concurrency: number;

  /**
   * Minimum file size in KB to process with Sharp.
   * Images smaller than this will just be copied.
   * Default: 0 (process all)
   */
  minSizeToOptimize: number;

  /**
   * Size of the blur placeholder.
   * Range: 4-64
   * Default: 10
   */
  blurSize: BlurSizeValue;

  /**
   * Quality of the blur placeholder.
   * Range: 1-100
   * Default: 50
   */
  blurQuality: BlurQualityValue;

  /**
   * Input/Output paths
   */
  paths: {
    /**
     * Directory containing source images
     * Default: public
     */
    input: string;
    /**
     * Directory to output processed images
     * Default: public/next-granular-images
     */
    output: string;
    /**
     * Directory to output generated TypeScript types
     * Default: src/generated/next-granular-images
     */
    types: string;
  };

  /**
   * Files to exclude from processing.
   * Supports extensions (.svg) or suffixes.
   */
  exclusions: string[];
}