import crypto from 'crypto';
import fs from 'fs';
import { version as pkgVersion } from '../../../package.json';

const STREAM_THRESHOLD = 1024 * 1024;

export const getFileHash = async (filePath: string): Promise<string> => {
  const stats = fs.statSync(filePath);

  if (stats.size > STREAM_THRESHOLD) {
    return getFileHashStream(filePath);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex').substring(0, 8);
};

const getFileHashStream = (filePath: string): Promise<string> => {
  const hashSum = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);

  stream.on('data', (chunk) => {
    hashSum.update(chunk);
  });

  return new Promise<string>((resolve, reject) => {
    stream.on('end', () => {
      resolve(hashSum.digest('hex').substring(0, 8));
    });
    stream.on('error', reject);
  });
};

/** Config keys that do not change the generated files. */
const NON_OUTPUT_KEYS = new Set(['concurrency']);

/** JSON with object keys sorted recursively, so key order never matters. */
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/**
 * Hash of the parts of the config that affect the output, salted with the
 * package version so a release that changes the encoder output busts the cache.
 */
export const getConfigHash = (
  config: unknown,
  version: string = pkgVersion
): string => {
  const relevant =
    config && typeof config === 'object' && !Array.isArray(config)
      ? Object.fromEntries(
          Object.entries(config as Record<string, unknown>).filter(
            ([key]) => !NON_OUTPUT_KEYS.has(key)
          )
        )
      : config;
  const hashSum = crypto.createHash('sha256');
  hashSum.update(stableStringify(relevant));
  hashSum.update(version);
  return hashSum.digest('hex').substring(0, 8);
};

export const generateCompositeHash = (
  fileHash: string,
  configHash: string
): string => {
  return `${fileHash}-${configHash}`;
};
