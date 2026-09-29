import path from 'path';
import { normalizePath } from '../utils/paths';
import { isInsideDir } from './files';

/**
 * Converts an absolute file path inside the Next.js `public` directory into
 * the URL the file is served from. Each path segment is URL-encoded, so file
 * names with spaces stay valid inside a `srcset`.
 *
 * Throws when the file is not inside `publicRoot`: such a file is not served
 * by Next.js, so there is no URL to generate.
 */
export const toPublicUrl = (
  absPath: string,
  publicRoot: string = path.join(process.cwd(), 'public')
): string => {
  if (!isInsideDir(absPath, publicRoot) || path.resolve(absPath) === path.resolve(publicRoot)) {
    throw new Error(
      `Cannot build a public URL for "${absPath}": it is not inside the public directory "${publicRoot}". ` +
        'Set paths.output to a folder inside public/ (e.g. "public/next-granular-images").'
    );
  }
  const relative = normalizePath(path.relative(publicRoot, absPath));
  return '/' + relative.split('/').map(encodeURIComponent).join('/');
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
