/**
 * Thrown by commands instead of calling `process.exit` directly, so they can
 * run in-process (tests, programmatic use). `cli/index.ts` turns it into an
 * exit code.
 */
export class CliExit extends Error {
  constructor(public readonly code: number, message?: string) {
    super(message ?? `Exit with code ${code}`);
    this.name = 'CliExit';
  }
}

export interface CommandContext {
  /** Project root. Defaults to `process.cwd()`. */
  cwd?: string;
}
