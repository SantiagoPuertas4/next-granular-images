import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  type GeneratedImageEntry,
  generateTypeScriptFile,
} from '../../src/cli/core/generator';
import { compile, importGenerated } from '../helpers/compile';
import { makeTempDir } from '../helpers/tmp';

const setup = () => {
  const root = makeTempDir();
  const publicRoot = path.join(root, 'public');
  const out = path.join(publicRoot, 'next-granular-images');
  const typesDir = path.join(root, 'types');
  return { root, publicRoot, out, typesDir };
};

const entry = (
  out: string,
  name: string,
  {
    relativePath = `${name}.jpg`,
    avif = true,
    original = path.join(out, `${name}-h.jpg`),
    blurDataURL = 'data:image/jpeg;base64,AAAA',
  }: { relativePath?: string; avif?: boolean; original?: string; blurDataURL?: string } = {}
): GeneratedImageEntry => ({
  name,
  relativePath,
  data: {
    originalWidth: 800,
    originalHeight: 400,
    hasAlpha: false,
    dominantColor: 'rgb(200,30,30)',
    blurDataURL,
    variants: {
      avif: avif ? { 16: path.join(out, `${name}-h-16.avif`), 400: path.join(out, `${name}-h-400.avif`) } : {},
      webp: { 16: path.join(out, `${name}-h-16.webp`), 400: path.join(out, `${name}-h-400.webp`) },
      original,
    },
  },
});

/** Generates one images.gen.ts from entries built against a fresh temp project. */
const generate = async (build: (out: string) => GeneratedImageEntry[]) => {
  const ctx = setup();
  await generateTypeScriptFile(ctx.typesDir, build(ctx.out), { publicRoot: ctx.publicRoot });
  return { ...ctx, gen: path.join(ctx.typesDir, 'images.gen.ts') };
};

describe('generated images.gen.ts', () => {
  it('T4 escapes names, comments and string values so the file compiles and round-trips (#7)', async () => {
    const ctx = setup();
    const blur = 'data:image/jpeg;base64,"quoted"\\back\\slash';
    const weirdOriginal = path.join(ctx.out, `it's "x".jpg`);
    await generateTypeScriptFile(
      ctx.typesDir,
      [entry(ctx.out, "it's", { relativePath: 'a*/b/it\'s.jpg', original: weirdOriginal, blurDataURL: blur })],
      { publicRoot: ctx.publicRoot }
    );
    const gen = path.join(ctx.typesDir, 'images.gen.ts');

    const { diagnostics, exportsOf } = compile([gen]);
    expect(diagnostics).toEqual([]);
    expect(exportsOf(gen)).toEqual(['it_s', 'it_s_blur']);

    const mod = await importGenerated<Record<string, { src: string } | string>>(gen);
    expect(mod.it_s_blur).toBe(blur);
    expect((mod.it_s as { src: string }).src).toBe(
      `/next-granular-images/${encodeURIComponent(`it's "x".jpg`)}`
    );
  });

  it('T5 never emits reserved words as export names (#7)', async () => {
    const { gen } = await generate((out) => [entry(out, 'class'), entry(out, 'default')]);
    const { diagnostics, exportsOf } = compile([gen]);
    expect(diagnostics).toEqual([]);
    expect(new Set(exportsOf(gen)).size).toBe(4);
  });

  it('T6 disambiguates names that sanitize to the same identifier (#7)', async () => {
    const { gen } = await generate((out) => [
      entry(out, 'hero-image'),
      entry(out, 'hero_image'),
      entry(out, 'hero_image_blur'),
    ]);
    const { diagnostics, exportsOf } = compile([gen]);
    expect(diagnostics).toEqual([]);
    const names = exportsOf(gen);
    expect(names).toHaveLength(6);
    expect(new Set(names).size).toBe(6);
    expect(fs.readFileSync(gen, 'utf8')).toContain('Generated from hero-image.jpg */\nexport const hero_image = ');
  });
});
