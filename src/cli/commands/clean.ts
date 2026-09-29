import fs from 'fs';
import path from 'path';
import { loadConfig } from '../utils/config-loader';
import { logger } from '../utils/logger';
import type { CommandContext } from '../utils/errors';
import type { GranularImagesConfig } from '../../types/config';
import { ConfigError, DEFAULT_PATHS } from '../core/validate';
import { isInsideDir } from '../core/files';
import { removeImageTypes } from '../core/generator';

const CONFIG_FILES = ['next-granular-images.config.ts', 'next-granular-images.config.js'];

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

  let paths: Pick<GranularImagesConfig['paths'], 'output' | 'types'>;
  try {
    paths = (await loadConfig(cwd)).paths;
  } catch (e) {
    paths = DEFAULT_PATHS;
    logger.warn('Could not load configuration:');
    if (e instanceof ConfigError) e.messages.forEach((msg) => logger.warn(`  - ${msg}`));
    logger.warn(
      `Falling back to the default paths: output "${DEFAULT_PATHS.output}", types "${DEFAULT_PATHS.types}".`
    );
  }

  const outputDir = path.resolve(cwd, paths.output);
  const typesDir = path.resolve(cwd, paths.types);
  const cleanArtifacts = options.all || (!options.image && !options.breakpoints);

  // Only delete whole directories that are inside the project and have
  // "next-granular-images" in their project-relative path.
  const isSafePath = (p: string) =>
    isInsideDir(p, cwd) && p !== cwd && path.relative(cwd, p).includes('next-granular-images');

  const remove = async (target: string, label: string) => {
    if (!fs.existsSync(target)) return false;
    if (options.dryRun) {
      logger.info(`Would delete: ${target}`);
      return false;
    }
    await fs.promises.rm(target, { recursive: true, force: true });
    logger.success(label);
    return true;
  };

  if (options.dryRun) {
    logger.info('DRY RUN MODE - No files will be deleted');
    logger.newLine();
  }

  // ==========================================================================
  // CLEAN OUTPUT DIRECTORY
  // ==========================================================================

  if (cleanArtifacts || options.image) {
    if (isSafePath(outputDir)) {
      logger.debug(`Cleaning output directory: ${outputDir}`);
      await remove(outputDir, 'Output directory cleaned.');
    } else {
      logger.warn(
        `SKIPPED: Output directory path '${outputDir}' does not contain 'next-granular-images'. Safety check failed.`
      );
    }
  }

  // ==========================================================================
  // CLEAN TYPES DIRECTORY
  // ==========================================================================

  if (cleanArtifacts) {
    if (isSafePath(typesDir)) {
      logger.debug(`Cleaning types directory: ${typesDir}`);
      await remove(typesDir, 'Types directory cleaned.');
    } else {
      logger.warn(
        `SKIPPED: Types directory path '${typesDir}' does not contain 'next-granular-images'. Safety check failed.`
      );
    }
  } else if (options.image) {
    // Every images.gen.ts (root and nested); config.d.ts and other files stay.
    const removed = await removeImageTypes(typesDir, { dryRun: options.dryRun });
    if (options.dryRun) removed.forEach((file) => logger.info(`Would delete: ${file}`));
    else logger.success('Image types cleaned (config kept).');
  }

  // ==========================================================================
  // CLEAN BREAKPOINT CONFIG
  // ==========================================================================

  if (options.breakpoints && !cleanArtifacts) {
    await remove(path.join(typesDir, 'config.d.ts'), 'config.d.ts removed.');
  }

  // ==========================================================================
  // CLEAN CONFIGURATION FILE
  // ==========================================================================

  if (options.all) {
    for (const name of CONFIG_FILES) {
      if (await remove(path.join(cwd, name), `Configuration file removed (${name}).`)) {
        logger.info('Project restored to initial state.');
      }
    }
  }
};
