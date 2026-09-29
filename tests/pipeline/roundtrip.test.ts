import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { optimize } from '../../src/cli/commands/optimize';
import { readMeta } from '../../src/cli/core/meta';
import { isInsideDir } from '../../src/cli/core/files';
import { makeJpeg } from '../helpers/images';
import { captureLogs, makeProject, type TempProject } from '../helpers/project';

const genFile = (project: TempProject) => path.join(project.typesDir, 'images', 'images.gen.ts');

/** Every URL in a generated module: `src` values and each `srcset` candidate. */
const urlsIn = (source: string): string[] => {
  const urls: string[] = [];
  for (const [, value] of source.matchAll(/(?:src|avif|webp): "([^"]+)"/g)) {
    for (const candidate of value.split(', ')) urls.push(candidate.split(' ')[0]);
  }
  return urls;
};

const urlToFile = (project: TempProject, url: string) =>
  path.join(project.publicDir, ...url.slice(1).split('/').map(decodeURIComponent));

describe('optimize -> meta -> generated URLs round trip', () => {
  it('meta paths and generated URLs resolve to the real output files, also on a cache hit', async () => {
    const project = makeProject();
    await makeJpeg(path.join(project.imagesDir, 'hero shot.jpg'));
    captureLogs();
    await optimize({}, { cwd: project.root });

    const [metaPath] = (await project.files(project.outputDir)).filter((f) =>
      f.endsWith('.meta.json')
    );

    // The stored paths are relative to the output directory itself.
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const stored: string[] = [
      raw.variants.original,
      ...Object.values<string>(raw.variants.avif),
      ...Object.values<string>(raw.variants.webp),
    ];
    expect(stored.length).toBeGreaterThan(5);
    for (const rel of stored) {
      expect(fs.existsSync(path.resolve(project.outputDir, rel))).toBe(true);
    }

    // readMeta turns them back into the absolute paths of those files.
    const meta = await readMeta(metaPath, project.outputDir);
    expect(meta.ok).toBe(true);
    if (!meta.ok) return;
    const resolved = [
      meta.result.variants.original,
      ...Object.values(meta.result.variants.avif),
      ...Object.values(meta.result.variants.webp),
    ];
    expect(resolved).toHaveLength(stored.length);
    for (const file of resolved) {
      expect(isInsideDir(file, project.outputDir)).toBe(true);
      expect(fs.existsSync(file)).toBe(true);
    }

    // Every generated URL points at an existing file under public/.
    const firstGen = fs.readFileSync(genFile(project), 'utf8');
    const urls = urlsIn(firstGen);
    expect(urls).toHaveLength(stored.length);
    for (const url of urls) expect(fs.existsSync(urlToFile(project, url))).toBe(true);

    // A cache-hit run (types rebuilt from the meta file) yields the same URLs.
    fs.rmSync(project.typesDir, { recursive: true });
    const logs = captureLogs();
    await optimize({}, { cwd: project.root });
    expect(logs.text()).toContain('Cached: 1');
    expect(fs.readFileSync(genFile(project), 'utf8')).toBe(firstGen);
  });
});
