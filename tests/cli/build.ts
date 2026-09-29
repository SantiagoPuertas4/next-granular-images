import { execFileSync } from 'child_process';
import path from 'path';

/** Builds dist/ once so the CLI tests exercise the real bundled binary. */
export default function setup() {
  const root = path.resolve(__dirname, '..', '..');
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'tsup', 'dist', 'cli-default.js')], {
    cwd: root,
    stdio: 'pipe',
  });
}
