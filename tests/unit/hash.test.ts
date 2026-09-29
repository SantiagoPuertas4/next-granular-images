import crypto from 'crypto';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  generateCompositeHash,
  getConfigHash,
  getFileHash,
} from '../../src/cli/utils/hash';
import { makeTempDir, writeFile } from '../helpers/tmp';
import pkg from '../../package.json';

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

describe('getConfigHash cache key (#4)', () => {
  const cfg = {
    qualities: { webp: 50, avif: 30 },
    effort: { webp: 1, avif: 1 },
    deviceSizes: [100, 200],
    concurrency: 4,
  };

  it('U12 does not depend on key order', () => {
    const reversed = {
      concurrency: 4,
      deviceSizes: [100, 200],
      effort: { avif: 1, webp: 1 },
      qualities: { avif: 30, webp: 50 },
    };
    expect(getConfigHash(reversed)).toBe(getConfigHash(cfg));
  });

  it('U13 ignores concurrency, which does not change the output', () => {
    expect(getConfigHash({ ...cfg, concurrency: 1 })).toBe(getConfigHash(cfg));
  });

  it('U14 defaults the salt to the package version', () => {
    expect(getConfigHash(cfg)).toBe(getConfigHash(cfg, pkg.version));
    expect(getConfigHash(cfg, '0.0.0-other')).not.toBe(getConfigHash(cfg));
  });

  it('still distinguishes array order, which changes the output', () => {
    expect(getConfigHash({ ...cfg, deviceSizes: [200, 100] })).not.toBe(getConfigHash(cfg));
  });
});
