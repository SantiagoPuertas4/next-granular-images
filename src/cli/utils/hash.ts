import crypto from 'crypto';
import fs from 'fs';

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

export const getConfigHash = (
  config: unknown,
  version: string = '1.0.0'
): string => {
  const hashSum = crypto.createHash('sha256');
  hashSum.update(JSON.stringify(config));
  hashSum.update(version);
  return hashSum.digest('hex').substring(0, 8);
};

export const generateCompositeHash = (
  fileHash: string,
  configHash: string
): string => {
  return `${fileHash}-${configHash}`;
};
