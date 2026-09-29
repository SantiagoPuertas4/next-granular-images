import fs from 'fs';
import path from 'path';
import { normalizePath } from '../utils/paths';
import type { ProcessedImageResult } from './processor';

/**
 * Bumped whenever the on-disk shape changes. Older meta files are treated as
 * a cache miss and rebuilt.
 */
export const META_VERSION = 2;

interface MetaFile extends Omit<ProcessedImageResult, 'variants'> {
  version: number;
  /** Paths are relative to the output directory, with forward slashes. */
  variants: ProcessedImageResult['variants'];
}

const mapVariants = (
  variants: ProcessedImageResult['variants'],
  map: (p: string) => string
): ProcessedImageResult['variants'] => {
  const mapRecord = (record: Record<number, string>) =>
    Object.fromEntries(Object.entries(record).map(([w, p]) => [w, map(p)]));
  return {
    avif: mapRecord(variants.avif),
    webp: mapRecord(variants.webp),
    original: map(variants.original),
  };
};

/**
 * Serializes a result for `<name>-<hash>.meta.json`. The file lives in
 * `public/`, so it must not contain absolute local paths: they would be served
 * publicly and break as soon as the project moves.
 */
export const serializeMeta = (result: ProcessedImageResult, outputDir: string): string => {
  const meta: MetaFile = {
    version: META_VERSION,
    ...result,
    variants: mapVariants(result.variants, (p) => normalizePath(path.relative(outputDir, p))),
  };
  return JSON.stringify(meta, null, 2);
};

export type MetaReadResult =
  | { ok: true; result: ProcessedImageResult }
  | { ok: false; reason: 'invalid' | 'outdated'; error?: unknown };

/** Reads a meta file back into a result with absolute paths. */
export const readMeta = async (metaPath: string, outputDir: string): Promise<MetaReadResult> => {
  let meta: MetaFile;
  try {
    meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
  } catch (error) {
    return { ok: false, reason: 'invalid', error };
  }
  if (!meta || typeof meta !== 'object' || !meta.variants) {
    return { ok: false, reason: 'invalid' };
  }
  if (meta.version !== META_VERSION) {
    return { ok: false, reason: 'outdated' };
  }
  const { version: _version, ...rest } = meta;
  return {
    ok: true,
    result: {
      ...rest,
      variants: mapVariants(meta.variants, (p) => path.resolve(outputDir, p)),
    },
  };
};
