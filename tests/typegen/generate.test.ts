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
  it('T9 skips a corrupt meta file with a warning and still exports the rest (#3)', async () => {
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
    await expect(generate({}, { cwd: project.root })).resolves.toBeUndefined();

    expect(logs.warnings()).toMatch(/x\.jpg.*not valid JSON/);
    const gen = genFile(project.typesDir);
    expect(compile([gen]).exportsOf(gen)).toEqual(['a', 'a_blur']);
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
    await generate({ images: true }, { cwd: project.root });
    expect(logs.warnings()).toContain('No optimized output for');
    expect(logs.warnings()).toContain('new.jpg');
  });
});
