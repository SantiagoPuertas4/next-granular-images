import path from 'path';
import { describe, expect, it } from 'vitest';
import { getOutputPath, getRelativePath, normalizePath } from '../../src/cli/utils/paths';

describe('path utils', () => {
  it('U16 normalizes platform separators to forward slashes', () => {
    expect(normalizePath(path.join('a', 'b', 'c'))).toBe('a/b/c');
    const root = path.resolve('root');
    expect(getRelativePath(root, path.join(root, 'sub', 'x.png'))).toBe('sub/x.png');
  });

  it.each([
    ['', 'x-h'],
    ['webp', 'x-h.webp'],
    ['.webp', 'x-h.webp'],
  ])('U17 builds the output path for extension %j', (ext, file) => {
    const input = path.resolve('in');
    const out = path.resolve('out');
    expect(getOutputPath(path.join(input, 'sub', 'x.png'), input, out, 'h', ext)).toBe(
      path.join(out, 'sub', file)
    );
  });
});
