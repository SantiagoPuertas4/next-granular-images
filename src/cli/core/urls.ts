import path from 'path';
import { normalizePath } from '../utils/paths';

/**
 * Converts an absolute file path inside the Next.js `public` directory into
 * the URL the file is served from.
 */
export const toPublicUrl = (
  absPath: string,
  publicRoot: string = path.join(process.cwd(), 'public')
): string => {
  void publicRoot;
  const normalized = normalizePath(absPath);
  const publicIndex = normalized.indexOf('/public/');
  if (publicIndex !== -1) {
    return normalized.substring(publicIndex + 7);
  }
  return normalized;
};

/**
 * Builds a `srcset` string (`<url> <width>w, ...`) ordered by ascending width.
 * Returns `undefined` when there are no variants.
 */
export const buildSrcSet = (
  variants: Record<number, string> | undefined,
  publicRoot?: string
): string | undefined => {
  if (!variants || Object.keys(variants).length === 0) return undefined;
  return Object.entries(variants)
    .map(([width, filePath]) => [Number(width), filePath] as const)
    .sort(([a], [b]) => a - b)
    .map(([width, filePath]) => `${toPublicUrl(filePath, publicRoot)} ${width}w`)
    .join(', ');
};
