import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/cli/utils/config-loader';
import { ConfigError } from '../../src/cli/core/validate';
import { makeTempDir } from '../helpers/tmp';

describe('loadConfig', () => {
  it('loads a TypeScript config with a default export', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, 'next-granular-images.config.ts'),
      `const config: { qualities: { webp: number }; effort: { webp: number } } = {\n  qualities: { webp: 70 },\n  effort: { webp: 3 },\n};\nexport default config;\n`
    );
    const config = await loadConfig(dir);
    expect(config.qualities).toEqual({ webp: 70 });
    expect(config.paths.input).toBe('public');
  });

  it('prefers the .ts config over a .js one', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, 'next-granular-images.config.ts'),
      'export default { qualities: { webp: 11 }, effort: { webp: 1 } };\n'
    );
    fs.writeFileSync(
      path.join(dir, 'next-granular-images.config.js'),
      'module.exports = { qualities: { webp: 22 }, effort: { webp: 1 } };\n'
    );
    expect((await loadConfig(dir)).qualities.webp).toBe(11);
  });

  it('throws a ConfigError for an invalid config instead of exiting the process (#10)', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, 'next-granular-images.config.js'),
      'module.exports = { qualities: { webp: 0 }, effort: { webp: 1 } };\n'
    );
    const err = await loadConfig(dir).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).messages[0]).toContain('qualities.webp');
  });

  it('wraps a config that cannot be evaluated in a ConfigError naming the file', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'next-granular-images.config.js'), 'throw new Error("boom");\n');
    const err = await loadConfig(dir).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).messages[0]).toMatch(/next-granular-images\.config\.js: boom/);
  });

  it('fails with a pointer to init when there is no config file (#1)', async () => {
    const dir = makeTempDir();
    const err = await loadConfig(dir).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).messages[0]).toMatch(/No next-granular-images\.config\.ts.*init/);
  });
});
