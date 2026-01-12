import path from 'path';

export const normalizePath = (p: string): string => {
  return p.split(path.sep).join('/');
};

export const getRelativePath = (from: string, to: string): string => {
  return normalizePath(path.relative(from, to));
};

export const getOutputPath = (
  originalPath: string,
  inputDir: string,
  outputDir: string,
  hash: string,
  extension: string
): string => {
  const relative = path.relative(inputDir, originalPath);
  const parsed = path.parse(relative);

  let ext = '';
  if (extension) {
    ext = extension.startsWith('.') ? extension : `.${extension}`;
  }

  return path.join(outputDir, parsed.dir, `${parsed.name}-${hash}${ext}`);
};
