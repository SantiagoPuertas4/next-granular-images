import path from 'path';
import fs from 'fs';
import createJiti from 'jiti';
import { createRequire } from 'module';
import { GranularImagesConfig } from '../../types/config';
import { validateConfig, ConfigError } from '../core/validate';

// ============================================================================
// CONFIG FILE LOADING
// ============================================================================

export const loadConfig = async (
  rootDir: string = process.cwd()
): Promise<GranularImagesConfig> => {
  const configPath = path.join(rootDir, 'next-granular-images.config.ts');

  if (!fs.existsSync(configPath)) {
    const jsPath = path.join(rootDir, 'next-granular-images.config.js');
    if (fs.existsSync(jsPath)) {
      return loadAndValidate(jsPath);
    }
    // There are no safe defaults for the encoder settings (qualities/effort),
    // so a missing config is an error rather than a silent guess.
    throw new ConfigError([
      `No next-granular-images.config.ts or next-granular-images.config.js found in ${rootDir}. Run "npx next-granular-images init" to create one.`,
    ]);
  }

  return loadAndValidate(configPath);
};

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

const loadAndValidate = (filePath: string): GranularImagesConfig => {
  try {
    // No caching: the file must be re-read every time it is loaded (the config
    // can change between runs in the same process, e.g. init --build, watch
    // scripts or programmatic use).
    const jiti = createJiti(__filename, { cache: false, requireCache: false });
    // jiti hands plain CommonJS files to Node's require, which keeps its own
    // cache regardless of requireCache.
    delete createRequire(filePath).cache[filePath];
    const userConfig = jiti(filePath);

    const config = userConfig.default || userConfig;

    return validateConfig(config);
  } catch (error) {
    // Callers decide how to report it (the CLI prints the messages and exits 1;
    // `clean` carries on without a config).
    if (error instanceof ConfigError) throw error;
    throw new ConfigError([
      `Could not load ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
};
