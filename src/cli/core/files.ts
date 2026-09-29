import path from 'path';

/**
 * File extensions the optimizer knows how to handle. `.heic` is not listed:
 * the prebuilt sharp binaries ship without an HEVC decoder.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.tiff',
  '.gif',
];

export interface ImageFilterOptions {
  /** Absolute path of the output directory; files inside it are skipped. */
  outputDir: string;
  /** Extensions (`.svg`) or suffixes (`.min.png`) to skip. */
  exclusions: string[];
}

/** True when `file` is `dir` itself or anywhere below it. */
export const isInsideDir = (file: string, dir: string): boolean => {
  const relative = path.relative(dir, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/** Decides whether a source file should be picked up by `optimize`/`generate`. */
export const isProcessableImage = (
  file: string,
  { outputDir, exclusions }: ImageFilterOptions
): boolean => {
  if (isInsideDir(file, outputDir)) return false;
  const lowerFile = file.toLowerCase();
  const ext = path.extname(lowerFile);
  const isImage = SUPPORTED_EXTENSIONS.includes(ext);
  const isExcluded = exclusions.some((excluded) =>
    lowerFile.endsWith(excluded.toLowerCase())
  );
  return isImage && !isExcluded;
};
