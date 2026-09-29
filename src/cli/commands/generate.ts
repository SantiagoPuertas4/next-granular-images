import path from 'path';
import fs from 'fs';
import { generateTypeScriptFile, generateConfigTypes } from '../core/generator';
import { loadConfig } from '../utils/config-loader';
import { ProcessedImageResult } from '../core/processor';
import { getFiles } from '../utils/fs-helpers';
import { logger } from '../utils/logger';
import { CliExit, type CommandContext } from '../utils/errors';
import { isProcessableImage } from '../core/files';

export const generate = async (
  options: { breakpoints?: boolean; images?: boolean } = {},
  { cwd = process.cwd() }: CommandContext = {}
) => {
  const generateBreakpoints = options.breakpoints || (!options.breakpoints && !options.images);
  const generateImages = options.images || (!options.breakpoints && !options.images);

  logger.info('Generating type definitions...');

  // ==========================================================================
  // CONFIGURATION & VALIDATION
  // ==========================================================================

  const config = await loadConfig(cwd);
  const inputDir = path.resolve(cwd, config.paths.input);
  const outputDir = path.resolve(cwd, config.paths.output);
  const typesDir = path.resolve(cwd, config.paths.types);

  if (!fs.existsSync(outputDir)) {
    logger.error(`Output directory not found: ${outputDir}`);
    logger.info('Run "next-granular-images optimize" first to process images.');
    throw new CliExit(1);
  }

  await fs.promises.mkdir(typesDir, { recursive: true });

  const processedByDir: Record<
    string,
    Array<{ name: string; data: ProcessedImageResult; relativePath: string }>
  > = {};

  // ==========================================================================
  // SCAN EXISTING ARTIFACTS
  // ==========================================================================

  logger.debug(`Scanning artifacts in ${outputDir}...`);
  const allFiles = await getFiles(outputDir);
  const metaFiles = allFiles.filter((f) => f.endsWith('.meta.json'));

  for (const metaFile of metaFiles) {
    const content = await fs.promises.readFile(metaFile, 'utf-8');
    try {
      JSON.parse(content);
    } catch (e) {
      logger.warn(
        `Failed to parse meta file: ${path.relative(outputDir, metaFile)}`
      );
      logger.debug(
        `Error details: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  // ==========================================================================
  // SCAN SOURCE FILES
  // ==========================================================================

  const sourceFiles = await getFiles(inputDir);
  const imageFiles = sourceFiles.filter((f) =>
    isProcessableImage(f, { outputDir, exclusions: config.exclusions })
  );

  const { getFileHash, generateCompositeHash, getConfigHash } = await import(
    '../utils/hash'
  );
  const { getOutputPath } = await import('../utils/paths');

  const configHash = getConfigHash(config);

  // ==========================================================================
  // PROCESS META FILES
  // ==========================================================================

  for (const filePath of imageFiles) {
    const relativePath = path.relative(inputDir, filePath);
    const parsed = path.parse(relativePath);

    const fileHash = await getFileHash(filePath);
    const compositeHash = generateCompositeHash(fileHash, configHash);

    const outputBase = getOutputPath(
      filePath,
      inputDir,
      outputDir,
      compositeHash,
      ''
    );
    const metaPath = `${outputBase}.meta.json`;

    if (fs.existsSync(metaPath)) {
      const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
      const result: ProcessedImageResult = JSON.parse(metaContent);

      const dirKey = parsed.dir || '.';
      if (!processedByDir[dirKey]) processedByDir[dirKey] = [];

      processedByDir[dirKey].push({
        name: parsed.name,
        data: result,
        relativePath,
      });
    }
  }

  // ==========================================================================
  // GENERATE TYPE FILES
  // ==========================================================================

  if (generateBreakpoints) {
    await generateConfigTypes(typesDir, config.breakpoints);
    logger.success('Breakpoint types generated.');
  }

  if (generateImages) {
    for (const [dir, images] of Object.entries(processedByDir)) {
      const targetDir = path.join(typesDir, dir);
      await generateTypeScriptFile(targetDir, images, {
      publicRoot: path.join(cwd, 'public'),
    });
    }
    logger.success('Image types generated.');
  }
};
