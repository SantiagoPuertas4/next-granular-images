import crypto from 'crypto';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  generateCompositeHash,
  getConfigHash,
  getFileHash,
} from '../../src/cli/utils/hash';
import { makeTempDir, writeFile } from '../helpers/tmp';

const sha8 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

describe('getFileHash', () => {
  it('U8 returns the first 8 hex chars of the sha256 of the content', async () => {
    const dir = makeTempDir();
    const a = writeFile(path.join(dir, 'a.txt'), 'abc');
    const b = writeFile(path.join(dir, 'b.txt'), 'abd');
    expect(await getFileHash(a)).toBe('ba7816bf');
    expect(await getFileHash(b)).not.toBe('ba7816bf');
  });

  it('U9 hashes files on both sides of the streaming threshold', async () => {
    const dir = makeTempDir();
    for (const size of [1024 * 1024, 1024 * 1024 + 1]) {
      const buf = crypto.randomBytes(size);
      const file = writeFile(path.join(dir, `f-${size}.bin`), buf);
      expect(await getFileHash(file)).toBe(sha8(buf));
    }
  });

  it('U10 rejects with ENOENT for a missing file', async () => {
    const dir = makeTempDir();
    await expect(getFileHash(path.join(dir, 'nope.png'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

describe('getConfigHash', () => {
  const cfg = { qualities: { webp: 50 }, effort: { webp: 1 }, deviceSizes: [100] };

  it('U11 is stable for equal configs and changes with the config', () => {
    const h = getConfigHash(cfg);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(getConfigHash(structuredClone(cfg))).toBe(h);
    expect(getConfigHash({ ...cfg, qualities: { webp: 51 } })).not.toBe(h);
  });
});

describe('generateCompositeHash', () => {
  it('U15 joins file and config hash with a dash', () => {
    expect(generateCompositeHash('aaaaaaaa', 'bbbbbbbb')).toBe('aaaaaaaa-bbbbbbbb');
  });
});
