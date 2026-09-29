import path from 'path';

/** File extensions the optimizer knows how to handle. */
export const SUPPORTED_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.tiff',
  '.gif',
  '.heic',
];

export interface ImageFilterOptions {
  /** Absolute path of the output directory; files inside it are skipped. */
  outputDir: string;
  /** Extensions (`.svg`) or suffixes (`.min.png`) to skip. */
  exclusions: string[];
}

/** Decides whether a source file should be picked up by `optimize`/`generate`. */
export const isProcessableImage = (
  file: string,
  { outputDir, exclusions }: ImageFilterOptions
): boolean => {
  if (file.startsWith(outputDir)) return false;
  const ext = path.extname(file).toLowerCase();
  const isImage = SUPPORTED_EXTENSIONS.includes(ext);
  const isExcluded = exclusions.some(
    (excluded) => ext === excluded || file.endsWith(excluded)
  );
  return isImage && !isExcluded;
};
