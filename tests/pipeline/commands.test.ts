import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { clean } from '../../src/cli/commands/clean';
import { init } from '../../src/cli/commands/init';
import { optimize } from '../../src/cli/commands/optimize';
import { generate } from '../../src/cli/commands/generate';
import { CliExit } from '../../src/cli/utils/errors';
import { loadConfig } from '../../src/cli/utils/config-loader';
import { makeJpeg } from '../helpers/images';
import { DEFAULT_PROJECT_CONFIG, captureLogs, makeProject } from '../helpers/project';
import { makeTempDir } from '../helpers/tmp';
import { importGenerated } from '../helpers/compile';

const exists = (...p: string[]) => fs.existsSync(path.join(...p));

describe('init (in-process)', () => {
  it('writes a loadable config once and keeps an existing one', async () => {
    const dir = makeTempDir();
    captureLogs();
    await init({}, { cwd: dir });
    const configPath = path.join(dir, 'next-granular-images.config.ts');
    const config = await loadConfig(dir);
    expect(config.qualities).toEqual({ avif: 60, webp: 85 });
    expect(config.paths.input).toBe('src/assets');

    fs.appendFileSync(configPath, '// user edit\n');
    const logs = captureLogs();
    await init({}, { cwd: dir });
    expect(fs.readFileSync(configPath, 'utf8')).toContain('// user edit');
    expect(logs.warnings()).toContain('already exists');
  });

  it.each([
    ['fast', false],
    ['dev', true],
  ])('init --build %s runs optimize in that mode', async (mode, expectAvif) => {
    const dir = makeTempDir();
    await makeJpeg(path.join(dir, 'src', 'assets', 'a.jpg'), { width: 120, height: 60 });
    captureLogs();
    await init({ build: mode }, { cwd: dir });
    const out = path.join(dir, 'public', 'next-granular-images');
    const files = fs.readdirSync(out, { recursive: true }).map(String);
    expect(files.some((f) => f.endsWith('.webp'))).toBe(true);
    expect(files.some((f) => f.endsWith('.avif'))).toBe(expectAvif);
  });
});

describe('optimize and generate exits (in-process)', () => {
  it('throws CliExit(1) instead of exiting when the input dir is missing', async () => {
    const project = makeProject({
      ...DEFAULT_PROJECT_CONFIG,
      paths: { ...DEFAULT_PROJECT_CONFIG.paths, input: 'nope' },
    });
    captureLogs();
    const err = await optimize({}, { cwd: project.root }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CliExit);
    expect((err as CliExit).code).toBe(1);
  });

  it('generate throws CliExit(1) when nothing was optimized', async () => {
    const project = makeProject();
    const logs = captureLogs();
    await expect(generate({}, { cwd: project.root })).rejects.toMatchObject({ code: 1 });
    expect(logs.errors()).toContain('Output directory not found');
  });

  it('optimize --dev halves the qualities and prints a savings report', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    const logs = captureLogs();
    await optimize({ dev: true, report: true }, { cwd: project.root });
    expect(logs.warnings()).toContain('Dev mode');
    expect(logs.text()).toContain('Savings Report');
    expect(logs.text()).toContain('Processed: 1');
  });

  it('copies SVGs through with their real size when they are not excluded (R4-001)', async () => {
    const project = makeProject({ ...DEFAULT_PROJECT_CONFIG, exclusions: [] });
    const svg = (attrs: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}/>`;
    fs.writeFileSync(path.join(project.imagesDir, 'logo.SVG'), svg('viewBox="0 0 120 60"'));
    fs.writeFileSync(path.join(project.imagesDir, 'icon.svg'), svg('width="4" height="8"'));
    fs.writeFileSync(path.join(project.imagesDir, 'bare.svg'), svg(''));
    const logs = captureLogs();
    await optimize({}, { cwd: project.root });
    const files = await project.files(project.outputDir);
    expect(files.some((f) => /logo-[0-9a-f-]+\.SVG$/.test(f))).toBe(true);

    const gen = await importGenerated<Record<string, { width: number; height: number }>>(
      path.join(project.typesDir, 'images', 'images.gen.ts')
    );
    expect([gen.logo.width, gen.logo.height]).toEqual([120, 60]);
    expect([gen.icon.width, gen.icon.height]).toEqual([4, 8]);
    expect([gen.bare.width, gen.bare.height]).toEqual([0, 0]);
    expect(logs.warnings()).toContain('Could not read the size');
  });

  it('warns about orphaned files in the output dir', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    fs.mkdirSync(project.outputDir, { recursive: true });
    fs.writeFileSync(path.join(project.outputDir, 'stray.txt'), 'x');
    const logs = captureLogs();
    await optimize({}, { cwd: project.root });
    expect(logs.warnings()).toContain('orphaned files');
    expect(logs.text()).toContain('stray.txt');
  });
});

describe('clean (in-process)', () => {
  const optimized = async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });
    return project;
  };

  it('dryRun reports but deletes nothing', async () => {
    const project = await optimized();
    const logs = captureLogs();
    await clean({ all: true, dryRun: true }, { cwd: project.root });
    expect(logs.text()).toContain('Would delete');
    expect(fs.existsSync(project.outputDir)).toBe(true);
    expect(fs.existsSync(project.typesDir)).toBe(true);
    expect(exists(project.root, 'next-granular-images.config.js')).toBe(true);
  });

  it('--breakpoints removes only config.d.ts', async () => {
    const project = await optimized();
    captureLogs();
    await clean({ breakpoints: true }, { cwd: project.root });
    expect(exists(project.typesDir, 'config.d.ts')).toBe(false);
    expect(exists(project.typesDir, 'images', 'images.gen.ts')).toBe(true);
    expect(fs.existsSync(project.outputDir)).toBe(true);
  });

  it('refuses to delete a types dir outside next-granular-images paths', async () => {
    const project = makeProject({
      ...DEFAULT_PROJECT_CONFIG,
      paths: { ...DEFAULT_PROJECT_CONFIG.paths, types: 'src/types' },
    });
    fs.mkdirSync(path.join(project.root, 'src', 'types'), { recursive: true });
    const logs = captureLogs();
    await clean({}, { cwd: project.root });
    expect(exists(project.root, 'src', 'types')).toBe(true);
    expect(logs.warnings()).toContain('Safety check failed');
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'module.exports = { qualities: { webp: 500 }, effort: { webp: 4 } };\n'],
  ])('falls back to the default paths when the config is %s (R4-004)', async (_kind, config) => {
    const dir = makeTempDir();
    if (config) fs.writeFileSync(path.join(dir, 'next-granular-images.config.js'), config);
    const output = path.join(dir, 'public', 'next-granular-images');
    const types = path.join(dir, 'src', 'generated', 'next-granular-images');
    fs.mkdirSync(path.join(output, 'images'), { recursive: true });
    fs.writeFileSync(path.join(output, 'images', 'a.webp'), 'x');
    fs.mkdirSync(types, { recursive: true });
    fs.writeFileSync(path.join(types, 'config.d.ts'), '');
    fs.writeFileSync(path.join(dir, 'public', 'keep.png'), 'x');

    const logs = captureLogs();
    await expect(clean({}, { cwd: dir })).resolves.toBeUndefined();
    expect(logs.warnings()).toContain('Could not load configuration');
    expect(logs.warnings()).toContain(
      'default paths: output "public/next-granular-images", types "src/generated/next-granular-images"'
    );
    expect(fs.existsSync(output)).toBe(false);
    expect(fs.existsSync(types)).toBe(false);
    expect(exists(dir, 'public', 'keep.png')).toBe(true);
  });
});
