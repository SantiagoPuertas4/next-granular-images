import path from 'path';
import fs from 'fs';
import { writeImageTypes, generateConfigTypes } from '../core/generator';
import { loadConfig } from '../utils/config-loader';
import { ProcessedImageResult } from '../core/processor';
import { getFiles } from '../utils/fs-helpers';
import { logger } from '../utils/logger';
import { CliExit, type CommandContext } from '../utils/errors';
import { isProcessableImage } from '../core/files';
import { assertOutputInsidePublic } from '../core/validate';
import { findMetaFile, readMeta } from '../core/meta';
import { getFileHash } from '../utils/hash';

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
  assertOutputInsidePublic(cwd, config.paths.output);

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
  // FIND THE META FILE OF EVERY SOURCE IMAGE
  // ==========================================================================

  // Metas are looked up by name and file hash, not by recomputing the config
  // hash: output from `optimize --fast`/`--dev` uses a different config hash
  // and must still be found.
  // Source directories with at least one image whose meta is missing or
  // unusable: their existing images.gen.ts is kept as it is, so imports of the
  // missing images do not break.
  const failedDirs = new Set<string>();
  const failures: string[] = [];
  let metaCount = 0;
  let sourceCount = 0;

  if (generateImages) {
    const sourceFiles = fs.existsSync(inputDir) ? await getFiles(inputDir) : [];
    const imageFiles = sourceFiles.filter((f) =>
      isProcessableImage(f, { outputDir, exclusions: config.exclusions })
    );
    sourceCount = imageFiles.length;

    for (const filePath of imageFiles) {
      const relativePath = path.relative(inputDir, filePath);
      const parsed = path.parse(relativePath);
      const fileHash = await getFileHash(filePath);
      const metaPath = await findMetaFile(
        path.join(outputDir, parsed.dir),
        parsed.name,
        fileHash
      );

      const dirKey = parsed.dir || '.';

      if (!metaPath) {
        logger.warn(`No optimized output for ${relativePath}. Run "next-granular-images optimize".`);
        failedDirs.add(dirKey);
        failures.push(relativePath);
        continue;
      }

      const meta = await readMeta(metaPath, outputDir);
      if (!meta.ok) {
        logger.warn(
          `Skipping ${relativePath}: ${path.relative(outputDir, metaPath)} is ${
            meta.reason === 'outdated' ? 'from an older version' : 'not valid JSON'
          }. Run "next-granular-images optimize".`
        );
        failedDirs.add(dirKey);
        failures.push(relativePath);
        continue;
      }

      metaCount++;
      if (!processedByDir[dirKey]) processedByDir[dirKey] = [];
      processedByDir[dirKey].push({ name: parsed.name, data: meta.result, relativePath });
    }
  }

  // ==========================================================================
  // GENERATE TYPE FILES
  // ==========================================================================

  if (generateBreakpoints) {
    await generateConfigTypes(typesDir, config.breakpoints);
    logger.success('Breakpoint types generated.');
  }

  if (!generateImages) return;

  // With no source images at all, behave like `optimize`: stale
  // images.gen.ts files are removed below. Only sources without usable metas
  // are an error.
  if (sourceCount > 0 && metaCount === 0) {
    logger.error(
      `No optimized images found for ${config.paths.input} in ${config.paths.output}; existing images.gen.ts files were left untouched.`
    );
    logger.info('Run "next-granular-images optimize" to process images.');
    throw new CliExit(1);
  }

  await writeImageTypes(typesDir, processedByDir, {
    publicRoot: path.join(cwd, 'public'),
    breakpoints: config.breakpoints,
    keepDirs: failedDirs,
  });

  if (failures.length > 0) {
    logger.error(
      `${failures.length} image(s) could not be generated (see the warnings above). ` +
        'Existing images.gen.ts files in their folders were left untouched. Run "next-granular-images optimize".'
    );
    throw new CliExit(1);
  }
  logger.success('Image types generated.');
};
