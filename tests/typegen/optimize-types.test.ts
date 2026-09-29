import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { optimize } from '../../src/cli/commands/optimize';
import { makeJpeg } from '../helpers/images';
import { captureLogs, makeProject } from '../helpers/project';
import { compile } from '../helpers/compile';

describe('optimize type generation', () => {
  it('T8 removes generated files for images that no longer exist (#12)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    await makeJpeg(path.join(project.imagesDir, 'sub', 'b.jpg'), { color: { r: 1, g: 2, b: 3 } });
    captureLogs();
    await optimize({}, { cwd: project.root });

    const rootGen = path.join(project.typesDir, 'images', 'images.gen.ts');
    const subGen = path.join(project.typesDir, 'images', 'sub', 'images.gen.ts');
    expect(fs.existsSync(subGen)).toBe(true);

    fs.rmSync(path.join(project.imagesDir, 'sub'), { recursive: true });
    await optimize({}, { cwd: project.root });

    expect(fs.existsSync(subGen)).toBe(false);
    expect(fs.existsSync(path.dirname(subGen))).toBe(false);
    expect(fs.existsSync(path.join(project.typesDir, 'config.d.ts'))).toBe(true);
    expect(compile([rootGen]).exportsOf(rootGen)).toEqual(['a', 'a_blur']);
  });

  it('leaves files it does not own alone', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    const userFile = path.join(project.typesDir, 'old', 'notes.ts');
    fs.mkdirSync(path.dirname(userFile), { recursive: true });
    fs.writeFileSync(userFile, 'export {};');
    captureLogs();
    await optimize({}, { cwd: project.root });
    expect(fs.existsSync(userFile)).toBe(true);
  });
});
