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
import { readMeta } from '../core/meta';
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
  if (generateImages) {
    const sourceFiles = fs.existsSync(inputDir) ? await getFiles(inputDir) : [];
    const imageFiles = sourceFiles.filter((f) =>
      isProcessableImage(f, { outputDir, exclusions: config.exclusions })
    );

    for (const filePath of imageFiles) {
      const relativePath = path.relative(inputDir, filePath);
      const parsed = path.parse(relativePath);
      const fileHash = await getFileHash(filePath);
      const metaPath = await findMetaFile(
        path.join(outputDir, parsed.dir),
        parsed.name,
        fileHash
      );

      if (!metaPath) {
        logger.warn(`No optimized output for ${relativePath}. Run "next-granular-images optimize".`);
        continue;
      }

      const meta = await readMeta(metaPath, outputDir);
      if (!meta.ok) {
        logger.warn(
          `Skipping ${relativePath}: ${path.relative(outputDir, metaPath)} is ${
            meta.reason === 'outdated' ? 'from an older version' : 'not valid JSON'
          }. Run "next-granular-images optimize".`
        );
        continue;
      }

      const dirKey = parsed.dir || '.';
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

  if (generateImages) {
    await writeImageTypes(typesDir, processedByDir, {
      publicRoot: path.join(cwd, 'public'),
      breakpoints: config.breakpoints,
    });
    logger.success('Image types generated.');
  }
};

/** Newest `<name>-<fileHash>-<configHash>.meta.json` in `dir`, if any. */
const findMetaFile = async (
  dir: string,
  name: string,
  fileHash: string
): Promise<string | undefined> => {
  if (!fs.existsSync(dir)) return undefined;
  const prefix = `${name}-${fileHash}-`;
  const suffix = '.meta.json';
  const isMetaOf = (entry: string) =>
    entry.startsWith(prefix) &&
    entry.endsWith(suffix) &&
    /^[0-9a-f]{8}$/.test(entry.slice(prefix.length, -suffix.length));
  const matches = (await fs.promises.readdir(dir))
    .filter(isMetaOf)
    .map((entry) => path.join(dir, entry));
  if (matches.length <= 1) return matches[0];
  const withTimes = await Promise.all(
    matches.map(async (file) => ({ file, mtime: (await fs.promises.stat(file)).mtimeMs }))
  );
  return withTimes.sort((a, b) => b.mtime - a.mtime)[0].file;
};
