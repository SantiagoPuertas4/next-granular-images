import { spawnSync } from 'child_process';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
export const CLI_CJS = path.join(repoRoot, 'dist', 'cli', 'index.js');
export const CLI_ESM = path.join(repoRoot, 'dist', 'cli', 'index.mjs');

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the built CLI in a child process, as a user would. */
export const runCli = (
  cwd: string,
  args: string[],
  { env = {}, entry = CLI_CJS }: { env?: Record<string, string>; entry?: string } = {}
): CliResult => {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', LOG_LEVEL: '', QUIET: '', ...env },
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};
