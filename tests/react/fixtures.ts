import type { GeneratedImage } from '../../src/client';

/** A GeneratedImage like the ones in images.gen.ts. */
export const img = (
  name: string,
  { avif = true, webp = true, ext = 'jpg', width = 800, height = 400 } = {}
): GeneratedImage => ({
  src: `/ngi/${name}.${ext}`,
  width,
  height,
  variants: {
    avif: avif ? `/ngi/${name}-16.avif 16w, /ngi/${name}-400.avif 400w` : undefined,
    webp: webp ? `/ngi/${name}-16.webp 16w, /ngi/${name}-400.webp 400w` : undefined,
  },
});
