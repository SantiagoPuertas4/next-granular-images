import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildSrcSet, toPublicUrl } from '../../src/cli/core/urls';

const root = path.resolve('project');
const publicRoot = path.join(root, 'public');
const inPublic = (...p: string[]) => path.join(publicRoot, ...p);

describe('toPublicUrl', () => {
  it('U23 maps a file under public/ to its served URL', () => {
    expect(toPublicUrl(inPublic('next-granular-images', 'a', 'x.webp'), publicRoot)).toBe(
      '/next-granular-images/a/x.webp'
    );
  });
});

describe('buildSrcSet', () => {
  it('U26 lists variants by ascending width and returns undefined when empty', () => {
    const variants: Record<number, string> = {
      640: inPublic('ngi', 'a-640.webp'),
      16: inPublic('ngi', 'a-16.webp'),
    };
    expect(buildSrcSet(variants, publicRoot)).toBe('/ngi/a-16.webp 16w, /ngi/a-640.webp 640w');
    expect(buildSrcSet({}, publicRoot)).toBeUndefined();
    expect(buildSrcSet(undefined, publicRoot)).toBeUndefined();
  });
});
