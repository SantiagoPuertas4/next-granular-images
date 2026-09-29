import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach } from 'vitest';

const created: string[] = [];

/** Creates a temp dir that is removed after the current test. */
export const makeTempDir = (prefix = 'ngi-'): string => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  created.push(dir);
  return dir;
};

afterEach(async () => {
  while (created.length) {
    const dir = created.pop()!;
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});

export const writeFile = (file: string, content: string | Buffer = ''): string => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};
