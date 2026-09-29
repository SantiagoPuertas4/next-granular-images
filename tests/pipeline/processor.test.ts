import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { processImage } from '../../src/cli/core/processor';
import { initializeQueue } from '../../src/cli/core/queue';
import { makeTempDir } from '../helpers/tmp';
import { fastConfig, makeGif } from '../helpers/images';

const HASH = 'aaaaaaaa-bbbbbbbb';

let dir: string;
let out: string;

beforeEach(() => {
  dir = makeTempDir();
  out = path.join(dir, 'out');
  initializeQueue(fastConfig());
});

describe('processImage', () => {
  it('P8 passes GIFs through untouched (#6)', async () => {
    const src = await makeGif(path.join(dir, 'anim.gif'));
    const result = await processImage(src, out, HASH, fastConfig());

    expect(result.variants.avif).toEqual({});
    expect(result.variants.webp).toEqual({});
    expect(fs.readFileSync(result.variants.original)).toEqual(fs.readFileSync(src));
    expect(result.originalWidth).toBe(32);
    expect(fs.readdirSync(out)).toEqual([path.basename(result.variants.original)]);
    expect((await sharp(result.variants.original).metadata()).format).toBe('gif');
  });
});
