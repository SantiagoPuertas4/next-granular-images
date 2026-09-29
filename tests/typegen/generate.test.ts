import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/cli/commands/generate';
import { optimize } from '../../src/cli/commands/optimize';
import { makeJpeg } from '../helpers/images';
import { captureLogs, makeProject } from '../helpers/project';
import { compile } from '../helpers/compile';

const genFile = (typesDir: string) => path.join(typesDir, 'images', 'images.gen.ts');

describe('generate (in-process)', () => {
  it('T9 skips a corrupt meta file, exports the rest and exits 1 (#3, R4-002)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    await makeJpeg(path.join(project.imagesDir, 'x.jpg'), { color: { r: 1, g: 2, b: 3 } });
    captureLogs();
    await optimize({}, { cwd: project.root });

    const xMeta = (await project.files(project.outputDir)).find((f) =>
      /[\\/]x-[0-9a-f-]+\.meta\.json$/.test(f)
    )!;
    fs.writeFileSync(xMeta, '{ not json');
    fs.rmSync(project.typesDir, { recursive: true });

    const logs = captureLogs();
    await expect(generate({}, { cwd: project.root })).rejects.toMatchObject({ code: 1 });

    expect(logs.warnings()).toMatch(/x\.jpg.*not valid JSON/);
    expect(logs.errors()).toContain('1 image(s) could not be generated');
    const gen = genFile(project.typesDir);
    expect(compile([gen]).exportsOf(gen)).toEqual(['a', 'a_blur']);
  });

  it.each([
    ['corrupt', (meta: string) => fs.writeFileSync(meta, '{ not json')],
    ['outdated', (meta: string) => fs.writeFileSync(meta, JSON.stringify({ version: 1, variants: {} }))],
    ['missing', (meta: string) => fs.rmSync(meta)],
  ])(
    'keeps the existing images.gen.ts and exits 1 when a meta is %s (R4-002)',
    async (_kind, breakMeta) => {
      const project = makeProject();
      await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
      await makeJpeg(path.join(project.imagesDir, 'x.jpg'), { color: { r: 1, g: 2, b: 3 } });
      await makeJpeg(path.join(project.publicDir, 'other', 'b.jpg'), { color: { r: 4, g: 5, b: 6 } });
      captureLogs();
      await optimize({}, { cwd: project.root });
      const gen = genFile(project.typesDir);
      const before = fs.readFileSync(gen, 'utf8');
      const otherGen = path.join(project.typesDir, 'other', 'images.gen.ts');
      fs.writeFileSync(otherGen, '// stale content\n');

      const xMeta = (await project.files(project.outputDir)).find((f) =>
        /[\\/]x-[0-9a-f-]+\.meta\.json$/.test(f)
      )!;
      breakMeta(xMeta);

      const logs = captureLogs();
      await expect(generate({}, { cwd: project.root })).rejects.toMatchObject({ code: 1 });
      expect(logs.errors()).toContain('could not be generated');
      // The folder with the broken image keeps its file, x included.
      expect(fs.readFileSync(gen, 'utf8')).toBe(before);
      // Healthy folders are still regenerated.
      expect(fs.readFileSync(otherGen, 'utf8')).toContain('export const b =');
    }
  );

  it('exits 1 without touching images.gen.ts when no meta file is found (R4-002)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });
    const gen = genFile(project.typesDir);
    const before = fs.readFileSync(gen, 'utf8');
    for (const f of await project.files(project.outputDir)) {
      if (f.endsWith('.meta.json')) fs.rmSync(f);
    }

    const logs = captureLogs();
    await expect(generate({ images: true }, { cwd: project.root })).rejects.toMatchObject({
      code: 1,
    });
    expect(logs.errors()).toContain('No optimized images found');
    expect(fs.readFileSync(gen, 'utf8')).toBe(before);
  });

  it('finds output written by optimize --fast even though its config hash differs (#3)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero.jpg'));
    captureLogs();
    await optimize({ fast: true }, { cwd: project.root });
    fs.rmSync(project.typesDir, { recursive: true });

    await generate({}, { cwd: project.root });

    const gen = genFile(project.typesDir);
    expect(compile([gen]).exportsOf(gen)).toEqual(['hero', 'hero_blur']);
    expect(fs.readFileSync(gen, 'utf8')).not.toContain('.avif');
  });

  it('warns about images that were never optimized', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });
    await makeJpeg(path.join(project.imagesDir, 'new.jpg'), { color: { r: 9, g: 9, b: 9 } });

    const logs = captureLogs();
    await expect(generate({ images: true }, { cwd: project.root })).rejects.toMatchObject({
      code: 1,
    });
    expect(logs.warnings()).toContain('No optimized output for');
    expect(logs.warnings()).toContain('new.jpg');
  });
});
