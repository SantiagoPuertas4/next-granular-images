import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error';

interface LoggerOptions {
  level?: LogLevel;
  quiet?: boolean;
  timestamps?: boolean;
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'success', 'warn', 'error'];

/** Unknown or missing levels fall back to `info` so errors are never silenced. */
const parseLevel = (value: string | undefined): LogLevel => {
  const level = value?.trim().toLowerCase();
  return LOG_LEVELS.includes(level as LogLevel) ? (level as LogLevel) : 'info';
};

export class Logger {
  private options: LoggerOptions;
  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    success: 1,
    warn: 2,
    error: 3,
  };

  constructor(options: LoggerOptions = {}) {
    this.options = {
      level: parseLevel(process.env.LOG_LEVEL),
      quiet: process.env.QUIET === 'true',
      timestamps: false,
      ...options,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.options.quiet && level !== 'error') return false;
    const currentLevel = this.levels[this.options.level || 'info'];
    const messageLevel = this.levels[level];
    return messageLevel >= currentLevel;
  }

  private formatMessage(message: string): string {
    if (this.options.timestamps) {
      const timestamp = new Date().toISOString();
      return `[${timestamp}] ${message}`;
    }
    return message;
  }

  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('debug')) return;
    console.log(chalk.gray(this.formatMessage(message)), ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.blue(this.formatMessage(message)), ...args);
  }

  success(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('success')) return;
    console.log(chalk.green(this.formatMessage(`✓ ${message}`)), ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('warn')) return;
    console.warn(chalk.yellow(this.formatMessage(`⚠ ${message}`)), ...args);
  }

  error(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('error')) return;
    console.error(chalk.red(this.formatMessage(`✗ ${message}`)), ...args);
  }

  log(message: string, ...args: unknown[]): void {
    if (this.options.quiet) return;
    console.log(this.formatMessage(message), ...args);
  }

  table(data: Record<string, unknown>): void {
    if (this.options.quiet) return;
    console.table(data);
  }

  newLine(): void {
    if (this.options.quiet) return;
    console.log();
  }

  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  setQuiet(quiet: boolean): void {
    this.options.quiet = quiet;
  }
}

export const logger = new Logger();
