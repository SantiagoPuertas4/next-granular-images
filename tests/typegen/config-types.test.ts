import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { generateConfigTypes } from '../../src/cli/core/generator';
import { compile } from '../helpers/compile';
import { makeTempDir } from '../helpers/tmp';

const img = `{ src: '/a.jpg', width: 1, height: 1, variants: {} }`;

describe('generated config.d.ts', () => {
  it('T7 narrows ArtDirectionSrc to the configured breakpoint names', async () => {
    const dir = makeTempDir();
    await generateConfigTypes(dir, { sm: 640, '2xl': 1536 });
    const configTypes = path.join(dir, 'config.d.ts');

    const valid = path.join(dir, 'valid.ts');
    fs.writeFileSync(
      valid,
      `import type { ArtDirectionSrc } from 'next-granular-images';\n` +
        `export const src: ArtDirectionSrc = { default: ${img}, sm: ${img}, '2xl': ${img} };\n`
    );
    expect(compile([configTypes, valid]).diagnostics).toEqual([]);

    const invalid = path.join(dir, 'invalid.ts');
    fs.writeFileSync(
      invalid,
      `import type { ArtDirectionSrc } from 'next-granular-images';\n` +
        `export const src: ArtDirectionSrc = { default: ${img}, foo: ${img} };\n`
    );
    const { diagnostics } = compile([configTypes, invalid]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatch(/'foo' does not exist in type/);
  });

  it('without config.d.ts any breakpoint name is accepted', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'free.ts');
    fs.writeFileSync(
      file,
      `import type { ArtDirectionSrc } from 'next-granular-images';\n` +
        `export const src: ArtDirectionSrc = { default: ${img}, foo: ${img} };\n`
    );
    expect(compile([file]).diagnostics).toEqual([]);
  });
});
