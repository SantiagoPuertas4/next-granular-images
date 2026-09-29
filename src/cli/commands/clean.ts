import fs from 'fs';
import path from 'path';
import { loadConfig } from '../utils/config-loader';
import { logger } from '../utils/logger';
import type { CommandContext } from '../utils/errors';

export const clean = async (
  options: {
    image?: boolean;
    breakpoints?: boolean;
    all?: boolean;
    dryRun?: boolean;
  } = {},
  { cwd = process.cwd() }: CommandContext = {}
) => {
  // ==========================================================================
  // CONFIGURATION LOADING
  // ==========================================================================

  let config;
  try {
    config = await loadConfig(cwd);
  } catch {
    logger.warn(
      'Could not load configuration. Some directories might not be cleaned.'
    );
  }

  const outputDir = config
    ? path.resolve(cwd, config.paths.output)
    : undefined;
  const typesDir = config
    ? path.resolve(cwd, config.paths.types)
    : undefined;
  const configPath = path.resolve(
    cwd,
    'next-granular-images.config.ts'
  );
  const cleanArtifacts =
    options.all || (!options.image && !options.breakpoints);
  const isSafePath = (p: string) => p.includes('next-granular-images');

  // ==========================================================================
  // DRY RUN MODE CHECK
  // ==========================================================================

  if (options.dryRun) {
    logger.info('DRY RUN MODE - No files will be deleted');
    logger.newLine();
  }

  // ==========================================================================
  // CLEAN OUTPUT DIRECTORY
  // ==========================================================================

  if ((cleanArtifacts || options.image) && outputDir) {
    if (isSafePath(outputDir)) {
      logger.debug(`Cleaning output directory: ${outputDir}`);
      if (fs.existsSync(outputDir)) {
        if (!options.dryRun) {
          await fs.promises.rm(outputDir, { recursive: true, force: true });
          logger.success('Output directory cleaned.');
        } else {
          logger.info(`Would delete: ${outputDir}`);
        }
      } else {
        logger.debug('Output directory does not exist.');
      }
    } else {
      logger.warn(
        `SKIPPED: Output directory path '${outputDir}' does not contain 'next-granular-images'. Safety check failed.`
      );
    }
  }

  // ==========================================================================
  // CLEAN TYPES DIRECTORY
  // ==========================================================================

  if ((cleanArtifacts || options.image) && typesDir) {
    const cleanTypesAll =
      options.all || (!options.image && !options.breakpoints);

    if (cleanTypesAll) {
      if (isSafePath(typesDir)) {
        logger.debug(`Cleaning types directory: ${typesDir}`);
        if (fs.existsSync(typesDir)) {
          if (!options.dryRun) {
            await fs.promises.rm(typesDir, { recursive: true, force: true });
            logger.success('Types directory cleaned.');
          } else {
            logger.info(`Would delete: ${typesDir}`);
          }
        }
      } else {
        logger.warn(
          `SKIPPED: Types directory path '${typesDir}' does not contain 'next-granular-images'. Safety check failed.`
        );
      }
    } else if (options.image) {
      if (fs.existsSync(typesDir)) {
        const entries = await fs.promises.readdir(typesDir, {
          withFileTypes: true,
        });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(typesDir, entry.name);
            if (isSafePath(typesDir)) {
              if (!options.dryRun) {
                await fs.promises.rm(fullPath, {
                  recursive: true,
                  force: true,
                });
              } else {
                logger.info(`Would delete: ${fullPath}`);
              }
            }
          }
        }
        if (!options.dryRun) {
          logger.success('Image types cleaned (config kept).');
        }
      }
    }
  }

  // ==========================================================================
  // CLEAN BREAKPOINT CONFIG
  // ==========================================================================

  if (options.breakpoints && typesDir) {
    const configGenPath = path.join(typesDir, 'config.d.ts');
    if (fs.existsSync(configGenPath)) {
      if (!options.dryRun) {
        await fs.promises.rm(configGenPath);
        logger.success('config.d.ts removed.');
      } else {
        logger.info(`Would delete: ${configGenPath}`);
      }
    }
  }

  // ==========================================================================
  // CLEAN CONFIGURATION FILE
  // ==========================================================================

  if (options.all) {
    if (fs.existsSync(configPath)) {
      if (!options.dryRun) {
        await fs.promises.rm(configPath);
        logger.success(
          'Configuration file removed (next-granular-images.config.ts).'
        );
        logger.info('Project restored to initial state.');
      } else {
        logger.info(`Would delete: ${configPath}`);
      }
    }
  }
};
