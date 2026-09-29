import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { Logger, logger } from '../../src/cli/utils/logger';
import { generateConfigTypes } from '../../src/cli/core/generator';
import { makeTempDir } from '../helpers/tmp';

describe('Logger', () => {
  it.each(['verbose', 'bogus', ''])(
    'U35 still prints errors when LOG_LEVEL=%j is not a known level (#14)',
    (level) => {
      vi.stubEnv('LOG_LEVEL', level);
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const l = new Logger();
      l.error('x');
      l.info('i');
      l.debug('d');
      expect(error).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(1); // info shown, debug hidden: fell back to "info"
    }
  );

  it('honours a valid LOG_LEVEL, case-insensitively', () => {
    vi.stubEnv('LOG_LEVEL', 'ERROR');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const l = new Logger();
    l.warn('w');
    l.error('e');
    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('QUIET=true hides everything except errors', () => {
    vi.stubEnv('QUIET', 'true');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const l = new Logger();
    l.info('i');
    l.log('plain');
    l.newLine();
    l.table({ a: 1 });
    l.error('e');
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('the generator logs through the logger, so quiet mode silences it (#14)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.setQuiet(true);
    try {
      await generateConfigTypes(path.join(makeTempDir(), 'types'), { sm: 640 });
    } finally {
      logger.setQuiet(false);
    }
    expect(log).not.toHaveBeenCalled();
  });
});
