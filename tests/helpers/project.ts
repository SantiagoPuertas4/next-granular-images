import fs from 'fs';
import path from 'path';
import { vi } from 'vitest';
import { FAST_CONFIG } from './images';
import { makeTempDir } from './tmp';
import { logger } from '../../src/cli/utils/logger';
import { getFiles } from '../../src/cli/utils/fs-helpers';

export interface TempProject {
  root: string;
  publicDir: string;
  imagesDir: string;
  outputDir: string;
  typesDir: string;
  writeConfig: (config: Record<string, unknown>) => void;
  files: (dir: string) => Promise<string[]>;
}

export const DEFAULT_PROJECT_CONFIG = {
  ...FAST_CONFIG,
  breakpoints: { sm: 640, md: 768 },
  paths: {
    input: 'public',
    output: 'public/next-granular-images',
    types: 'src/generated/next-granular-images',
  },
};

/** A temp Next.js-like project with a CommonJS config file. */
export const makeProject = (config: Record<string, unknown> = DEFAULT_PROJECT_CONFIG): TempProject => {
  const root = makeTempDir('ngi-proj-');
  const publicDir = path.join(root, 'public');
  const imagesDir = path.join(publicDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }));
  const project: TempProject = {
    root,
    publicDir,
    imagesDir,
    outputDir: path.join(root, 'public', 'next-granular-images'),
    typesDir: path.join(root, 'src', 'generated', 'next-granular-images'),
    writeConfig: (cfg) =>
      fs.writeFileSync(
        path.join(root, 'next-granular-images.config.js'),
        `module.exports = ${JSON.stringify(cfg, null, 2)};\n`
      ),
    files: async (dir) => (fs.existsSync(dir) ? (await getFiles(dir)).sort() : []),
  };
  project.writeConfig(config);
  return project;
};

const calls: Array<{ level: string; text: string }> = [];

const joinLines = (entries: Array<{ text: string }>) => entries.map((c) => c.text).join('\n');

/**
 * Silences console output and records every logger call as plain text.
 * Calling it again in the same test starts a fresh recording.
 */
export const captureLogs = () => {
  calls.length = 0;
  if (!vi.isMockFunction(logger.info)) install();
  return {
    calls,
    text: () => joinLines(calls),
    errors: () => joinLines(calls.filter((c) => c.level === 'error')),
    warnings: () => joinLines(calls.filter((c) => c.level === 'warn')),
  };
};

const install = () => {
  for (const method of ['log', 'warn', 'error', 'table'] as const) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
  for (const level of ['debug', 'info', 'success', 'warn', 'error', 'log'] as const) {
    const original = logger[level].bind(logger);
    vi.spyOn(logger, level).mockImplementation((message: string, ...args: unknown[]) => {
      calls.push({ level, text: [message, ...args.map(String)].join(' ') });
      original(message, ...args);
    });
  }
};
