import path from 'path';
import fs from 'fs';
import { loadConfig } from '../utils/config-loader';
import { processImage, ProcessedImageResult } from '../core/processor';
import { generateTypeScriptFile, generateConfigTypes } from '../core/generator';
import {
  getFileHash,
  generateCompositeHash,
  getConfigHash,
} from '../utils/hash';
import { getOutputPath } from '../utils/paths';
import { getFiles, cleanOldVersions } from '../utils/fs-helpers';
import { logger } from '../utils/logger';
import { CliExit, type CommandContext } from '../utils/errors';
import { isProcessableImage } from '../core/files';
import { assertOutputInsidePublic } from '../core/validate';
import { readMeta, serializeMeta } from '../core/meta';
import { pickServedVariant, summarizeSavings } from '../core/report';
import type { QualityValue } from '../../types/config';

export const optimize = async (
  options: { fast?: boolean; dev?: boolean; report?: boolean } = {},
  { cwd = process.cwd() }: CommandContext = {}
) => {
  const startTime = Date.now();
  logger.info('🚀 Starting Next Granular Images (Optimize)...');

  // ============================================================================
  // CONFIGURATION & SETUP
  // ============================================================================

  const config = await loadConfig(cwd);
  const { initializeQueue } = await import('../core/queue');

  if (options.fast) {
    logger.warn('⚡ Fast mode enabled: WebP only (Q:15, E:1)');
    config.qualities = { webp: 15 };
    config.effort = { webp: 1 };
  } else if (options.dev) {
    logger.warn('🛠️ Dev mode enabled: Half quality, Effort 1');
    if (config.qualities.avif)
      config.qualities.avif = Math.max(
        1,
        Math.floor(config.qualities.avif / 2)
      ) as QualityValue;
    if (config.qualities.webp)
      config.qualities.webp = Math.max(
        1,
        Math.floor(config.qualities.webp / 2)
      ) as QualityValue;
    if (config.effort.avif) config.effort.avif = 1;
    if (config.effort.webp) config.effort.webp = 1;
  }

  assertOutputInsidePublic(cwd, config.paths.output);

  const inputDir = path.resolve(cwd, config.paths.input);
  const outputDir = path.resolve(cwd, config.paths.output);
  const typesDir = path.resolve(cwd, config.paths.types);

  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.mkdir(typesDir, { recursive: true });

  // ============================================================================
  // FILE SCANNING
  // ============================================================================

  logger.debug(`Scanning ${config.paths.input}...`);
  if (!fs.existsSync(inputDir)) {
    logger.error(`Input directory not found: ${inputDir}`);
    throw new CliExit(1);
  }

  const files = await getFiles(inputDir);
  const imageFiles = files.filter((f) =>
    isProcessableImage(f, { outputDir, exclusions: config.exclusions })
  );

  logger.success(`Found ${imageFiles.length} images.`);

  // ============================================================================
  // DUPLICATE VALIDATION
  // ============================================================================

  const hashRegistry = new Map<string, string[]>();
  const nameRegistry = new Map<string, string>();
  const nameCollisions: string[] = [];

  logger.debug('Verifying duplicates...');

  await Promise.all(
    imageFiles.map(async (file) => {
      // Content Hash Check
      const hash = await getFileHash(file);
      if (hashRegistry.has(hash)) {
        hashRegistry.get(hash)!.push(file);
      } else {
        hashRegistry.set(hash, [file]);
      }

      // Name Collision Check
      const relativePath = path.relative(inputDir, file);
      const parsed = path.parse(relativePath);
      const uniqueKey = path.join(parsed.dir, parsed.name);

      if (nameRegistry.has(uniqueKey)) {
        nameCollisions.push(
          `- ${relativePath} matches ${path.relative(
            inputDir,
            nameRegistry.get(uniqueKey)!
          )}`
        );
      } else {
        nameRegistry.set(uniqueKey, file);
      }
    })
  );

  // ============================================================================
  // DUPLICATE REPORTING
  // ============================================================================

  let hasContentDuplicates = false;
  for (const [hash, files] of hashRegistry.entries()) {
    if (files.length > 1) {
      if (!hasContentDuplicates) {
        logger.error('\nError: Duplicate image content found.');
        logger.error('The following files are identical:');
        hasContentDuplicates = true;
      }
      logger.warn(`- Hash ${hash}:`);
      files.forEach((f) => logger.log(`  ${path.relative(inputDir, f)}`));
    }
  }

  if (nameCollisions.length > 0) {
    logger.error('\nError: Duplicate image names found.');
    logger.error(
      'The library generates variables based on filenames (ignoring extensions).'
    );
    nameCollisions.forEach((d) => logger.warn(d));
  }

  if (hasContentDuplicates || nameCollisions.length > 0) {
    throw new CliExit(1);
  }

  initializeQueue(config);

  // ============================================================================
  // PROCESSING SETUP
  // ============================================================================

  const configHash = getConfigHash(config);
  const processedByDir: Record<
    string,
    Array<{ name: string; data: ProcessedImageResult; relativePath: string }>
  > = {};
  const validOutputFiles = new Set<string>();

  let processedCount = 0;
  let cachedCount = 0;

  const savingsByBreakpoint: Record<
    string,
    { original: number; optimized: number }
  > = {};
  const errors: Array<{ file: string; error: unknown }> = [];

  const sortedBreakpoints = Object.entries(config.breakpoints).sort(
    ([, a], [, b]) => a - b
  );

  sortedBreakpoints.forEach(([name]) => {
    savingsByBreakpoint[name] = { original: 0, optimized: 0 };
  });

  const tasks = imageFiles.map(async (filePath) => {
    try {
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

      const parentDir = path.dirname(outputBase);
      await cleanOldVersions(parentDir, parsed.name, compositeHash);

      const fallbackFilename = `${parsed.name}-${compositeHash}${parsed.ext}`;
      const fallbackPath = path.join(outputBase, fallbackFilename);
      const metaPath = `${outputBase}.meta.json`;

      let result: ProcessedImageResult;
      const cached =
        fs.existsSync(metaPath) && fs.existsSync(fallbackPath)
          ? await readMeta(metaPath, outputDir)
          : undefined;

      if (cached?.ok) {
        cachedCount++;
        result = cached.result;
      } else {
        logger.info(`Processing: ${relativePath}`);

        if (parsed.ext.toLowerCase() === '.svg') {
          const svgDir = outputBase;
          await fs.promises.mkdir(svgDir, { recursive: true });
          const dest = path.join(svgDir, fallbackFilename);
          await fs.promises.copyFile(filePath, dest);

          result = {
            originalWidth: 0,
            originalHeight: 0,
            hasAlpha: true,
            variants: {
              avif: {},
              webp: {},
              original: dest,
            },
          };
        } else {
          result = await processImage(
            filePath,
            outputBase,
            compositeHash,
            config
          );
        }

        await fs.promises.writeFile(metaPath, serializeMeta(result, outputDir));
        processedCount++;
      }

      validOutputFiles.add(path.resolve(metaPath));
      if (result.variants.original)
        validOutputFiles.add(path.resolve(result.variants.original));
      Object.values(result.variants.avif).forEach((p) =>
        validOutputFiles.add(path.resolve(p))
      );
      Object.values(result.variants.webp).forEach((p) =>
        validOutputFiles.add(path.resolve(p))
      );

      const dirKey = parsed.dir || '.';
      if (!processedByDir[dirKey]) processedByDir[dirKey] = [];

      processedByDir[dirKey].push({
        name: parsed.name,
        data: result,
        relativePath,
      });

      const originalSize = (await fs.promises.stat(filePath)).size;

      // Savings report: what a visitor at each breakpoint downloads (the
      // browser picks AVIF first, then WebP) versus the original file.
      let previousWidth = 0;
      for (const [bpName, bpWidth] of sortedBreakpoints) {
        const target =
          previousWidth === 0 ? bpWidth : Math.floor((previousWidth + bpWidth) / 2);
        const served = pickServedVariant(result.variants, target);
        const servedSize =
          served && fs.existsSync(served)
            ? (await fs.promises.stat(served)).size
            : originalSize;
        savingsByBreakpoint[bpName].original += originalSize;
        savingsByBreakpoint[bpName].optimized += servedSize;
        previousWidth = bpWidth;
      }
    } catch (err) {
      logger.error(`Failed to process ${filePath}:`, err);
      errors.push({ file: filePath, error: err });
    }
  });

  await Promise.allSettled(tasks);

  if (errors.length > 0) {
    logger.error(`\n⚠️  ${errors.length} images failed to process:`);
    errors.forEach((e) =>
      logger.log(
        `  - ${path.relative(inputDir, e.file)}: ${e.error instanceof Error ? e.error.message : String(e.error)}`
      )
    );
  }

  if (options.report) {
    logger.newLine();
    logger.info('📊 Savings Report:');
    logger.table(summarizeSavings(savingsByBreakpoint));
  }

  // ============================================================================
  // ORPHAN FILE CLEANUP
  // ============================================================================

  if (fs.existsSync(outputDir)) {
    const allOutputFiles = await getFiles(outputDir);
    const orphans = allOutputFiles.filter((f) => !validOutputFiles.has(f));

    if (orphans.length > 0) {
      logger.warn(
        `\n⚠️  Found ${orphans.length} orphaned files in output directory:`
      );
      const orphanLimit = 10;
      orphans
        .slice(0, orphanLimit)
        .forEach((f) => logger.log(`  ${path.relative(outputDir, f)}`));
      if (orphans.length > orphanLimit)
        logger.log(`  ...and ${orphans.length - orphanLimit} more.`);
      logger.warn(
        'Run "next-granular-images clean" to wipe the output directory if needed.'
      );
    }
  }

  // ============================================================================
  // TYPE GENERATION
  // ============================================================================

  logger.debug('Generating TypeScript definitions...');

  await generateConfigTypes(typesDir, config.breakpoints);

  for (const [dir, images] of Object.entries(processedByDir)) {
    const targetDir = path.join(typesDir, dir);
    await generateTypeScriptFile(targetDir, images, {
      publicRoot: path.join(cwd, 'public'),
    });
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.newLine();
  logger.success(`✨ Done in ${duration}s`);
  logger.log(`Processed: ${processedCount}`);
  logger.log(`Cached: ${cachedCount}`);
};
