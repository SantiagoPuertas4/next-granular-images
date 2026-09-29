import fs from 'fs';
import path from 'path';
import createJiti from 'jiti';
import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/cli/core/validate';
import { CLI_ESM, runCli } from '../helpers/cli';
import { makeJpeg } from '../helpers/images';
import { DEFAULT_PROJECT_CONFIG, makeProject } from '../helpers/project';
import { getFiles } from '../../src/cli/utils/fs-helpers';
import { makeTempDir } from '../helpers/tmp';

const listFiles = async (dir: string) => (fs.existsSync(dir) ? getFiles(dir) : []);

describe('CLI', () => {
  it('C1 init writes a valid .ts config and is idempotent', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture"}');

    const first = runCli(dir, ['init']);
    expect(first.status).toBe(0);
    const configPath = path.join(dir, 'next-granular-images.config.ts');
    const content = fs.readFileSync(configPath, 'utf8');
    const loaded = createJiti(__filename, { cache: false, requireCache: false })(configPath);
    expect(() => validateConfig(loaded.default ?? loaded)).not.toThrow();

    const second = runCli(dir, ['init']);
    expect(second.status).toBe(0);
    expect(second.stderr).toContain('already exists');
    expect(fs.readFileSync(configPath, 'utf8')).toBe(content);
  });

  it('C2 init --build fast optimizes src/assets with WebP only', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture"}');
    await makeJpeg(path.join(dir, 'src', 'assets', 'a.jpg'), { width: 300, height: 150 });

    const res = runCli(dir, ['init', '--build', 'fast']);
    expect(res.status).toBe(0);
    const out = await listFiles(path.join(dir, 'public', 'next-granular-images'));
    expect(out.some((f) => f.endsWith('.webp'))).toBe(true);
    expect(out.some((f) => f.endsWith('.avif'))).toBe(false);
  });

  it('C3 optimize processes every image and writes types', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    await makeJpeg(path.join(project.imagesDir, 'b.jpg'), { color: { r: 1, g: 2, b: 3 } });

    const res = runCli(project.root, ['optimize']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Processed: 2');
    const out = await listFiles(project.outputDir);
    expect(out.filter((f) => f.endsWith('.meta.json'))).toHaveLength(2);
    expect(out.some((f) => f.endsWith('.avif'))).toBe(true);
    expect(out.some((f) => f.endsWith('.webp'))).toBe(true);
    expect(fs.existsSync(path.join(project.typesDir, 'config.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(project.typesDir, 'images', 'images.gen.ts'))).toBe(true);
  });

  it('C4 exits non-zero when an image fails, but keeps the good output (#2)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'good.jpg'));
    fs.writeFileSync(path.join(project.imagesDir, 'bad.png'), 'not an image');

    const res = runCli(project.root, ['optimize']);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('bad.png');
    const out = await listFiles(project.outputDir);
    expect(out.some((f) => /good-[0-9a-f]{8}-[0-9a-f]{8}\.meta\.json$/.test(f))).toBe(true);
    const gen = fs.readFileSync(path.join(project.typesDir, 'images', 'images.gen.ts'), 'utf8');
    expect(gen).toContain('export const good =');
  });

  it('C5 without a config file, optimize stops and points to init (#1)', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture"}');
    await makeJpeg(path.join(dir, 'public', 'a.jpg'));

    const res = runCli(dir, ['optimize']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('No next-granular-images.config.ts');
    expect(res.stderr).toContain('npx next-granular-images init');
    expect(res.stderr).not.toContain('Fatal Error');
    expect(fs.existsSync(path.join(dir, 'public', 'next-granular-images'))).toBe(false);
  });

  it('C6 reports an invalid config value and exits 1', () => {
    const project = makeProject({ ...DEFAULT_PROJECT_CONFIG, qualities: { avif: 30, webp: 150 } });
    const res = runCli(project.root, ['optimize']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('qualities.webp must be an integer between 1 and 100');
  });

  it('C7 fails when the input directory is missing', () => {
    const project = makeProject({
      ...DEFAULT_PROJECT_CONFIG,
      paths: { ...DEFAULT_PROJECT_CONFIG.paths, input: 'missing' },
    });
    const res = runCli(project.root, ['optimize']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Input directory not found');
  });

  it('C8 refuses duplicate content and duplicate names', async () => {
    const dupContent = makeProject();
    const a = await makeJpeg(path.join(dupContent.imagesDir, 'a.jpg'));
    fs.copyFileSync(a, path.join(dupContent.imagesDir, 'b.jpg'));
    const res1 = runCli(dupContent.root, ['optimize']);
    expect(res1.status).toBe(1);
    expect(res1.stderr).toContain('Duplicate image content');

    const dupName = makeProject();
    await makeJpeg(path.join(dupName.imagesDir, 'hero.jpg'));
    await makeJpeg(path.join(dupName.imagesDir, 'hero.jpeg'), { color: { r: 5, g: 5, b: 5 } });
    const res2 = runCli(dupName.root, ['optimize']);
    expect(res2.status).toBe(1);
    expect(res2.stderr).toContain('Duplicate image names');
  });

  it.each([[['foo']], [[]]])('C9 rejects an unknown or missing command %j', (args) => {
    const res = runCli(makeTempDir(), args);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('Unknown command');
  });

  it('C10 optimize --fast skips AVIF', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    const res = runCli(project.root, ['optimize', '--fast']);
    expect(res.status).toBe(0);
    const out = await listFiles(project.outputDir);
    expect(out.some((f) => f.endsWith('.webp'))).toBe(true);
    expect(out.some((f) => f.endsWith('.avif'))).toBe(false);
  });

  it('C11 generate after optimize --fast restores the image types (#3)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero.jpg'));
    expect(runCli(project.root, ['optimize', '--fast']).status).toBe(0);
    fs.rmSync(project.typesDir, { recursive: true });

    const res = runCli(project.root, ['generate']);
    expect(res.status).toBe(0);
    const gen = fs.readFileSync(path.join(project.typesDir, 'images', 'images.gen.ts'), 'utf8');
    expect(gen).toContain('export const hero =');
  });

  it('C12 generate fails when nothing was optimized yet', () => {
    const project = makeProject();
    const res = runCli(project.root, ['generate']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Output directory not found');
  });

  it('C13 generate --breakpoints only writes config.d.ts', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    expect(runCli(project.root, ['optimize']).status).toBe(0);
    fs.rmSync(project.typesDir, { recursive: true });

    expect(runCli(project.root, ['generate', '--breakpoints']).status).toBe(0);
    const types = await listFiles(project.typesDir);
    expect(types.map((f) => path.basename(f))).toEqual(['config.d.ts']);
  });

  it('C14 clean removes the output and types dirs but keeps the config and sources', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    expect(runCli(project.root, ['optimize']).status).toBe(0);
    const configFile = path.join(project.root, 'next-granular-images.config.js');

    expect(runCli(project.root, ['clean']).status).toBe(0);
    expect(fs.existsSync(project.outputDir)).toBe(false);
    expect(fs.existsSync(project.typesDir)).toBe(false);
    expect(fs.existsSync(configFile)).toBe(true);
    expect(fs.existsSync(path.join(project.imagesDir, 'a.jpg'))).toBe(true);
  });

  it('C14b clean --all also removes a .js config (#10)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    expect(runCli(project.root, ['optimize']).status).toBe(0);

    expect(runCli(project.root, ['clean', '--all']).status).toBe(0);
    expect(fs.existsSync(project.outputDir)).toBe(false);
    expect(fs.existsSync(project.typesDir)).toBe(false);
    expect(fs.existsSync(path.join(project.root, 'next-granular-images.config.js'))).toBe(false);
  });

  it.each(['--image', '--images'])(
    'C15 clean %s removes every images.gen.ts, root included, and keeps config.d.ts (#10)',
    async (flag) => {
      const project = makeProject({
        ...DEFAULT_PROJECT_CONFIG,
        paths: { ...DEFAULT_PROJECT_CONFIG.paths, input: 'public/images' },
      });
      await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
      await makeJpeg(path.join(project.imagesDir, 'sub', 'b.jpg'), { color: { r: 1, g: 2, b: 3 } });
      expect(runCli(project.root, ['optimize']).status).toBe(0);
      expect(fs.existsSync(path.join(project.typesDir, 'images.gen.ts'))).toBe(true);

      expect(runCli(project.root, ['clean', flag]).status).toBe(0);
      const left = (await listFiles(project.typesDir)).map((f) => path.basename(f));
      expect(left).toEqual(['config.d.ts']);
      expect(fs.existsSync(project.outputDir)).toBe(false);
    }
  );

  it('C17 clean still runs with an invalid config and explains why (#10)', () => {
    const project = makeProject({ ...DEFAULT_PROJECT_CONFIG, qualities: { avif: 30, webp: 0 } });
    const res = runCli(project.root, ['clean']);
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('Could not load configuration');
    expect(res.stderr).toContain('qualities.webp');
  });

  it('C18a an unknown LOG_LEVEL does not hide errors (#14)', () => {
    const project = makeProject({ ...DEFAULT_PROJECT_CONFIG, qualities: { avif: 30, webp: 0 } });
    const res = runCli(project.root, ['optimize'], { env: { LOG_LEVEL: 'bogus' } });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('qualities.webp');
  });

  it('C18b the ESM entry point loads the config and optimizes (#16)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
    const res = runCli(project.root, ['optimize'], { entry: CLI_ESM });
    expect(res.stderr).not.toContain('__filename');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Processed: 1');
  });

  it.each(['optimize', 'generate'])(
    'C19 %s refuses a paths.output outside public/ before touching it (R3-002)',
    async (command) => {
      const project = makeProject({
        ...DEFAULT_PROJECT_CONFIG,
        paths: { ...DEFAULT_PROJECT_CONFIG.paths, output: 'assets-out' },
      });
      await makeJpeg(path.join(project.imagesDir, 'a.jpg'));
      const outside = path.join(project.root, 'assets-out');
      if (command === 'generate') fs.mkdirSync(outside);

      const res = runCli(project.root, [command]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('must be a folder inside the Next.js public directory');
      expect(await listFiles(outside)).toEqual([]);
      expect(fs.existsSync(project.typesDir)).toBe(false);
    }
  );

  it('C16 clean refuses to delete an output dir without next-granular-images in its path', () => {
    const project = makeProject({
      ...DEFAULT_PROJECT_CONFIG,
      paths: { ...DEFAULT_PROJECT_CONFIG.paths, output: 'public/out' },
    });
    const out = path.join(project.root, 'public', 'out');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'keep.txt'), 'x');

    const res = runCli(project.root, ['clean']);
    expect(res.status).toBe(0);
    expect(fs.existsSync(path.join(out, 'keep.txt'))).toBe(true);
    expect(res.stderr).toContain('Safety check failed');
  });
});
