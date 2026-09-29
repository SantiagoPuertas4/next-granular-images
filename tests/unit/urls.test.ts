import path from 'path';
import { describe, expect, it } from 'vitest';
import { buildSrcSet, toPublicUrl } from '../../src/cli/core/urls';
import { ConfigError, assertOutputInsidePublic } from '../../src/cli/core/validate';

const root = path.resolve('project');
const publicRoot = path.join(root, 'public');
const inPublic = (...p: string[]) => path.join(publicRoot, ...p);

describe('toPublicUrl', () => {
  it('U23 maps a file under public/ to its served URL', () => {
    expect(toPublicUrl(inPublic('next-granular-images', 'a', 'x.webp'), publicRoot)).toBe(
      '/next-granular-images/a/x.webp'
    );
  });

  it('U24 uses the project public dir, not the first "public" segment in the path (#8)', () => {
    const nestedRoot = path.resolve('home', 'u', 'public', 'app');
    const nestedPublic = path.join(nestedRoot, 'public');
    expect(toPublicUrl(path.join(nestedPublic, 'ngi', 'x.webp'), nestedPublic)).toBe('/ngi/x.webp');
  });

  it('U25 throws instead of leaking a filesystem path for files outside public (#8)', () => {
    const outside = path.join(root, 'static', 'ngi', 'x.webp');
    expect(() => toPublicUrl(outside, publicRoot)).toThrow(/not inside the public directory/);
    expect(() => toPublicUrl(path.join(root, 'publicity', 'x.webp'), publicRoot)).toThrow();
  });

  it('URL-encodes each segment so names with spaces stay valid in a srcset', () => {
    expect(toPublicUrl(inPublic('ngi', 'my photo#1.webp'), publicRoot)).toBe(
      '/ngi/my%20photo%231.webp'
    );
  });
});

describe('assertOutputInsidePublic (#8)', () => {
  it('accepts a folder inside public and rejects anything else with a clear error', () => {
    expect(() => assertOutputInsidePublic(root, 'public/next-granular-images')).not.toThrow();
    for (const output of ['static/ngi', 'public', '../public/ngi']) {
      expect(() => assertOutputInsidePublic(root, output)).toThrow(ConfigError);
    }
    expect(() => assertOutputInsidePublic(root, 'static/ngi')).toThrow(/inside the Next.js public/);
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
