import fs from 'fs';
import path from 'path';

export async function cleanOldVersions(
  dir: string,
  name: string,
  currentHash: string
) {
  if (!fs.existsSync(dir)) return;
  const entries = await fs.promises.readdir(dir);

  for (const entry of entries) {
    const isMeta = entry.endsWith('.meta.json');
    const cleanEntry = isMeta ? entry.replace('.meta.json', '') : entry;

    const expectedPrefix = `${name}-`;
    if (!cleanEntry.startsWith(expectedPrefix)) continue;

    const suffix = cleanEntry.slice(expectedPrefix.length);
    if (suffix.length !== currentHash.length) continue;

    if (suffix === currentHash) continue;

    const fullPath = path.join(dir, entry);

    await fs.promises.rm(fullPath, { recursive: true, force: true });
  }
}

export async function getFiles(dir: string): Promise<string[]> {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    })
  );
  return Array.prototype.concat(...files);
}
