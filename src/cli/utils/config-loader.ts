import path from 'path';
import fs from 'fs';
import createJiti from 'jiti';
import { GranularImagesConfig } from '../../types/config';
import { validateConfig, ConfigError } from '../core/validate';
import { logger } from './logger';

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
    logger.warn(`No config file found at ${configPath}. Using defaults.`);
    return validateConfig({});
  }

  return loadAndValidate(configPath);
};

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

const loadAndValidate = (filePath: string): GranularImagesConfig => {
  try {
    const jiti = createJiti(__filename);
    const userConfig = jiti(filePath);

    const config = userConfig.default || userConfig;

    return validateConfig(config);
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.error('Error loading configuration:');
      error.messages.forEach((msg) => {
        logger.error(`  - ${msg}`);
      });
      process.exit(1);
    }

    logger.error('Error loading configuration:');
    logger.error(String(error));
    throw new Error('Invalid configuration', { cause: error });
  }
};
