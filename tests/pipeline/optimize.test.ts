import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { optimize } from '../../src/cli/commands/optimize';
import { makeJpeg } from '../helpers/images';
import { DEFAULT_PROJECT_CONFIG, captureLogs, makeProject } from '../helpers/project';

const metaFiles = (files: string[]) => files.filter((f) => f.endsWith('.meta.json'));
const META_RE = /hero-([0-9a-f]{8})-([0-9a-f]{8})\.meta\.json$/;

describe('optimize (in-process)', () => {
  it('P11 writes a meta file named <name>-<fileHash>-<configHash>.meta.json', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero.jpg'));
    captureLogs();

    await optimize({}, { cwd: project.root });

    const metas = metaFiles(await project.files(project.outputDir));
    expect(metas).toHaveLength(1);
    expect(path.relative(project.outputDir, metas[0]).split(path.sep).join('/')).toMatch(
      /^images\/hero-[0-9a-f]{8}-[0-9a-f]{8}\.meta\.json$/
    );
    expect(JSON.parse(fs.readFileSync(metas[0], 'utf8')).originalWidth).toBe(800);
  });

  it('P12 keeps absolute local paths out of the publicly served meta file (#9)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });

    const [meta] = metaFiles(await project.files(project.outputDir));
    const strings: string[] = [];
    JSON.parse(fs.readFileSync(meta, 'utf8'), (_key, value) => {
      if (typeof value === 'string') strings.push(value);
      return value;
    });
    expect(strings.length).toBeGreaterThan(5);
    for (const value of strings) {
      expect(value).not.toContain(project.root);
      expect(value).not.toMatch(/^([A-Za-z]:[\\/]|\/)/);
    }
  });

  it('P12b treats a meta file in the old absolute-path format as a cache miss (#9)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });
    const [meta] = metaFiles(await project.files(project.outputDir));
    const parsed = JSON.parse(fs.readFileSync(meta, 'utf8'));
    delete parsed.version;
    fs.writeFileSync(meta, JSON.stringify(parsed));

    const logs = captureLogs();
    await optimize({}, { cwd: project.root });
    expect(logs.text()).toContain('Processed: 1');
    expect(JSON.parse(fs.readFileSync(meta, 'utf8')).version).toBeTypeOf('number');
  });

  it('P13 reuses cached output on a second run', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });
    const variant = (await project.files(project.outputDir)).find((f) => f.endsWith('-400.webp'))!;
    const mtime = fs.statSync(variant).mtimeMs;

    const logs = captureLogs();
    await optimize({}, { cwd: project.root });

    expect(logs.text()).toContain('Processed: 0');
    expect(logs.text()).toContain('Cached: 1');
    expect(fs.statSync(variant).mtimeMs).toBe(mtime);
  });

  it('rebuilds a cached image when one of its variant files was deleted (R4-005)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });
    const avif = (await project.files(project.outputDir)).find((f) => f.endsWith('-200.avif'))!;
    fs.rmSync(avif);

    const logs = captureLogs();
    await optimize({}, { cwd: project.root });
    expect(logs.text()).toContain('Processed: 1');
    expect(fs.existsSync(avif)).toBe(true);
  });

  it('P14 replaces the previous version when the source changes', async () => {
    const project = makeProject();
    const src = path.join(project.imagesDir, 'hero.jpg');
    await makeJpeg(src);
    captureLogs();
    await optimize({}, { cwd: project.root });
    const [before] = metaFiles(await project.files(project.outputDir));

    await makeJpeg(src, { color: { r: 10, g: 200, b: 10 } });
    await optimize({}, { cwd: project.root });

    const after = metaFiles(await project.files(project.outputDir));
    expect(after).toHaveLength(1);
    expect(META_RE.exec(after[0])![1]).not.toBe(META_RE.exec(before)![1]);
    const imagesOut = path.join(project.outputDir, 'images');
    const versionDirs = fs
      .readdirSync(imagesOut)
      .filter((e) => fs.statSync(path.join(imagesOut, e)).isDirectory());
    expect(versionDirs).toHaveLength(1);
  });

  it('P15 rebuilds on a quality change but not on a concurrency-only change (#4)', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });
    const [first] = metaFiles(await project.files(project.outputDir));

    project.writeConfig({ ...DEFAULT_PROJECT_CONFIG, qualities: { avif: 30, webp: 60 } });
    await optimize({}, { cwd: project.root });
    const afterQuality = metaFiles(await project.files(project.outputDir));
    expect(afterQuality).toHaveLength(1);
    expect(META_RE.exec(afterQuality[0])![2]).not.toBe(META_RE.exec(first)![2]);
    expect(fs.existsSync(first)).toBe(false);

    project.writeConfig({
      ...DEFAULT_PROJECT_CONFIG,
      qualities: { avif: 30, webp: 60 },
      concurrency: 2,
    });
    const logs = captureLogs();
    await optimize({}, { cwd: project.root });
    expect(logs.text()).toContain('Cached: 1');
    expect(metaFiles(await project.files(project.outputDir))).toEqual(afterQuality);
  });
});
