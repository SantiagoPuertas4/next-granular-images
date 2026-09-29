import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { cleanOldVersions, getFiles } from '../../src/cli/utils/fs-helpers';
import { makeTempDir, writeFile } from '../helpers/tmp';

const CUR = 'aaaaaaaa-11111111';
const OLD = 'bbbbbbbb-22222222';

describe('cleanOldVersions', () => {
  it('U18 removes only other versions of the same image', async () => {
    const dir = makeTempDir();
    writeFile(path.join(dir, `hero-${CUR}`, 'x.webp'));
    writeFile(path.join(dir, `hero-${CUR}.meta.json`), '{}');
    writeFile(path.join(dir, `hero-${OLD}`, 'x.webp'));
    writeFile(path.join(dir, `hero-${OLD}.meta.json`), '{}');
    writeFile(path.join(dir, `hero-dark-${OLD}`, 'x.webp'));

    await cleanOldVersions(dir, 'hero', CUR);

    expect(fs.readdirSync(dir).sort()).toEqual(
      [`hero-${CUR}`, `hero-${CUR}.meta.json`, `hero-dark-${OLD}`].sort()
    );
  });

  it('U19 ignores a directory that does not exist', async () => {
    const dir = makeTempDir();
    await expect(cleanOldVersions(path.join(dir, 'missing'), 'hero', CUR)).resolves.toBeUndefined();
  });
});

describe('getFiles', () => {
  it('U20 lists files recursively as absolute paths, without directories', async () => {
    const dir = makeTempDir();
    writeFile(path.join(dir, 'a', 'b', 'c.png'));
    writeFile(path.join(dir, 'd.png'));
    fs.mkdirSync(path.join(dir, 'e'));

    const files = await getFiles(dir);
    expect(files.sort()).toEqual(
      [path.join(dir, 'a', 'b', 'c.png'), path.join(dir, 'd.png')].sort()
    );
    files.forEach((f) => expect(path.isAbsolute(f)).toBe(true));
  });
});
